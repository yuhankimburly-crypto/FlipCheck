from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class ProductQueryRequest(BaseModel):
    """상품 검색 API가 받을 선택 검색어."""
    q: Optional[str] = ""


class CalculateRequest(BaseModel):
    """사용자 입력 가격·거래 비용과 선택된 시장 표본을 검증한다."""
    product_name: str = Field(..., min_length=1)
    buy_price: int = Field(..., gt=0)
    expected_sell_price: int = Field(..., ge=0)
    transaction_fee: Optional[int] = Field(default=None, ge=0)
    shipping_cost: Optional[int] = Field(default=None, ge=0)
    other_cost: Optional[int] = Field(default=None, ge=0)
    market_median_price: Optional[int] = Field(default=None, ge=0)
    market_sample_count: int = Field(default=0, ge=0)
    freshness_days: Optional[float] = Field(default=None, ge=0)
    freshness_coverage: float = Field(default=0.0, ge=0, le=1)


class AnalyzeRequest(CalculateRequest):
    """사용자 이력에 저장할 매물 분석 요청."""


class UsernameCredentials(BaseModel):
    """회원가입과 로그인에서 공통으로 검증하는 계정 자격 증명."""
    username: str = Field(..., min_length=3, max_length=32, pattern=r"^[\w.-]+$")
    password: str = Field(..., min_length=8, max_length=128)


class FavoriteSaveRequest(BaseModel):
    """관심상품으로 저장할 공급자 매물 원본 데이터."""
    listing: Dict[str, Any]


class UserAnalysisRecord(BaseModel):
    """인증된 사용자에게 귀속해 저장할 계산/분석 기록."""
    product_name: str = Field(..., min_length=1, max_length=300)
    buy_price: int = Field(..., gt=0)
    expected_sell_price: int = Field(..., ge=0)
    other_cost: int = Field(default=0, ge=0)
    expected_profit: int
    roi: float
    flip_score: int = Field(..., ge=0, le=100)
    analysis_date: str
    analysis_type: Literal["calculator", "analysis"] = "calculator"


class ProductResponse(BaseModel):
    """검색 결과를 프런트엔드 공통 상품 계약에 맞게 직렬화한다."""
    id: int
    name: str
    category: str
    averagePrice: int = 0
    minPrice: int = 0
    maxPrice: int = 0
    recommendedBuyPrice: Optional[int] = None
    expectedSellPrice: Optional[int] = None
    demand: Optional[int] = None
    sellingDifficulty: Optional[int] = None
    volatility: Optional[int] = None
    marketMedianPrice: int = 0
    recommendedSellPrice: Optional[int] = None
    comparableListings: int = 0
    pricingConfidence: str = "none"
    flipScore: Optional[int] = Field(default=None, ge=0, le=100)
    scoreStatus: str = "unavailable"
    scoreLabel: str = "산정 불가"
    scoreCategory: str = "general"
    scoreWeights: Dict[str, float] = Field(default_factory=dict)
    scoreBreakdown: List[Dict[str, Any]] = Field(default_factory=list)
    dataConfidence: int = Field(default=0, ge=0, le=100)
    dataConfidenceLevel: str = "낮음"
    dataConfidenceReasons: List[str] = Field(default_factory=list)
    scoredDimensionCount: int = Field(default=0, ge=0, le=5)
    missingDimensions: List[str] = Field(default_factory=list)
    listingPrice: Optional[int] = None
    completedSalePrice: Optional[int] = None
    priceBasis: str = "unknown"
    completedSaleSampleCount: int = Field(default=0, ge=0)
    publishedDate: Optional[str] = None
    freshnessDays: Optional[float] = None
    marketFreshnessDays: Optional[float] = None
    marketFreshnessCoverage: float = Field(default=0.0, ge=0, le=1)
    marketSnapshotAt: Optional[str] = None
    isDemo: bool = False
    source: str = "demo"
    sourceSite: Optional[str] = None
    status: Optional[str] = None
    description: Optional[str] = None
    url: Optional[str] = None
    priceLabel: Optional[str] = None
    pricingAvailable: bool = False


class SearchResponse(BaseModel):
    """상품 검색 응답의 최상위 형태."""
    products: List[ProductResponse]


class AnalysisResult(BaseModel):
    """매물 분석 결과와 선택적으로 산출한 시장 가격."""
    product_name: str
    buy_price: int
    expected_sell_price: int
    profit: Optional[int] = None
    roi: Optional[float] = None
    flip_score: Optional[int] = None
    recommendation: str
    estimated_market_price: Optional[int] = None
    score_status: str = "unavailable"
    score_weights: Dict[str, float] = Field(default_factory=dict)
    score_breakdown: List[Dict[str, Any]] = Field(default_factory=list)
    data_confidence: int = Field(default=0, ge=0, le=100)
    data_confidence_level: str = "낮음"
    data_confidence_reasons: List[str] = Field(default_factory=list)


class DealSummary(BaseModel):
    """점수순 거래 후보 화면에서 사용하는 요약 항목."""
    id: int
    name: str
    category: str
    market_price: int
    expected_sell_price: int
    expected_profit: int
    flip_score: int
    source: str = "demo"
