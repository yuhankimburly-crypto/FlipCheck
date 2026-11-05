from typing import Optional
from pydantic import BaseModel, Field


class ProductRecord(BaseModel):
    """마켓 공급자에서 다루는 상품 시세 및 거래 난이도 데이터."""

    id: int
    name: str
    category: str
    averagePrice: int
    minPrice: int
    maxPrice: int
    recommendedBuyPrice: int
    expectedSellPrice: int
    demand: Optional[int] = None
    sellingDifficulty: Optional[int] = None
    volatility: Optional[int] = None
    source: Optional[str] = "demo"


class ListingRecord(BaseModel):
    """개별 중고 매물의 가격, 상태, 판매처와 게시 시각 데이터."""

    listing_id: str
    title: str
    product_name: str
    price: int
    condition: str
    seller: Optional[str] = None
    url: Optional[str] = None
    created_at: Optional[str] = None
    source: str = "demo"
