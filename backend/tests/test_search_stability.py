import os
import json
import sys
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from services.data_provider import DemoProvider, get_data_provider
from services.market_service import _add_resale_recommendation, search_products
from services.tavily_provider import TavilyProvider


class SearchStabilityTests(unittest.TestCase):
    """검색 공급자 선택, 가격 파싱의 보수성, 추천가 계산 규칙을 고정한다."""

    def test_default_provider_uses_tavily(self):
        """별도 설정이 없으면 실시간 검색 공급자를 기본으로 선택한다."""
        os.environ.pop("DATA_PROVIDER", None)
        os.environ["TAVILY_API_KEY"] = "test-key"

        provider = get_data_provider()

        self.assertIsInstance(provider, TavilyProvider)

    def test_search_returns_matching_local_products(self):
        """데모 공급자는 로컬 샘플 중 검색어와 일치하는 상품을 반환한다."""
        os.environ["DATA_PROVIDER"] = "demo"
        products = search_products("아이폰 15")

        self.assertTrue(products)
        self.assertTrue(all("iPhone 15" in product["name"] for product in products))

    def test_search_preserves_query_for_provider(self):
        """검색어를 변형하지 않고 공급자에 전달하는 계약을 확인한다."""
        provider = Mock()
        provider.search_products = AsyncMock(return_value=[])

        with patch("services.market_service.get_data_provider", return_value=provider):
            search_products("아이폰 15")

        provider.search_products.assert_awaited_once_with("아이폰 15")

    def test_tavily_queries_start_with_daangn_market_scope(self):
        """검색 질의 앞부분이 당근 중고거래 경로를 우선하는지 확인한다."""
        provider = TavilyProvider()

        queries = provider.build_search_queries("아이폰")

        self.assertEqual(len(queries), 4)
        self.assertTrue(all(query.startswith("site:daangn.com/kr/buy-sell") for query in queries[:3]))
        self.assertTrue(queries[0].endswith(" 원"))

    def test_listing_page_product_offer_provides_posted_price(self):
        """당근 페이지의 현재 Product Offer에서 KRW 게시 가격을 읽는다."""
        provider = TavilyProvider()
        listing_url = "https://www.daangn.com/kr/buy-sell/sample"
        html = f"""
            <script type="application/ld+json">{json.dumps({
                "@type": "Product",
                "url": listing_url,
                "offers": {"@type": "Offer", "price": "420000.0", "priceCurrency": "KRW"},
            })}</script>
        """

        self.assertEqual(provider._extract_listing_page_price(html, listing_url), 420000)

    def test_listing_price_meta_is_used_when_product_offer_is_missing(self):
        """구조화된 Offer가 없는 경우 당근 매물 전용 가격 메타를 읽는다."""
        provider = TavilyProvider()
        html = '<meta property="karrot:embed_view_type:title" content="420,000원">'

        self.assertEqual(
            provider._extract_listing_page_price(html, "https://www.daangn.com/kr/buy-sell/sample"),
            420000,
        )

    def test_search_snippet_price_is_ignored_without_page_price(self):
        """페이지 가격을 확인하지 못하면 스니펫의 혼합 금액을 게시가로 쓰지 않는다."""
        provider = TavilyProvider()

        product = provider._build_result("아이폰 15", {
            "title": "아이폰 15 128GB",
            "url": "https://www.daangn.com/kr/buy-sell/sample",
            "content": "판매가 700,000원, 다른 상품 450,000원",
        })

        self.assertEqual(product["averagePrice"], 0)
        self.assertFalse(product["pricingAvailable"])
        self.assertEqual(product["recommendedBuyPrice"], 0)
        self.assertEqual(product["expectedSellPrice"], 0)

    def test_page_price_overrides_different_search_snippet_amounts(self):
        """검색 요약 가격은 Tavily 문구가 아닌 당근 페이지의 가격을 따른다."""
        provider = TavilyProvider()

        product = provider._build_result("아이폰 15", {
            "title": "아이폰 15 128GB",
            "url": "https://www.daangn.com/kr/buy-sell/sample",
            "content": "판매가 700,000원, 다른 상품 450,000원",
        }, listing_price=420000)

        self.assertEqual(product["averagePrice"], 420000)
        self.assertTrue(product["pricingAvailable"])

    def test_fast_sale_recommendation_uses_sample_adjusted_market_median(self):
        """추천 판매가가 확인 표본의 중앙값과 표본별 할인율을 따른다."""
        products = _add_resale_recommendation([
            {"averagePrice": 500000, "pricingAvailable": True},
            {"averagePrice": 470000, "pricingAvailable": True},
        ])

        self.assertEqual(products[0]["marketMedianPrice"], 485000)
        self.assertEqual(products[0]["recommendedSellPrice"], 461000)
        self.assertEqual(products[0]["comparableListings"], 2)
        self.assertEqual(products[0]["pricingConfidence"], "low")

    def test_fast_sale_recommendation_is_absent_without_verified_prices(self):
        """검증 가격이 없으면 추천가와 신뢰도도 산출하지 않는다."""
        products = _add_resale_recommendation([
            {"averagePrice": 0, "pricingAvailable": False},
        ])

        self.assertEqual(products[0]["recommendedSellPrice"], 0)
        self.assertEqual(products[0]["pricingConfidence"], "none")

    def test_tavily_search_does_not_fall_back_to_demo_products(self):
        """실시간 검색 실패를 데모 시세로 위장하지 않는다."""
        os.environ["DATA_PROVIDER"] = "tavily"
        provider = Mock()
        provider.search_products = AsyncMock(return_value=[])

        with patch("services.market_service.get_data_provider", return_value=provider):
            products = search_products("iPhone 15")

        self.assertEqual(products, [])

    def test_concurrent_searches_return_results_simultaneously(self):
        """서로 다른 검색 요청을 동시에 실행해 결과 간섭이 없는지 확인한다."""
        os.environ["DATA_PROVIDER"] = "demo"
        queries = ["아이폰 15", "에어팟", "나이키"]

        with ThreadPoolExecutor(max_workers=3) as executor:
            results = list(executor.map(search_products, queries))

        self.assertEqual(len(results), len(queries))
        self.assertTrue(all(result for result in results))


if __name__ == "__main__":
    unittest.main()
