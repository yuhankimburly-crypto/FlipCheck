from copy import deepcopy
import os
from email.utils import parsedate_to_datetime
from statistics import median
from datetime import datetime, timezone
from threading import Lock
from time import monotonic
from typing import Any, Dict, List

from services.data_provider import get_data_provider
from services.flip_score import (
    calculate_analysis_summary,
    calculate_entry_price_score,
    calculate_flip_assessment,
    classify_category,
)


KOREAN_SEARCH_ALIASES = {
    "아이폰": "iphone",
    "에어팟": "airpods",
    "갤럭시": "galaxy",
    "나이키": "nike",
    "아디다스": "adidas",
}

SEARCH_RESULT_CACHE_TTL_SECONDS = 30 * 60
_SEARCH_RESULT_CACHE: Dict[str, tuple[float, str, List[Dict[str, Any]]]] = {}
_SEARCH_RESULT_CACHE_LOCK = Lock()


def _get_cached_search_items(cache_key: str) -> tuple[List[Dict[str, Any]], str] | None:
    """검색어별 가격 스냅샷이 유효하면 복사본과 기준 시각을 반환한다."""
    with _SEARCH_RESULT_CACHE_LOCK:
        cached = _SEARCH_RESULT_CACHE.get(cache_key)
        if cached is None:
            return None
        cached_at, snapshot_at, items = cached
        if monotonic() - cached_at >= SEARCH_RESULT_CACHE_TTL_SECONDS:
            _SEARCH_RESULT_CACHE.pop(cache_key, None)
            return None
        return deepcopy(items), snapshot_at


def _store_search_items(cache_key: str, items: List[Dict[str, Any]]) -> tuple[List[Dict[str, Any]], str]:
    """동시에 같은 검색이 완료돼도 처음 저장된 한 스냅샷을 공통으로 반환한다."""
    with _SEARCH_RESULT_CACHE_LOCK:
        cached = _SEARCH_RESULT_CACHE.get(cache_key)
        if cached is not None:
            cached_at, snapshot_at, cached_items = cached
            if monotonic() - cached_at < SEARCH_RESULT_CACHE_TTL_SECONDS:
                return deepcopy(cached_items), snapshot_at

        snapshot_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        stored_items = deepcopy(items)
        _SEARCH_RESULT_CACHE[cache_key] = (monotonic(), snapshot_at, stored_items)
        return deepcopy(stored_items), snapshot_at


def _normalize_search_query(query: str) -> str:
    """검색 제공자에 전달할 수 있도록 한글 상품명을 영문 별칭으로 정리한다."""
    normalized = query.strip().lower()
    for korean, english in KOREAN_SEARCH_ALIASES.items():
        normalized = normalized.replace(korean, english)
    return normalized


def _get_freshness_days(published_date: Any) -> float | None:
    """Tavily 게시 시점을 ISO/RFC 날짜로 읽고 현재 시점 기준 경과 일수를 구한다."""
    if not published_date:
        return None
    parsed = None
    try:
        parsed = datetime.fromisoformat(str(published_date).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        try:
            parsed = parsedate_to_datetime(str(published_date))
        except (TypeError, ValueError, OverflowError):
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return max(0.0, (datetime.now(timezone.utc) - parsed.astimezone(timezone.utc)).total_seconds() / 86400)


def _add_resale_recommendation(products: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """게시 가격 표본을 요약하고 관측할 수 있는 점수 차원만 평가한다."""
    posted_prices = sorted(
        int(product.get("averagePrice") or 0)
        for product in products
        if product.get("source") != "demo"
        and product.get("pricingAvailable")
        and int(product.get("averagePrice") or 0) > 0
    )
    sample_count = len(posted_prices)
    market_median = int(median(posted_prices)) if posted_prices else 0
    priced_products = [
        product for product in products
        if product.get("source") != "demo"
        and product.get("pricingAvailable")
        and int(product.get("averagePrice") or 0) > 0
    ]
    known_ages = [
        age for age in (_get_freshness_days(product.get("publishedDate")) for product in priced_products)
        if age is not None
    ]
    market_freshness_days = float(median(known_ages)) if known_ages else None
    market_freshness_coverage = len(known_ages) / sample_count if sample_count else 0.0
    price_spread_ratio = (
        (posted_prices[-1] - posted_prices[0]) / market_median
        if market_median > 0 and len(posted_prices) >= 2
        else None
    )
    confidence = "high" if sample_count >= 20 else "medium" if sample_count >= 5 else "low" if sample_count else "none"

    for product in products:
        product["marketMedianPrice"] = market_median
        product["recommendedSellPrice"] = None
        product["recommendedBuyPrice"] = None
        product["comparableListings"] = sample_count
        product["pricingConfidence"] = confidence
        is_demo = product.get("source") == "demo"
        product["isDemo"] = is_demo
        product["listingPrice"] = None if is_demo else (int(product.get("averagePrice") or 0) or None)
        product["completedSalePrice"] = None
        product["completedSaleSampleCount"] = 0
        product["priceBasis"] = "example" if is_demo else "listing" if product["listingPrice"] else "unknown"
        product["freshnessDays"] = _get_freshness_days(product.get("publishedDate")) if not is_demo else None
        product["marketFreshnessDays"] = market_freshness_days if not is_demo else None
        product["marketFreshnessCoverage"] = market_freshness_coverage if not is_demo else 0.0

        price = product["listingPrice"]
        entry_price_advantage = None
        evidence = {}
        if not is_demo and price and market_median > 0 and sample_count >= 3:
            entry_price_advantage, relative_advantage = calculate_entry_price_score(market_median, price)
            evidence["entry_price_advantage"] = (
                f"게시가 {price:,}원은 활성 매물 게시가 중앙값 {market_median:,}원보다 "
                f"{relative_advantage * 100:+.1f}% 우위이며 매입가 메리트 {entry_price_advantage:.1f}점입니다. "
                f"완료 거래 가격 표본은 {product['completedSaleSampleCount']}개입니다."
            )
        elif is_demo:
            evidence["entry_price_advantage"] = "예시 데이터이므로 매입가 메리트 점수에 포함하지 않았습니다."
        else:
            evidence["entry_price_advantage"] = f"가격 표본 {sample_count}개로 매입가 메리트를 비교하기에 부족합니다."

        category = classify_category(product.get("name", ""), product.get("category", ""))
        assessment = calculate_flip_assessment(
            {
                "profitability": None,
                "entry_price_advantage": entry_price_advantage,
                "liquidity": None,
                "demand": None,
                "transaction_risk": None,
            },
            category=category,
            sample_count=sample_count if not is_demo else 0,
            freshness_days=product["marketFreshnessDays"] if not is_demo else None,
            freshness_coverage=product["marketFreshnessCoverage"],
            price_spread_ratio=price_spread_ratio,
            dimension_evidence=evidence,
        )
        product.update(assessment)

    return products


def search_products(query: str = "") -> List[Dict[str, Any]]:
    """선택된 공급자에서 검색하고 응답 필드를 정규화한 뒤 가격 추천을 덧붙인다."""
    provider = get_data_provider()
    normalized_query = _normalize_search_query(query)
    cache_key = f"{provider.__class__.__name__}:{' '.join(normalized_query.casefold().split())}"
    cached_items = _get_cached_search_items(cache_key)
    if cached_items is not None:
        items, snapshot_at = cached_items
    else:
        items = []
        try:
            import asyncio

            # 여러 검색어와 매물 페이지를 확인하므로 기존 단건 검색 제한보다 여유를 둔다.
            items = asyncio.run(asyncio.wait_for(provider.search_products(query), timeout=60))
        except (asyncio.TimeoutError, Exception):
            items = []

        # Tavily를 쓸 때는 검색 실패를 데모 가격으로 숨기지 않는다.
        if not items and os.getenv("DATA_PROVIDER", "tavily").lower() != "tavily":
            from services.data_provider import DemoProvider

            demo_items = DemoProvider().products
            if normalized_query:
                items = [
                    item
                    for item in demo_items
                    if normalized_query in item["name"].lower()
                    or normalized_query in item["category"].lower()
                    or any(normalized_query in alias.lower() for alias in item.get("aliases", []))
                ]
            else:
                items = demo_items

        snapshot_at = None
        if items:
            items, snapshot_at = _store_search_items(cache_key, items)

    cleaned: List[Dict[str, Any]] = []
    for item in items:
        normalized = dict(item)
        normalized.setdefault("category", "중고거래")
        normalized.setdefault("averagePrice", 0)
        normalized.setdefault("minPrice", 0)
        normalized.setdefault("maxPrice", 0)
        normalized.setdefault("recommendedBuyPrice", None)
        normalized.setdefault("expectedSellPrice", None)
        normalized["demand"] = None
        normalized["sellingDifficulty"] = None
        normalized["volatility"] = None
        normalized.setdefault("source", provider.__class__.__name__.replace("Provider", "").lower())
        normalized.setdefault("sourceSite", "")
        normalized.setdefault("status", "중고거래")
        normalized.setdefault("description", "")
        normalized.setdefault("url", "")
        normalized.setdefault("pricingAvailable", bool(normalized.get("averagePrice")))
        normalized["marketSnapshotAt"] = snapshot_at
        cleaned.append(normalized)

    return _add_resale_recommendation(cleaned)


def get_product(product_id: int, query: str = "") -> Dict[str, Any]:
    """공급자 상세 조회를 우선 시도하고, 실패하면 검색 결과에서 ID로 찾는다."""
    provider = get_data_provider()
    try:
        import asyncio
        result = asyncio.run(provider.get_product(str(product_id)))
        if result:
            return result
    except Exception:
        pass

    if not query.strip():
        return {}

    for item in search_products(query):
        if item["id"] == product_id:
            return item
    return {}


def calculate_product_summary(
    product_name: str,
    buy_price: int,
    expected_sell_price: int,
    transaction_fee: int | None = None,
    shipping_cost: int | None = None,
    other_cost: int | None = None,
    market_median_price: int | None = None,
    market_sample_count: int = 0,
    freshness_days: float | None = None,
    freshness_coverage: float = 0.0,
) -> Dict[str, Any]:
    """사용자 비용과 제공된 게시 가격 표본만으로 잠정 Flip Score를 반환한다."""
    summary = calculate_analysis_summary(
        buy_price=buy_price,
        expected_sell_price=expected_sell_price,
        transaction_fee=transaction_fee,
        shipping_cost=shipping_cost,
        other_cost=other_cost,
        category=classify_category(product_name),
        market_median_price=market_median_price,
        market_sample_count=market_sample_count,
        freshness_days=freshness_days,
        freshness_coverage=freshness_coverage,
    )

    return {
        "product_name": product_name,
        "buy_price": buy_price,
        "expected_sell_price": expected_sell_price,
        **summary,
    }


def analyze_product(
    product_name: str,
    buy_price: int,
    expected_sell_price: int,
    transaction_fee: int | None = None,
    shipping_cost: int | None = None,
    other_cost: int | None = None,
    market_median_price: int | None = None,
    market_sample_count: int = 0,
    freshness_days: float | None = None,
    freshness_coverage: float = 0.0,
) -> Dict[str, Any]:
    """매입 시나리오를 평가하고 등록가 중앙값을 완료 거래가와 분리해 표시한다."""
    if not market_median_price or market_median_price <= 0:
        product = next(
            (item for item in search_products(product_name) if item.get("marketMedianPrice", 0) > 0),
            None,
        )
        if product:
            market_median_price = int(product["marketMedianPrice"])
            market_sample_count = int(product.get("comparableListings") or 0)
            freshness_days = product.get("marketFreshnessDays")
            freshness_coverage = float(product.get("marketFreshnessCoverage") or 0.0)

    analysis = calculate_analysis_summary(
        buy_price=buy_price,
        expected_sell_price=expected_sell_price,
        transaction_fee=transaction_fee,
        shipping_cost=shipping_cost,
        other_cost=other_cost,
        category=classify_category(product_name),
        market_median_price=market_median_price,
        market_sample_count=market_sample_count,
        freshness_days=freshness_days,
        freshness_coverage=freshness_coverage,
    )

    return {
        "product_name": product_name,
        "buy_price": buy_price,
        "expected_sell_price": int(expected_sell_price),
        "estimated_market_price": market_median_price,
        "market_price_basis": "listing_ask_median" if market_median_price else "unavailable",
        **analysis,
        "analysis_date": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
    }


def get_deals(query: str) -> List[Dict[str, Any]]:
    """확인되지 않은 완료 거래가와 비용으로 수익 후보를 만들어내지 않는다."""
    return []
