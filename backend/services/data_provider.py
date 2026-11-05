import os
from typing import Any, Dict, List


class MarketDataProvider:
    """검색 데이터 공급자가 구현해야 하는 비동기 인터페이스."""

    async def search_products(self, query: str) -> List[Dict[str, Any]]:
        """검색어에 맞는 공통 상품 레코드 목록을 조회한다."""
        raise NotImplementedError

    async def get_product(self, product_id: str) -> Dict[str, Any]:
        """ID에 해당하는 상품 레코드를 조회한다."""
        raise NotImplementedError


class DemoProvider(MarketDataProvider):
    """외부 API 없이 화면과 로컬 테스트에서 사용할 고정 샘플 데이터 공급자."""

    def __init__(self) -> None:
        """검색 결과의 공통 필드와 예시 가격을 초기화한다."""
        self.products = [
            {
                "id": 1,
                "name": "iPhone 15 128GB",
                "category": "스마트폰",
                "averagePrice": 430000,
                "minPrice": 390000,
                "maxPrice": 470000,
                "recommendedBuyPrice": 400000,
                "expectedSellPrice": 450000,
                "source": "demo",
            },
            {
                "id": 2,
                "name": "iPhone 15 Pro 256GB",
                "category": "스마트폰",
                "averagePrice": 720000,
                "minPrice": 650000,
                "maxPrice": 820000,
                "recommendedBuyPrice": 680000,
                "expectedSellPrice": 770000,
                "source": "demo",
            },
            {
                "id": 3,
                "name": "AirPods Pro 2",
                "category": "이어폰",
                "averagePrice": 210000,
                "minPrice": 170000,
                "maxPrice": 250000,
                "recommendedBuyPrice": 185000,
                "expectedSellPrice": 225000,
                "source": "demo",
            },
            {
                "id": 4,
                "name": "Galaxy S25",
                "category": "스마트폰",
                "averagePrice": 660000,
                "minPrice": 610000,
                "maxPrice": 720000,
                "recommendedBuyPrice": 630000,
                "expectedSellPrice": 690000,
                "source": "demo",
            },
            {
                "id": 5,
                "name": "Nike Air Force 1",
                "category": "신발",
                "averagePrice": 150000,
                "minPrice": 100000,
                "maxPrice": 200000,
                "recommendedBuyPrice": 120000,
                "expectedSellPrice": 170000,
                "source": "demo",
            },
            {
                "id": 6,
                "name": "Adidas Samba",
                "category": "신발",
                "averagePrice": 120000,
                "minPrice": 90000,
                "maxPrice": 170000,
                "recommendedBuyPrice": 95000,
                "expectedSellPrice": 140000,
                "source": "demo",
            },
        ]

    async def search_products(self, query: str) -> List[Dict[str, Any]]:
        """상품명 또는 카테고리에 검색어가 포함된 데모 상품을 반환한다."""
        if not query:
            return self.products

        normalized = query.lower()
        return [
            item for item in self.products if normalized in item["name"].lower() or normalized in item["category"].lower()
        ]

    async def get_product(self, product_id: str) -> Dict[str, Any]:
        """데모 목록에서 문자열 ID가 일치하는 항목을 찾는다."""
        for item in self.products:
            if str(item["id"]) == str(product_id):
                return item
        return {}


class OfficialApiProvider(MarketDataProvider):
    """향후 공식 시세 API 연결을 위한 설정 보관용 미구현 공급자."""

    def __init__(self) -> None:
        """공식 API 주소와 키를 환경 변수에서 읽는다."""
        self.base_url = os.getenv("API_BASE_URL", "")
        self.api_key = os.getenv("API_KEY", "")

    async def search_products(self, query: str) -> List[Dict[str, Any]]:
        """공식 API 연동 전까지는 실제 조회를 하지 않고 빈 목록을 반환한다."""
        if not self.base_url:
            return []
        return []

    async def get_product(self, product_id: str) -> Dict[str, Any]:
        """공식 API 연동 전까지는 개별 상품을 반환하지 않는다."""
        if not self.base_url:
            return {}
        return {}


def get_data_provider() -> MarketDataProvider:
    """DATA_PROVIDER 설정값으로 Tavily, 공식 API 또는 데모 공급자를 선택한다."""
    provider_name = os.getenv("DATA_PROVIDER", "tavily").lower()
    if provider_name == "official":
        return OfficialApiProvider()
    if provider_name == "tavily":
        from services.tavily_provider import TavilyProvider

        return TavilyProvider()
    return DemoProvider()
