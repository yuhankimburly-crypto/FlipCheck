import asyncio
import hashlib
import json
import os
import re
from html.parser import HTMLParser
from typing import Any, Dict, List
from urllib.parse import unquote, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen

from services.data_provider import MarketDataProvider

DONATION_PRICE = -1


class _DaangnMetadataParser(HTMLParser):
    """당근 매물 HTML에서 현재 매물 데이터와 가격 관련 메타 태그를 모은다."""

    def __init__(self) -> None:
        super().__init__()
        self.json_ld_blocks: List[str] = []
        self.remix_context_blocks: List[str] = []
        self.price_meta: List[str] = []
        self._inside_script = False
        self._inside_json_ld = False
        self._current_block: List[str] = []

    def handle_starttag(self, tag: str, attrs: List[tuple[str, str | None]]) -> None:
        attributes = {name.lower(): value or "" for name, value in attrs}
        if tag.lower() == "script":
            self._inside_script = True
            self._inside_json_ld = attributes.get("type", "").split(";", 1)[0].strip().lower() == "application/ld+json"
            self._current_block = []
        elif tag.lower() == "meta" and attributes.get("property", "").lower() == "karrot:embed_view_type:title":
            self.price_meta.append(attributes.get("content", ""))

    def handle_data(self, data: str) -> None:
        if self._inside_script:
            self._current_block.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "script" and self._inside_script:
            block = "".join(self._current_block)
            if self._inside_json_ld:
                self.json_ld_blocks.append(block)
            elif "__remixContext" in block:
                self.remix_context_blocks.append(block)
            self._current_block = []
            self._inside_script = False
            self._inside_json_ld = False


def _is_daangn_host(hostname: str) -> bool:
    """호스트가 진짜 당근 도메인 또는 그 하위 도메인인지 확인한다."""
    normalized = hostname.lower().rstrip(".")
    return normalized == "daangn.com" or normalized.endswith(".daangn.com")


class _DaangnRedirectHandler(HTTPRedirectHandler):
    """매물 페이지 요청이 HTTPS 당근 도메인 밖으로 리다이렉트되지 않게 한다."""

    def redirect_request(self, request, response, code, message, headers, new_url):
        parsed = urlparse(new_url)
        if parsed.scheme.lower() != "https" or not _is_daangn_host(parsed.hostname or ""):
            return None
        return super().redirect_request(request, response, code, message, headers, new_url)


class TavilyProvider(MarketDataProvider):
    """Tavily 검색 결과에서 허용된 당근 매물과 명시된 게시 가격만 추출한다."""

    def __init__(self) -> None:
        """환경 변수의 API 키와 검색 엔드포인트를 보관한다."""
        self.api_key = (os.getenv("TAVILY_API_KEY") or "").strip()
        self.base_url = "https://api.tavily.com/search"

    def build_search_queries(self, query: str) -> List[str]:
        """당근 매물과 일반 웹 검색을 함께 찾도록 검색어 변형을 만든다."""
        cleaned = re.sub(r"\s+", " ", (query or "")).strip()
        if not cleaned:
            return []

        market_site = "site:daangn.com/kr/buy-sell"
        variants = [
            f"{market_site} {cleaned}",
            f"{market_site} {cleaned} 가격",
            f"{market_site} {cleaned} 원",
            f"{market_site} {cleaned} 판매중",
            f"site:daangn.com {cleaned}",
            f"{cleaned} 당근",
            f"{cleaned} 당근마켓",
            f"{market_site} {cleaned} 팝니다",
        ]

        lower_cleaned = cleaned.lower().replace(" ", "")
        if "에어팟" in lower_cleaned or "airpods" in lower_cleaned:
            variants[4:4] = [
                f"{market_site} 에어팟 프로",
                f"{market_site} 에어팟 2세대",
            ]

        unique: List[str] = []
        seen = set()
        for variant in variants:
            variant = re.sub(r"\s+", " ", variant).strip()
            lowered = variant.lower()
            if variant and lowered not in seen:
                seen.add(lowered)
                unique.append(variant)
        return unique[:8]

    def _to_int(self, value: Any) -> int:
        """외부 숫자 값을 정수로 변환하고 잘못된 값은 0으로 처리한다."""
        try:
            return int(float(str(value).replace(",", "")))
        except (TypeError, ValueError):
            return 0

    def _parse_listing_price(self, value: Any) -> int:
        """당근 가격 필드의 숫자 가격, 나눔, 미확인 값을 구분한다."""
        if value is None:
            return 0
        normalized = str(value).strip().lower().replace(",", "").replace("원", "")
        if normalized in {"나눔", "free"}:
            return DONATION_PRICE
        try:
            price = float(normalized)
        except ValueError:
            return 0
        return DONATION_PRICE if price == 0 else int(price)

    def _extract_listing_page_details(self, html: str, page_url: str) -> Dict[str, Any]:
        """당근 화면이 표시하는 가격과 판매 상태를 페이지 데이터에서 읽는다."""
        parser = _DaangnMetadataParser()
        parser.feed(html)
        page = urlparse(page_url)
        page_identity = (page.hostname or "").lower(), page.path.rstrip("/")

        # 매물 화면의 가격 칸은 Remix loaderData의 현재 product.price로 렌더링된다.
        expected_article_id = unquote(page.path.rstrip("/").rsplit("/", 1)[-1])
        loader_prices = set()
        loader_statuses = set()
        for block in parser.remix_context_blocks:
            marker = re.search(r"window\.__remixContext\s*=\s*", block)
            if not marker:
                continue
            try:
                context, _ = json.JSONDecoder().raw_decode(block[marker.end():].lstrip())
            except (TypeError, ValueError):
                continue

            state = context.get("state")
            if not isinstance(state, dict):
                continue
            loader_data = state.get("loaderData", {})
            if not isinstance(loader_data, dict):
                continue
            for route_data in loader_data.values():
                if not isinstance(route_data, dict):
                    continue
                product = route_data.get("product")
                if not isinstance(product, dict):
                    continue
                article_ids = {
                    str(route_data.get("articleId") or ""),
                    str(product.get("nodeId") or ""),
                }
                product_path = urlparse(str(product.get("href") or product.get("id") or "")).path.rstrip("/")
                if expected_article_id not in article_ids and product_path != page.path.rstrip("/"):
                    continue
                price = self._parse_listing_price(product.get("price"))
                if price != 0:
                    loader_prices.add(price)
                status = self._extract_status(str(product.get("status") or ""))
                if status != "중고거래":
                    loader_statuses.add(status)

        if len(loader_prices) == 1:
            return {
                "price": loader_prices.pop(),
                "status": loader_statuses.pop() if len(loader_statuses) == 1 else "",
            }

        matching_prices: List[int] = []
        unlinked_product_prices: List[int] = []
        product_prices: List[int] = []
        page_statuses = set(loader_statuses)
        unlinked_statuses = set()

        def collect_products(value: Any) -> None:
            if isinstance(value, list):
                for child in value:
                    collect_products(child)
                return
            if not isinstance(value, dict):
                return

            product_type = value.get("@type", [])
            product_types = product_type if isinstance(product_type, list) else [product_type]
            if any(str(item).rsplit("/", 1)[-1].lower() == "product" for item in product_types):
                offers = value.get("offers", [])
                offers = offers if isinstance(offers, list) else [offers]
                prices = []
                offer_statuses = set()
                for offer in offers:
                    if not isinstance(offer, dict):
                        continue
                    currency = str(offer.get("priceCurrency") or "KRW").upper()
                    price = self._parse_listing_price(offer.get("price"))
                    if currency == "KRW" and price != 0:
                        prices.append(price)
                    if "outofstock" in str(offer.get("availability") or "").lower():
                        offer_statuses.add("판매완료")

                unique_prices = set(prices)
                if len(unique_prices) == 1:
                    price = unique_prices.pop()
                    product_prices.append(price)
                    product_url = value.get("url")
                    if product_url:
                        parsed_product_url = urlparse(str(product_url))
                        product_identity = (parsed_product_url.hostname or "").lower(), parsed_product_url.path.rstrip("/")
                        if product_identity == page_identity:
                            matching_prices.append(price)
                            page_statuses.update(offer_statuses)
                    else:
                        unlinked_product_prices.append(price)
                        unlinked_statuses.update(offer_statuses)

            for key in ("@graph", "mainEntity"):
                if key in value:
                    collect_products(value[key])

        for block in parser.json_ld_blocks:
            try:
                collect_products(json.loads(block))
            except (TypeError, ValueError):
                continue

        verified_prices = matching_prices or (unlinked_product_prices if len(product_prices) == 1 else [])
        if not matching_prices and len(product_prices) == 1:
            page_statuses.update(unlinked_statuses)
        unique_verified_prices = set(verified_prices)
        if len(unique_verified_prices) == 1:
            return {
                "price": unique_verified_prices.pop(),
                "status": page_statuses.pop() if len(page_statuses) == 1 else "",
            }

        # 당근이 JSON-LD를 제공하지 않는 경우에만 매물 가격 전용 메타 태그를 사용한다.
        meta_prices = {self._parse_listing_price(value) for value in parser.price_meta}
        meta_prices.discard(0)
        return {
            "price": meta_prices.pop() if len(meta_prices) == 1 else 0,
            "status": page_statuses.pop() if len(page_statuses) == 1 else "",
        }

    def _extract_listing_page_price(self, html: str, page_url: str) -> int:
        """호환용 가격 추출 진입점."""
        return int(self._extract_listing_page_details(html, page_url)["price"])

    def _fetch_listing_page_details(self, url: str) -> Dict[str, Any]:
        """당근 매물 페이지를 직접 읽어 게시 가격과 판매 상태를 가져온다."""
        parsed = urlparse(url)
        if parsed.scheme.lower() != "https" or not _is_daangn_host(parsed.hostname or ""):
            return {"price": 0, "status": ""}

        request = Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "text/html"})
        opener = build_opener(_DaangnRedirectHandler())
        try:
            with opener.open(request, timeout=8) as response:
                page_url = response.geturl()
                final_url = urlparse(page_url)
                if final_url.scheme.lower() != "https" or not _is_daangn_host(final_url.hostname or ""):
                    return {"price": 0, "status": ""}
                html = response.read(2_000_000).decode("utf-8", "replace")
        except Exception:
            return {"price": 0, "status": ""}

        return self._extract_listing_page_details(html, page_url)

    def _fetch_listing_page_price(self, url: str) -> int:
        """호환용 가격 fetch 진입점."""
        return int(self._fetch_listing_page_details(url)["price"])

    def _extract_status(self, text: str) -> str:
        """검색 문구에서 판매완료·예약중·판매중 상태를 정규화한다."""
        if not text:
            return "중고거래"
        lowered = text.lower()
        if any(term in text for term in ("판매완료", "판매 완료", "거래완료", "거래 완료", "판매 종료", "거래 종료")) or any(
            term in lowered for term in ("sold out", "sold", "closed", "completed")
        ):
            return "판매완료"
        if "예약중" in text or "예약" in lowered or "reserved" in lowered:
            return "예약중"
        if "판매중" in text or "판매 중" in text or "for sale" in lowered:
            return "판매중"
        return "중고거래"

    def _is_allowed_source(self, url: str) -> bool:
        """당근/카롯의 중고거래 매물 URL만 통과시키고 커뮤니티 등 다른 경로는 제외한다."""
        if not url:
            return False

        parsed = urlparse(url)
        host = parsed.netloc.lower()
        path = parsed.path.lower()

        if not ("daangn" in host or "karrot" in host or "danggeun" in host):
            return False

        blocked_segments = (
            "/jobs/",
            "/job/",
            "/community/",
            "/question/",
            "/questions/",
            "/articles/",
            "/live/",
            "/service/",
            "/search/",
        )
        if any(segment in path for segment in blocked_segments):
            return False

        # 검색/지역 목록은 '/kr/buy-sell' 뒤에 상품 경로가 없으므로 제외한다.
        # 개별 게시글은 '/kr/buy-sell/<게시글 슬러그>' 또는 '/buy-sell/<게시글 슬러그>' 형태다.
        return bool(re.fullmatch(r"/(?:kr/)?buy-sell/[^/]+/?", path))

    def _build_result(
        self,
        query: str,
        item: Dict[str, Any],
        listing_price: int = 0,
        listing_status: str = "",
    ) -> Dict[str, Any]:
        """Tavily 원본과 당근 페이지에서 확인한 게시 가격을 공통 상품 형식으로 변환한다."""
        title = (item.get("title") or item.get("name") or query).strip()
        url = (item.get("url") or "").strip()
        content = (item.get("content") or item.get("snippet") or "").strip()
        raw_content = (item.get("raw_content") or "").strip()
        description = content[:220].strip()

        if listing_price > 0:
            average_price = listing_price
            min_price = average_price
            max_price = average_price
            recommended_buy = 0
            expected_sell = 0
            pricing_available = True
        else:
            min_price = 0
            max_price = 0
            average_price = 0
            recommended_buy = 0
            expected_sell = 0
            pricing_available = False

        domain = urlparse(url).netloc.replace("www.", "") if url else "tavily"
        return {
            "id": abs(int(hashlib.md5((url or title).encode("utf-8")).hexdigest()[:8], 16)) % 1000000,
            "name": title,
            "category": "중고거래",
            "averagePrice": average_price,
            "minPrice": min_price,
            "maxPrice": max_price,
            "recommendedBuyPrice": recommended_buy,
            "expectedSellPrice": expected_sell,
            "source": "tavily",
            "sourceSite": domain,
            "status": listing_status or self._extract_status(title),
            "description": description or "중고거래 관련 검색 결과입니다.",
            "url": url,
            "priceLabel": "나눔" if listing_price == DONATION_PRICE else None,
            "pricingAvailable": pricing_available,
            "publishedDate": item.get("published_date"),
            "rawResult": {
                "title": title,
                "url": url,
                "content": content,
                "source": domain,
            },
        }

    def _request_tavily(self, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        """인증된 JSON POST 요청을 보내고 검색 결과 목록만 반환한다."""
        if not self.api_key:
            return []

        body = json.dumps(payload).encode("utf-8")
        request = Request(
            self.base_url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            method="POST",
        )

        with urlopen(request, timeout=10) as response:
            raw = response.read().decode("utf-8")
            data = json.loads(raw)

        if isinstance(data, dict) and data.get("error"):
            raise ValueError(str(data.get("error")))

        results = data.get("results") if isinstance(data, dict) else []
        return results if isinstance(results, list) else []

    async def search_products(self, query: str) -> List[Dict[str, Any]]:
        """가격이 명시된 검색 후보를 먼저 확인하고 결과를 최대 80건 반환한다."""
        search_queries = self.build_search_queries(query)
        if not search_queries:
            return []

        # Tavily 요청은 작은 동시성으로 병렬화해 검색 범위와 응답 속도를 높인다.
        search_semaphore = asyncio.Semaphore(4)

        async def search_one(keyword: str) -> List[Dict[str, Any]]:
            payload = {
                "query": keyword,
                "search_depth": "basic",
                "max_results": 20,
                "include_answer": False,
                "include_raw_content": False,
                "include_published_date": True,
            }
            async with search_semaphore:
                try:
                    return await asyncio.to_thread(self._request_tavily, payload)
                except Exception:
                    return []

        search_results = await asyncio.gather(*(search_one(keyword) for keyword in search_queries))

        # 같은 매물이 여러 검색어에 잡히는 경우 하나만 남긴다.
        candidate_map: Dict[str, tuple[str, Dict[str, Any], str]] = {}
        for keyword, results in zip(search_queries, search_results):
            for item in results:
                url = (item.get("url") or "").strip()
                if not url or not self._is_allowed_source(url):
                    continue

                title = (item.get("title") or item.get("name") or keyword).lower()
                if not title or "알바" in title or "구인" in title or "질문" in title:
                    continue
                parsed_url = urlparse(url)
                identity = f"{(parsed_url.hostname or '').lower().removeprefix('www.')}{parsed_url.path.rstrip('/')}"
                candidate_map.setdefault(identity, (keyword, item, url))

        # 제목·검색 문구에 가격 표기가 있는 후보를 먼저 확인해 실제 가격을 찾을 가능성을 높인다.
        price_hint_pattern = re.compile(r"(?:\d[\d,]*(?:\.\d+)?\s*(?:원|만\s*원?)|나눔|무료)", re.IGNORECASE)
        candidate_items = list(candidate_map.values())
        candidate_items.sort(
            key=lambda candidate: not bool(
                price_hint_pattern.search(
                    f"{candidate[1].get('title', '')} {candidate[1].get('content', '')}"
                )
            )
        )
        candidates = candidate_items[:100]
        page_semaphore = asyncio.Semaphore(25)

        async def fetch_details(url: str) -> Dict[str, Any]:
            async with page_semaphore:
                try:
                    return await asyncio.to_thread(self._fetch_listing_page_details, url)
                except Exception:
                    return {"price": 0, "status": ""}

        listing_details = await asyncio.gather(*(fetch_details(url) for _, _, url in candidates))
        priced: Dict[str, Dict[str, Any]] = {}
        unpriced: Dict[str, Dict[str, Any]] = {}

        for (candidate_query, item, url), details in zip(candidates, listing_details):
            title = (item.get("title") or item.get("name") or candidate_query).strip()
            listing_status = details.get("status") or self._extract_status(title)
            if listing_status == "판매완료":
                continue

            normalized_item = self._build_result(
                candidate_query,
                item,
                int(details.get("price") or 0),
                listing_status,
            )
            target = priced if normalized_item["pricingAvailable"] or normalized_item["priceLabel"] == "나눔" else unpriced
            target[normalized_item["url"]] = normalized_item

        # 확인된 가격을 결과 앞쪽에 모으되, 가격 미확인 결과도 참고용으로 뒤에 포함한다.
        return [*priced.values(), *unpriced.values()][:80]

    async def get_product(self, product_id: str) -> Dict[str, Any]:
        """현재 검색 공급자는 개별 ID 조회를 제공하지 않아 빈 결과를 반환한다."""
        return {}
