# FlipCheck

FlipCheck은 중고 매물의 게시 가격과 비교 매물 가격을 참고해 재판매 시나리오의 예상 수익과 Flip Score를 계산하는 서비스입니다.

## 프로젝트 구조

```text
FlipCheck/
├── index.html              # 현재 프런트엔드
├── style.css
├── script.js
├── frontend/
│   ├── index.html           # 루트 화면으로 이동하는 호환 경로
│   ├── script.js            # 이전 데모 코드, 현재 화면에서 미사용
│   └── style.css            # 이전 데모 스타일, 현재 화면에서 미사용
└── backend/
    ├── main.py
    ├── database.py
    ├── models.py
    ├── schemas.py
    └── services/
        ├── market_service.py
        ├── flip_score.py
        ├── data_provider.py
        └── tavily_provider.py
```

## 실행 방법

### Node.js 및 npm으로 전체 앱 실행

현재 프런트엔드는 Vite 개발 서버로 제공하고, `/api` 요청은 FastAPI 백엔드로 전달합니다. Node.js 22.12 이상과 Python 3.11 이상이 필요합니다.

```powershell
# 최초 한 번: Python 가상환경과 백엔드 의존성 설치
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt

# 최초 한 번: 프런트엔드 개발 도구 설치
npm.cmd install

# 프런트엔드와 백엔드를 함께 실행
npm.cmd run dev
```

브라우저에서 `http://127.0.0.1:5173`을 엽니다. 종료할 때는 터미널에서 `Ctrl+C`를 누릅니다. 가상환경을 사용하지 않는 경우에는 `python -m pip install -r backend\requirements.txt`로 백엔드 의존성을 설치하면 됩니다.

Vite 개발 서버는 화면을 제공하고, `/api` 요청을 `127.0.0.1:8000`의 FastAPI 백엔드로 프록시합니다. `npm.cmd run build`는 정적 프런트엔드를 `dist/`에 빌드합니다. 백엔드도 별도로 배포해야 검색, 로그인, 관심 매물 등 API 기능을 사용할 수 있습니다.

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend는 `http://localhost:8000`에서 실행됩니다.

### Frontend (기존 정적 서버 실행 방법)

프로젝트 루트에서 정적 서버를 실행합니다.

```bash
python -m http.server 5500
```

브라우저에서 `http://localhost:5500`을 엽니다. `file://`로 HTML을 직접 열면 API 요청이 CORS 정책에 막힐 수 있습니다.

## 검색 데이터와 가격 안내

기본 공급자는 Tavily 공개 웹 검색입니다. 결과 중 당근 중고 매물 링크만 사용하며, 매물 페이지의 구조화된 가격 정보나 가격 메타 태그에서 게시 가격을 확인합니다. 검색 요약 문구의 숫자는 게시 가격으로 사용하지 않습니다. 페이지에서 가격을 확인하지 못하면 해당 매물은 가격 비교 계산에서 제외됩니다.

검색 중앙값은 해당 검색 결과에서 페이지 가격을 확인한 활성 매물의 등록 가격으로 계산합니다. 이 중앙값은 완료 거래가나 추천 판매가가 아닙니다.

검색 결과는 정규화한 검색어별로 30분간 같은 가격 스냅샷을 재사용합니다. 검색 요약에 표시된 기준 시각은 해당 스냅샷을 처음 가져온 시각입니다.

검색 공급자와 API 키는 프로젝트 루트의 `.env`에서 설정합니다.

```env
DATA_PROVIDER=tavily
TAVILY_API_KEY=your-tavily-api-key
```

오프라인 샘플이 필요한 경우 `DATA_PROVIDER=demo`를 지정합니다. 검색 실패 시 Tavily 결과를 샘플 가격으로 대체하지 않습니다.

## Flip Score 산정 기준

- Flip Score는 0~100점이며 기본 가중치는 비용 차감 수익성 35%, 매입가 메리트 20%, 판매 회전성 20%, 상품 수요 15%, 거래·가격 리스크 10%입니다. 상품군, 비교 표본 수, 게시가 분산에 따라 가중치를 조정하고 실제 산출 가능한 항목만 다시 정규화합니다. 빠진 항목을 임의의 숫자로 채우지 않으며 일부 항목만 평가되면 잠정 점수로 표시합니다.
- 비용 차감 수익성은 순수익을 매입가로 나눈 ROI 점수(65%)와 원화 순수익 규모 점수(35%)를 합칩니다. 매입가 메리트는 게시 가격 중앙값보다 얼마나 낮게 매입하는지 평가하며, 완료 거래가가 아닌 활성 매물 게시가를 참고값으로 씁니다. 최소 3개의 확인된 게시가가 있어야 점수에 반영합니다.
- 판매 회전성, 수요, 거래·가격 리스크는 각각 실제 판매 소요 기간·완료율, 거래 빈도, 상태·정품·수리·기간별 거래가 자료가 있을 때만 산출합니다. 현재 검색 데이터에 없는 값은 비워둡니다.
- 등록 매물의 가격은 판매자가 제시한 등록가입니다. 현재 검색 공급자는 실제 거래 완료 가격을 제공하지 않으므로 완료 가격은 별도 필드로 비워두고 등록가 표본 중앙값과 구분합니다.
- 순수익은 예상 판매가에서 매입가, 거래 수수료, 배송비, 기타 비용을 뺍니다. 간편 계산기는 부대 비용을 0원으로 가정하며, 매물 분석에서 비용을 직접 입력할 수 있습니다.
- 판매 회전성, 수요, 거래·가격 리스크 자료는 현재 공급자에서 확인할 수 없으므로 임의 점수를 넣지 않습니다. 근거가 없는 항목은 산출에서 제외하며, 근거가 하나도 없으면 점수를 표시하지 않습니다.
- 각 점수에는 동적 가중치, 실제 반영 가중치, 항목별 산식·근거·점수 기여도와 미산출 이유가 포함됩니다.

## 주요 API

- `GET /api/health`
- `GET /api/products/search?q=iPhone`
- `GET /api/products/{id}?q=iPhone`
- `GET /api/deals?q=iPhone`
- `POST /api/calculate`
- `POST /api/analyze`
- `GET /api/history`

## 현재 화면

프로젝트 루트의 `index.html`, `style.css`, `script.js`가 현재 UI입니다. 이전 실행 경로인 `frontend/index.html`은 루트 화면으로 이동하며, `frontend/script.js`와 `frontend/style.css`는 현재 화면에서 사용하지 않습니다.
