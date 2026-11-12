import os
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT_DIR, ".env"))

from database import (
    create_auth_session,
    create_user_account,
    delete_auth_session,
    delete_user_favorite,
    get_account_for_session,
    get_popular_searches,
    get_user_account_by_username,
    get_user_analysis_history,
    get_user_favorites,
    init_db,
    record_search_query,
    save_user_analysis_record,
    save_user_favorite,
)
from schemas import (
    AnalyzeRequest,
    CalculateRequest,
    FavoriteSaveRequest,
    ProductResponse,
    SearchResponse,
    UserAnalysisRecord,
    UsernameCredentials,
)
from services.auth_security import create_session_token, hash_password, hash_session_token, verify_password
from services.market_service import (
    analyze_product,
    calculate_product_summary,
    get_deals,
    get_product,
    search_products,
)

app = FastAPI(title="FlipCheck API", version="1.0.0")
SESSION_COOKIE_NAME = "flipcheck_session"
SESSION_TTL_SECONDS = 60 * 60 * 24 * 7
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
LOCAL_FRONTEND_ORIGINS = [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:5501",
    "http://127.0.0.1:5501",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]
FRONTEND_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.getenv("FRONTEND_ORIGIN", "").split(",")
    if origin.strip()
]
ALLOWED_ORIGINS = list(dict.fromkeys(LOCAL_FRONTEND_ORIGINS + FRONTEND_ORIGINS))

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event() -> None:
    """서버가 시작될 때 필요한 SQLite 테이블을 준비한다."""
    init_db()


@app.get("/api/health")
def health_check() -> Dict[str, Any]:
    """서버 상태와 현재 선택된 데이터 공급자를 간단히 반환한다."""
    provider_name = os.getenv("DATA_PROVIDER", "tavily").lower()
    return {"status": "ok", "provider": provider_name}


def get_authenticated_account(request: Request) -> Dict[str, Any]:
    """쿠키 토큰을 해시해 유효한 계정을 확인하고, 실패 시 401을 발생시킨다."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")

    now = datetime.now(timezone.utc).isoformat()
    account = get_account_for_session(hash_session_token(token), now)
    if not account:
        raise HTTPException(status_code=401, detail="로그인 세션이 만료되었습니다.")
    return account


def start_session(account: Dict[str, Any], response: Response) -> None:
    """토큰 해시를 DB에 저장하고 원문 토큰은 보안 속성이 적용된 쿠키로만 전달한다."""
    token = create_session_token()
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=SESSION_TTL_SECONDS)).isoformat()
    create_auth_session(account["id"], hash_session_token(token), expires_at)
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


def public_account(account: Dict[str, Any]) -> Dict[str, Any]:
    """계정 응답에서 비밀번호 해시 등 내부 정보를 제외한다."""
    return {"id": account["id"], "username": account["username"], "nickname": account["username"]}


@app.post("/api/auth/signup", status_code=201)
def api_signup(credentials: UsernameCredentials, response: Response) -> Dict[str, Any]:
    """계정을 생성하고 즉시 로그인 세션을 발급한다."""
    try:
        account = create_user_account(credentials.username, hash_password(credentials.password))
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=409, detail="이미 사용 중인 아이디입니다.") from error

    start_session(account, response)
    return {"user": public_account(account)}


@app.post("/api/auth/login")
def api_login(credentials: UsernameCredentials, response: Response) -> Dict[str, Any]:
    """저장된 scrypt 해시와 입력 비밀번호를 검증한 뒤 새 세션을 발급한다."""
    account = get_user_account_by_username(credentials.username)
    if not account or not verify_password(credentials.password, account["password_hash"]):
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")

    start_session(account, response)
    return {"user": public_account(account)}


@app.post("/api/auth/logout")
def api_logout(request: Request, response: Response) -> Dict[str, bool]:
    """현재 세션을 DB에서 무효화하고 브라우저 쿠키도 삭제한다."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        delete_auth_session(hash_session_token(token))
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )
    return {"ok": True}


@app.get("/api/auth/me")
def api_current_user(request: Request) -> Dict[str, Any]:
    """요청 쿠키에 연결된 현재 로그인 계정의 공개 정보를 조회한다."""
    account = get_authenticated_account(request)
    return {"user": public_account(account)}


@app.get("/api/favorites")
def api_list_favorites(request: Request) -> List[Dict[str, Any]]:
    """로그인한 사용자의 관심상품만 반환한다."""
    account = get_authenticated_account(request)
    return get_user_favorites(account["id"])


@app.post("/api/favorites", status_code=201)
def api_save_favorite(payload: FavoriteSaveRequest, request: Request) -> Dict[str, Any]:
    """매물 ID와 이름을 확인한 뒤 현재 사용자의 관심상품으로 저장한다."""
    account = get_authenticated_account(request)
    listing = payload.listing
    listing_id = str(listing.get("id") or "").strip()
    if not listing_id or not str(listing.get("name") or "").strip():
        raise HTTPException(status_code=422, detail="상품 ID와 이름이 필요합니다.")

    favorite_key = f"{listing.get('source') or 'listing'}:{listing_id}"
    save_user_favorite(account["id"], favorite_key, listing)
    return {"listing": listing}


@app.delete("/api/favorites/{favorite_key}")
def api_remove_favorite(favorite_key: str, request: Request) -> Dict[str, bool]:
    """현재 계정에서 지정된 관심 매물을 제거한다."""
    account = get_authenticated_account(request)
    delete_user_favorite(account["id"], favorite_key)
    return {"ok": True}


@app.post("/api/history", status_code=201)
def api_save_user_history(payload: UserAnalysisRecord, request: Request) -> Dict[str, bool]:
    """검증된 분석 기록을 현재 사용자 소유로 저장한다."""
    account = get_authenticated_account(request)
    save_user_analysis_record(account["id"], payload.model_dump())
    return {"saved": True}


@app.get("/api/products/search", response_model=SearchResponse)
def api_search_products(
    q: str = Query(default="", alias="q"),
    track: bool = Query(default=True),
) -> SearchResponse:
    """시장 공급자 검색 결과를 응답 스키마로 검증해 반환한다."""
    if track:
        record_search_query(q)
    items = search_products(q)
    return {"products": [ProductResponse(**product) for product in items]}


@app.get("/api/products/popular-searches")
def api_popular_searches(limit: int = Query(default=4, ge=1, le=20)) -> Dict[str, Any]:
    """최근 30일 누적 검색량이 많은 검색어를 순서대로 반환한다."""
    return {"searches": get_popular_searches(limit)}


@app.get("/api/products/{product_id}")
def api_get_product(product_id: int, q: str = Query(default="")) -> Dict[str, Any]:
    """검색어 범위 안에서 ID가 일치하는 상품을 조회한다."""
    product = get_product(product_id, q)
    if not product:
        raise HTTPException(status_code=404, detail="존재하지 않는 상품입니다.")
    return product


@app.get("/api/deals")
def api_get_deals(q: str = Query(..., min_length=1, alias="q")) -> List[Dict[str, Any]]:
    """검색어에 맞는 가격 확인 매물을 Flip Score순으로 반환한다."""
    return get_deals(q)


@app.post("/api/calculate")
def api_calculate(request: CalculateRequest) -> Dict[str, Any]:
    """사용자 입력 비용이 완전하면 수익을 계산하고 근거가 있는 점수만 반환한다."""
    if request.buy_price < 0 or request.expected_sell_price < 0 or any(
        value is not None and value < 0
        for value in (request.transaction_fee, request.shipping_cost, request.other_cost)
    ):
        raise HTTPException(status_code=400, detail="가격은 0 이상이어야 합니다.")
    result = calculate_product_summary(
        request.product_name,
        request.buy_price,
        request.expected_sell_price,
        request.transaction_fee,
        request.shipping_cost,
        request.other_cost,
        request.market_median_price,
        request.market_sample_count,
        request.freshness_days,
        request.freshness_coverage,
    )
    return result


@app.post("/api/analyze")
def api_analyze(payload: AnalyzeRequest, request: Request) -> Dict[str, Any]:
    """수익 시나리오를 분석하고 결과를 로그인 사용자의 이력에 저장한다."""
    account = get_authenticated_account(request)
    if any(value is None for value in (payload.transaction_fee, payload.shipping_cost, payload.other_cost)):
        raise HTTPException(status_code=400, detail="수수료, 배송비, 기타 비용을 입력해주세요. 비용이 없으면 0을 입력하세요.")
    if payload.buy_price < 0 or payload.expected_sell_price < 0 or any(
        value < 0 for value in (payload.transaction_fee, payload.shipping_cost, payload.other_cost)
    ):
        raise HTTPException(status_code=400, detail="가격은 0 이상이어야 합니다.")

    result = analyze_product(
        payload.product_name,
        payload.buy_price,
        payload.expected_sell_price,
        payload.transaction_fee,
        payload.shipping_cost,
        payload.other_cost,
        payload.market_median_price,
        payload.market_sample_count,
        payload.freshness_days,
        payload.freshness_coverage,
    )

    save_user_analysis_record(
        account["id"],
        {
            "product_name": payload.product_name,
            "buy_price": payload.buy_price,
            "expected_sell_price": result["expected_sell_price"],
            "other_cost": payload.transaction_fee + payload.shipping_cost + payload.other_cost,
            "expected_profit": result["profit"],
            "roi": result["roi"],
            "flip_score": result["flip_score"],
            "analysis_date": result["analysis_date"],
            "analysis_type": "analysis",
        }
    )

    return result


@app.get("/api/history")
def api_history(request: Request, limit: int = Query(default=10, ge=1, le=100)) -> List[Dict[str, Any]]:
    """최근 사용자 분석 기록을 프런트엔드가 쓰는 camelCase 필드로 변환한다."""
    account = get_authenticated_account(request)
    history = get_user_analysis_history(account["id"], limit)
    return [
        {
            "productName": item["product_name"],
            "buyPrice": item["buy_price"],
            "sellPrice": item["expected_sell_price"],
            "otherCost": item["other_cost"],
            "expectedProfit": item["expected_profit"],
            "roi": item["roi"],
            "flipScore": item["flip_score"],
            "analysisDate": item["analysis_date"],
            "type": item["analysis_type"],
        }
        for item in history
    ]
