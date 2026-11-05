// frontend/의 초기 데모 UI 스크립트. 현재 루트 UI와 별도로 샘플 데이터 기반 흐름을 유지한다.
const API_BASE = "http://localhost:8000";

// 화면 전환과 선택된 상세 상품만 기억하는 단순 데모 상태.
const state = {
  currentView: "home",
  currentProductId: null,
};

const STORAGE_KEYS = {
  users: "flipcheck_users",
  currentUser: "flipcheck_current_user",
  favorites: "flipcheck_favorites",
  analysisHistory: "flipcheck_analysis_history",
};

// 백엔드 연결이 불가능하거나 데모 화면을 표시할 때 쓰는 고정 상품 목록.
const demoProducts = [
  {
    id: 1,
    name: "iPhone 15 128GB",
    category: "스마트폰",
    averagePrice: 430000,
    minPrice: 390000,
    maxPrice: 470000,
    recommendedBuyPrice: 400000,
    expectedSellPrice: 450000,
    demand: 90,
    sellingDifficulty: 20,
    volatility: 15,
    source: "demo",
  },
  {
    id: 2,
    name: "iPhone 15 Pro 256GB",
    category: "스마트폰",
    averagePrice: 720000,
    minPrice: 650000,
    maxPrice: 820000,
    recommendedBuyPrice: 680000,
    expectedSellPrice: 770000,
    demand: 88,
    sellingDifficulty: 26,
    volatility: 18,
    source: "demo",
  },
  {
    id: 3,
    name: "AirPods Pro 2",
    category: "이어폰",
    averagePrice: 210000,
    minPrice: 170000,
    maxPrice: 250000,
    recommendedBuyPrice: 185000,
    expectedSellPrice: 225000,
    demand: 82,
    sellingDifficulty: 28,
    volatility: 20,
    source: "demo",
  },
  {
    id: 4,
    name: "Galaxy S25",
    category: "스마트폰",
    averagePrice: 660000,
    minPrice: 610000,
    maxPrice: 720000,
    recommendedBuyPrice: 630000,
    expectedSellPrice: 690000,
    demand: 80,
    sellingDifficulty: 30,
    volatility: 24,
    source: "demo",
  },
  {
    id: 5,
    name: "Nike Air Force 1",
    category: "신발",
    averagePrice: 150000,
    minPrice: 100000,
    maxPrice: 200000,
    recommendedBuyPrice: 120000,
    expectedSellPrice: 170000,
    demand: 75,
    sellingDifficulty: 35,
    volatility: 22,
    source: "demo",
  },
  {
    id: 6,
    name: "Adidas Samba",
    category: "신발",
    averagePrice: 120000,
    minPrice: 90000,
    maxPrice: 170000,
    recommendedBuyPrice: 95000,
    expectedSellPrice: 140000,
    demand: 72,
    sellingDifficulty: 38,
    volatility: 25,
    source: "demo",
  },
];

const pageRefs = {};

document.addEventListener("DOMContentLoaded", initializeApp);

// 페이지 요소와 이벤트를 준비하고 초기 데이터·화면을 표시한다.
function initializeApp() {
  cachePageRefs();
  bindEvents();
  syncAuthState();
  renderHomePopularProducts();
  populateCalculatorProducts();
  renderFavorites();
  renderMyPage();
  showPage("home");
  checkBackendHealth();
}

// HTML 요소 참조를 모아 반복적인 DOM 검색을 줄인다.
function cachePageRefs() {
  pageRefs.homeSection = document.getElementById("homeSection");
  pageRefs.searchSection = document.getElementById("searchSection");
  pageRefs.detailSection = document.getElementById("detailSection");
  pageRefs.calculatorSection = document.getElementById("calculatorSection");
  pageRefs.favoritesSection = document.getElementById("favoritesSection");
  pageRefs.authSection = document.getElementById("authSection");
  pageRefs.analysisSection = document.getElementById("analysisSection");
  pageRefs.mypageSection = document.getElementById("mypageSection");

  pageRefs.homeSearchForm = document.getElementById("homeSearchForm");
  pageRefs.searchForm = document.getElementById("searchForm");
  pageRefs.calculatorForm = document.getElementById("calculatorForm");
  pageRefs.analysisForm = document.getElementById("analysisForm");
  pageRefs.loginForm = document.getElementById("loginForm");
  pageRefs.signupForm = document.getElementById("signupForm");

  pageRefs.homeSearchInput = document.getElementById("homeSearchInput");
  pageRefs.searchInput = document.getElementById("searchInput");
  pageRefs.calculatorResult = document.getElementById("calculatorResult");
  pageRefs.calculatorProductSelect = document.getElementById("calcProductSelect");
  pageRefs.calculatorBuyPrice = document.getElementById("calcBuyPrice");
  pageRefs.calculatorSellPrice = document.getElementById("calcSellPrice");
  pageRefs.calculatorOtherCost = document.getElementById("calcOtherCost");
  pageRefs.analysisResult = document.getElementById("analysisResult");
  pageRefs.productDetailContent = document.getElementById("productDetailContent");
  pageRefs.popularProducts = document.getElementById("popularProducts");
  pageRefs.searchResults = document.getElementById("searchResults");
  pageRefs.favoritesContent = document.getElementById("favoritesContent");
  pageRefs.mypageContent = document.getElementById("mypageContent");
  pageRefs.mobileMenuToggle = document.getElementById("mobileMenuToggle");
  pageRefs.mainNav = document.getElementById("mainNav");
  pageRefs.logoutButton = document.getElementById("logoutButton");
  pageRefs.toast = document.getElementById("toast");
}

// 폼 제출, 화면 이동, 선택 메뉴와 동적 카드 클릭을 이벤트 처리기에 연결한다.
function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const view = event.currentTarget.dataset.view;
      if (view === "auth") {
        showPage("auth");
        return;
      }
      if (view === "favorites") {
        if (!getCurrentUser()) {
          showToast("관심상품을 사용하려면 로그인이 필요합니다.");
          showPage("auth");
          return;
        }
      }
      if (view === "mypage") {
        if (!getCurrentUser()) {
          showToast("마이페이지를 보려면 로그인이 필요합니다.");
          showPage("auth");
          return;
        }
      }
      showPage(view);
    });
  });

  pageRefs.homeSearchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const keyword = pageRefs.homeSearchInput.value.trim();
    if (!keyword) {
      showToast("검색어를 입력해주세요.");
      return;
    }
    showPage("search");
    pageRefs.searchInput.value = keyword;
    searchProductsAndRender(keyword);
  });

  pageRefs.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const keyword = pageRefs.searchInput.value.trim();
    if (!keyword) {
      showToast("검색어를 입력해주세요.");
      return;
    }
    searchProductsAndRender(keyword);
  });

  pageRefs.calculatorProductSelect.addEventListener("change", () => {
    applySelectedProductToCalculator();
  });

  pageRefs.calculatorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleCalculatorSubmit();
  });

  pageRefs.analysisForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleAnalysisSubmit();
  });

  pageRefs.loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    loginUser();
  });

  pageRefs.signupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    signupUser();
  });

  pageRefs.logoutButton.addEventListener("click", () => {
    logoutUser();
  });

  pageRefs.mobileMenuToggle.addEventListener("click", () => {
    pageRefs.mainNav.classList.toggle("open");
  });

  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.authTab;
      document.querySelectorAll("[data-auth-tab]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      document.getElementById("loginForm").classList.toggle("active-auth-form", tab === "login");
      document.getElementById("signupForm").classList.toggle("active-auth-form", tab === "signup");
    });
  });

  document.addEventListener("click", (event) => {
    const productCard = event.target.closest("[data-product-id]");
    if (productCard && !event.target.closest(".favorite-button") && !event.target.closest(".secondary-btn") && !event.target.closest("[data-action='toggle-favorite']")) {
      showProductDetail(Number(productCard.dataset.productId));
      return;
    }

    if (event.target.closest("[data-action='toggle-favorite']")) {
      const target = event.target.closest("[data-action='toggle-favorite']");
      toggleFavorite(Number(target.dataset.productId));
      return;
    }

    if (event.target.closest("[data-action='go-home']")) {
      showPage("home");
    }
  });
}

// 백엔드 상태를 확인해 연결 실패 시 데모 모드임을 사용자에게 알린다.
async function checkBackendHealth() {
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    if (!response.ok) {
      console.warn("Backend health check failed. Falling back to demo mode.");
      return;
    }
    const data = await response.json();
    console.log("Backend status:", data);
  } catch (error) {
    console.warn("Backend unavailable; demo mode enabled.", error.message);
    showToast("Demo 데이터 모드로 동작 중입니다.");
  }
}

// 데모 상품 이름과 분류에서 검색어가 포함된 항목을 찾는다.
function searchProducts(keyword) {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return demoProducts;
  return demoProducts.filter((product) => `${product.name} ${product.category}`.toLowerCase().includes(normalized));
}

// 백엔드 검색을 우선 실행하고 실패하면 같은 검색어의 데모 결과를 표시한다.
async function searchProductsAndRender(keyword) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${API_BASE}/api/products/search?q=${encodeURIComponent(keyword)}`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error("검색 API 오류");
    }
    const data = await response.json();
    const products = data.products && data.products.length ? data.products : searchProducts(keyword);
    renderProductList(products, pageRefs.searchResults, true);
  } catch (error) {
    const products = searchProducts(keyword);
    renderProductList(products, pageRefs.searchResults, true);
  } finally {
    clearTimeout(timeoutId);
  }
}

// 홈 화면의 샘플 상품과 계산기 선택 목록을 초기화한다.
function renderHomePopularProducts() {
  renderProductList(demoProducts.slice(0, 5), pageRefs.popularProducts, false);
  populateCalculatorProducts();
}

// 관심 데모 상품을 계산기 선택 항목으로 구성한다.
function populateCalculatorProducts() {
  const favoriteIds = getFavoriteIds();
  const favoriteProducts = demoProducts.filter((product) => favoriteIds.includes(product.id));
  const options = favoriteProducts.length
    ? favoriteProducts.map((product) =>
        `<option value="${product.id}">${product.name} · ${formatPrice(product.maxPrice)}</option>`
      )
    : ['<option value="">관심상품을 먼저 저장해주세요.</option>'];

  pageRefs.calculatorProductSelect.innerHTML = options.join("");
  pageRefs.calculatorProductSelect.disabled = favoriteProducts.length === 0;
  applySelectedProductToCalculator();
}

// 선택된 데모 관심상품의 매입가·판매가·비용을 계산기 입력란에 채운다.
function applySelectedProductToCalculator() {
  const selectedProduct = demoProducts.find((product) => String(product.id) === pageRefs.calculatorProductSelect.value);
  if (!selectedProduct) return;

  pageRefs.calculatorBuyPrice.value = selectedProduct.recommendedBuyPrice;
  pageRefs.calculatorSellPrice.value = selectedProduct.maxPrice || selectedProduct.expectedSellPrice;
  pageRefs.calculatorOtherCost.value = "10000";
}

// 전달된 대상 요소에 공통 상품 카드 목록을 출력한다.
function renderProductList(products, target, showFlipLabel = false) {
  if (!products.length) {
    target.innerHTML = '<div class="empty-state">검색 결과가 없습니다.</div>';
    return;
  }

  target.innerHTML = products.map((product) => {
    const score = calculateFlipScore(product, product.recommendedBuyPrice, product.expectedSellPrice);
    return `
      <article class="product-card" data-product-id="${product.id}">
        <div class="product-card-header">
          <h3>${product.name}</h3>
          <span class="product-category">${product.category}</span>
        </div>

        <div class="product-card-meta">
          <div>
            <div class="price-label">평균 시세</div>
            <div class="price-value">${formatPrice(product.averagePrice)}</div>
          </div>
          <span class="score-pill ${getFlipScoreClass(score)}">${showFlipLabel ? score : getFlipScoreLabel(score)}</span>
        </div>

        <div class="product-card-meta">
          <div>
            <div class="price-label">예상 판매가</div>
            <div class="price-value">${formatPrice(product.expectedSellPrice)}</div>
          </div>
          <div>
            <div class="price-label">Flip Score</div>
            <div class="price-value">${score}</div>
          </div>
        </div>

        <div class="product-card-actions">
          <button type="button" class="ghost-btn" data-product-id="${product.id}">상세 보기</button>
          <button type="button" class="favorite-button ${getFavoriteIds().includes(product.id) ? "active" : ""}" data-action="toggle-favorite" data-product-id="${product.id}">
            ${getFavoriteIds().includes(product.id) ? "♥ 저장됨" : "♡ 관심상품"}
          </button>
        </div>
      </article>
    `;
  }).join("");
}

// 상품 상세 API를 조회하고 실패하면 로컬 데모 데이터로 화면을 구성한다.
async function showProductDetail(productId) {
  try {
    const response = await fetch(`${API_BASE}/api/products/${productId}`);
    const product = response.ok ? await response.json() : demoProducts.find((item) => item.id === productId);
    if (!product) {
      showToast("존재하지 않는 상품입니다.");
      return;
    }

    state.currentProductId = productId;
    const score = calculateFlipScore(product, product.recommendedBuyPrice, product.expectedSellPrice);
    const isFavorite = getFavoriteIds().includes(productId);

    pageRefs.productDetailContent.innerHTML = `
      <div class="detail-top">
        <div class="detail-title">
          <h2>${product.name}</h2>
          <span class="score-pill ${getFlipScoreClass(score)}">${score}점</span>
        </div>
        <div class="product-card-actions">
          <button type="button" class="favorite-button ${isFavorite ? "active" : ""}" data-action="toggle-favorite" data-product-id="${product.id}">
            ${isFavorite ? "♥ 관심상품 취소" : "♡ 관심상품"}
          </button>
          <button type="button" class="secondary-btn" data-action="go-home">홈으로</button>
        </div>
      </div>

      <div class="detail-summary">
        <div class="summary-block">
          <h3>현재 중고 시세</h3>
          <p style="color: var(--muted); margin-top: 8px;">DEMO DATA</p>
          <div class="detail-price-row">
            <div class="detail-price-box"><span>최저가</span><strong>${formatPrice(product.minPrice)}</strong></div>
            <div class="detail-price-box"><span>평균가</span><strong>${formatPrice(product.averagePrice)}</strong></div>
            <div class="detail-price-box"><span>최고가</span><strong>${formatPrice(product.maxPrice)}</strong></div>
          </div>
          <div class="market-metrics">
            <div class="metric-row"><span>추천 매입가</span><strong>${formatPrice(product.recommendedBuyPrice)}</strong></div>
            <div class="metric-row"><span>예상 판매가</span><strong>${formatPrice(product.expectedSellPrice)}</strong></div>
            <div class="metric-row"><span>수요</span><strong>${product.demand}/100</strong></div>
            <div class="metric-row"><span>판매 난이도</span><strong>${product.sellingDifficulty}/100</strong></div>
            <div class="metric-row"><span>가격 변동성</span><strong>${product.volatility}/100</strong></div>
          </div>
        </div>

        <div class="price-block">
          <h3>Flip Score</h3>
          <div class="score-line">
            <span class="score-pill ${getFlipScoreClass(score)}">${score}</span>
            <span>${getFlipScoreLabel(score)}</span>
          </div>
          <div class="bar-wrap"><div class="bar" style="width: ${score}%"></div></div>
          <div class="market-metrics">
            <div class="metric-row"><span>예상 수익</span><strong>${formatPrice(product.expectedSellPrice - product.recommendedBuyPrice)}</strong></div>
            <div class="metric-row"><span>ROI</span><strong>${calculateROI(product.recommendedBuyPrice, product.expectedSellPrice, 0).toFixed(1)}%</strong></div>
          </div>
        </div>
      </div>
    `;

    showPage("detail");
  } catch (error) {
    showToast("상품 상세 정보를 불러오지 못했습니다.");
  }
}

// 수익률·수요·난이도·변동성을 합산해 데모용 0~100 점수를 계산한다.
function calculateFlipScore(product, buyPrice, sellPrice) {
  const profitRatePercent = ((sellPrice - buyPrice) / Math.max(buyPrice, 1)) * 100;
  const profitabilityScore = Math.min(100, Math.max(0, profitRatePercent * 3));
  const demandScore = product.demand;
  const difficultyScore = 100 - product.sellingDifficulty;
  const volatilityScore = 100 - product.volatility;
  const weightedScore = demandScore * 0.4 + difficultyScore * 0.25 + volatilityScore * 0.15 + profitabilityScore * 0.2;
  return Math.min(100, Math.max(0, Math.round(weightedScore)));
}

// Flip Score를 카드의 상태 색상 클래스로 변환한다.
function getFlipScoreClass(score) {
  if (score >= 90) return "good";
  if (score >= 75) return "good";
  if (score >= 60) return "moderate";
  if (score >= 40) return "moderate";
  return "bad";
}

// 점수 구간을 추천 매입 문구로 변환한다.
function getFlipScoreLabel(score) {
  if (score >= 90) return "매우 좋은 매물";
  if (score >= 75) return "구매 고려";
  if (score >= 60) return "애매함";
  if (score >= 40) return "비추천";
  return "손해 가능성 높음";
}

// 매입가와 부대 비용을 차감한 순수익을 계산한다.
function calculateProfit(buyPrice, sellPrice, otherCost) {
  return sellPrice - buyPrice - otherCost;
}

// 매입가 대비 순수익 비율을 퍼센트로 계산한다.
function calculateROI(buyPrice, sellPrice, otherCost) {
  if (!buyPrice || buyPrice <= 0) return 0;
  return ((sellPrice - buyPrice - otherCost) / buyPrice) * 100;
}

// 금액을 한국 원화 문자열로 표시한다.
function formatPrice(value) {
  return `${new Intl.NumberFormat("ko-KR").format(Number(value || 0))}원`;
}

// 입력값 검증 후 서버 계산을 요청하고, 실패 시 브라우저 계산 결과를 사용한다.
async function handleCalculatorSubmit() {
  const selectedProduct = demoProducts.find((product) => String(product.id) === pageRefs.calculatorProductSelect.value);
  const productName = selectedProduct?.name || "";
  const buyPrice = Number(pageRefs.calculatorBuyPrice.value);
  const sellPrice = Number(pageRefs.calculatorSellPrice.value);
  const otherCost = Number(pageRefs.calculatorOtherCost.value || 0);

  if (!productName) { showToast("매물을 선택해주세요."); return; }
  if (!Number.isFinite(buyPrice) || !Number.isFinite(sellPrice)) { showToast("숫자 형태의 가격을 입력해주세요."); return; }
  if (buyPrice < 0 || sellPrice < 0 || otherCost < 0) { showToast("가격은 0 이상이어야 합니다."); return; }
  if (sellPrice <= buyPrice + otherCost) { showToast("판매 가능한 최고가가 매입가와 비용을 감당하지 못합니다. 판매가를 다시 확인해주세요."); return; }

  try {
    const response = await fetch(`${API_BASE}/api/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_name: productName, buy_price: buyPrice, expected_sell_price: sellPrice, other_cost: otherCost, condition: "A" }),
    });
    const data = response.ok ? await response.json() : null;

    const profit = data ? data.profit : calculateProfit(buyPrice, sellPrice, otherCost);
    const roi = data ? data.roi : calculateROI(buyPrice, sellPrice, otherCost);
    const flipScore = data ? data.flip_score : Math.max(0, Math.min(100, Math.round((roi + 60) / 1.5)));
    const recommendation = roi > 20 ? "구매 추천" : roi > 8 ? "구매 고려" : "비추천";
    const recommendationClass = roi > 20 ? "good" : roi > 8 ? "moderate" : "bad";

    pageRefs.calculatorResult.innerHTML = `
      <div class="result-card">
        <div class="detail-title">
          <h3>${productName}</h3>
          <span class="score-pill ${recommendationClass}">${recommendation}</span>
        </div>
        <div class="result-summary">
          <div class="metric-card"><div class="metric-label">예상 수익</div><div class="metric-value accent">${formatPrice(profit)}</div></div>
          <div class="metric-card"><div class="metric-label">ROI</div><div class="metric-value">${Number(roi).toFixed(1)}%</div></div>
          <div class="metric-card"><div class="metric-label">Flip Score</div><div class="metric-value">${flipScore}</div></div>
        </div>
      </div>
    `;
    pageRefs.calculatorResult.classList.remove("hidden");

    saveAnalysisRecord({
      productName,
      buyPrice,
      expectedSellPrice: sellPrice,
      expectedProfit: profit,
      roi,
      flipScore,
      analysisDate: new Date().toISOString(),
      type: "calculator",
    });

    showToast("수익 계산이 완료되었습니다.");
  } catch (error) {
    showToast("수익 계산에 실패했습니다.");
  }
}

// 상품 상태와 가격으로 서버 분석을 요청하고 응답 또는 데모 대체 결과를 렌더링한다.
async function handleAnalysisSubmit() {
  const productName = document.getElementById("analysisProductName").value.trim();
  const buyPrice = Number(document.getElementById("analysisBuyPrice").value);
  const sellPrice = Number(document.getElementById("analysisSellPrice").value);
  const condition = document.getElementById("analysisCondition").value;

  if (!productName) { showToast("상품명을 입력해주세요."); return; }
  if (!Number.isFinite(buyPrice) || !Number.isFinite(sellPrice)) { showToast("숫자 형태의 가격을 입력해주세요."); return; }
  if (buyPrice < 0 || sellPrice < 0) { showToast("가격은 0 이상이어야 합니다."); return; }

  try {
    const response = await fetch(`${API_BASE}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_name: productName, buy_price: buyPrice, expected_sell_price: sellPrice, other_cost: 6000, condition })
    });
    const result = response.ok ? await response.json() : null;

    const estimatedMarketPrice = result ? result.estimated_market_price || sellPrice : sellPrice * 0.92;
    const expectedSellPrice = result ? result.expected_sell_price : sellPrice;
    const expectedProfit = result ? result.profit : Math.max(0, expectedSellPrice - buyPrice - 6000);
    const roi = result ? result.roi : calculateROI(buyPrice, expectedSellPrice, 6000);
    const flipScore = result ? result.flip_score : 75;
    const recommendation = result ? result.recommendation : (flipScore >= 75 ? "구매 고려" : flipScore >= 60 ? "애매함" : "비추천");
    const recommendationClass = flipScore >= 75 ? "good" : flipScore >= 60 ? "moderate" : "bad";

    pageRefs.analysisResult.innerHTML = `
      <div class="result-card">
        <div class="detail-title">
          <h3>${productName}</h3>
          <span class="score-pill ${recommendationClass}">${flipScore}</span>
        </div>
        <div class="result-summary">
          <div class="metric-card"><div class="metric-label">예상 시세</div><div class="metric-value">${formatPrice(estimatedMarketPrice)}</div></div>
          <div class="metric-card"><div class="metric-label">예상 판매가</div><div class="metric-value">${formatPrice(expectedSellPrice)}</div></div>
          <div class="metric-card"><div class="metric-label">예상 수익</div><div class="metric-value accent">${formatPrice(expectedProfit)}</div></div>
          <div class="metric-card"><div class="metric-label">ROI</div><div class="metric-value">${Number(roi).toFixed(1)}%</div></div>
          <div class="metric-card"><div class="metric-label">Flip Score</div><div class="metric-value">${flipScore}</div></div>
          <div class="metric-card"><div class="metric-label">추천 여부</div><div class="metric-value">${recommendation}</div></div>
        </div>
      </div>
    `;
    pageRefs.analysisResult.classList.remove("hidden");

    saveAnalysisRecord({
      productName,
      buyPrice,
      expectedSellPrice,
      expectedProfit,
      roi,
      flipScore,
      analysisDate: new Date().toISOString(),
      type: "analysis",
    });

    showToast("매물 분석이 완료되었습니다.");
  } catch (error) {
    showToast("매물 분석에 실패했습니다.");
  }
}

// 관심상품 ID를 브라우저 저장소에서 읽고 배열 형식을 보장한다.
function getFavoriteIds() {
  const favorites = JSON.parse(localStorage.getItem(STORAGE_KEYS.favorites) || "[]");
  return Array.isArray(favorites) ? favorites : [];
}

// 관심상품 ID 목록을 브라우저 저장소에 기록한다.
function saveFavoriteIds(favorites) {
  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(favorites));
}

// 데모 관심상품을 토글하고 관심상품·마이페이지·계산기 선택 목록을 갱신한다.
function toggleFavorite(productId) {
  const favorites = getFavoriteIds();
  const nextFavorites = favorites.includes(productId)
    ? favorites.filter((id) => id !== productId)
    : [...favorites, productId];

  saveFavoriteIds(nextFavorites);
  renderFavorites();
  renderMyPage();
  populateCalculatorProducts();

  if (state.currentProductId === productId) {
    showProductDetail(productId);
  }

  showToast(nextFavorites.includes(productId) ? "관심상품에 저장되었습니다." : "관심상품에서 제거되었습니다.");
}

// 로컬 저장된 관심 ID에 해당하는 데모 상품 카드들을 출력한다.
function renderFavorites() {
  const favorites = getFavoriteIds();
  if (!favorites.length) {
    pageRefs.favoritesContent.innerHTML = '<div class="empty-state">저장된 관심상품이 없습니다.</div>';
    return;
  }

  const favoriteProducts = demoProducts.filter((product) => favorites.includes(product.id));
  pageRefs.favoritesContent.innerHTML = favoriteProducts.map((product) => `
    <article class="favorite-item" data-product-id="${product.id}">
      <div class="favorite-header">
        <div>
          <h3>${product.name}</h3>
          <p>${product.category}</p>
        </div>
        <button type="button" class="secondary-btn" data-action="toggle-favorite" data-product-id="${product.id}">관심 해제</button>
      </div>
      <p>평균 시세: ${formatPrice(product.averagePrice)} / 예상 판매가: ${formatPrice(product.expectedSellPrice)}</p>
    </article>
  `).join("");
}

// 브라우저 저장소에서 현재 데모 로그인 사용자를 읽는다.
function getCurrentUser() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.currentUser) || "null");
}

// 현재 데모 사용자 정보를 브라우저 저장소에 기록한다.
function saveCurrentUser(user) {
  localStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify(user));
}

// 데모 사용자 목록을 읽고 배열 형식이 아니면 빈 배열로 보정한다.
function getUsers() {
  const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.users) || "[]");
  return Array.isArray(users) ? users : [];
}

// 데모 사용자 목록을 브라우저 저장소에 기록한다.
function saveUsers(users) {
  localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
}

// 저장된 데모 계정의 이메일과 비밀번호를 확인하고 로그인 화면을 갱신한다.
function loginUser() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  if (!email || !password) { showToast("이메일과 비밀번호를 모두 입력해주세요."); return; }

  const users = getUsers();
  const matchedUser = users.find((user) => user.email === email && user.password === password);
  if (!matchedUser) { showToast("입력한 정보와 일치하는 계정이 없습니다."); return; }

  saveCurrentUser({ id: matchedUser.id, nickname: matchedUser.nickname, email: matchedUser.email });
  syncAuthState();
  renderMyPage();
  showPage("mypage");
  showToast("로그인되었습니다.");
  pageRefs.loginForm.reset();
}

// 브라우저 저장소에 데모 계정을 추가하고 로그인 상태로 전환한다.
function signupUser() {
  const nickname = document.getElementById("signupNickname").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value.trim();

  if (!nickname || !email || !password) { showToast("닉네임, 이메일, 비밀번호를 모두 입력해주세요."); return; }

  const users = getUsers();
  if (users.find((user) => user.email === email)) { showToast("이미 사용 중인 이메일입니다."); return; }

  const newUser = { id: Date.now(), nickname, email, password };
  users.push(newUser);
  saveUsers(users);

  // 현재 인증 시스템은 데모용입니다.
  // 실제 서비스에서는 비밀번호를 localStorage에 저장하면 안 됩니다.
  // 실서비스에서는 서버 인증과 안전한 비밀번호 해싱을 사용해야 합니다.
  saveCurrentUser({ id: newUser.id, nickname: newUser.nickname, email: newUser.email });
  syncAuthState();
  renderMyPage();
  showPage("mypage");
  showToast("회원가입이 완료되었습니다.");
  pageRefs.signupForm.reset();
}

// 브라우저에 캐시된 데모 계정을 지우고 홈 화면으로 돌아간다.
function logoutUser() {
  localStorage.removeItem(STORAGE_KEYS.currentUser);
  syncAuthState();
  showPage("home");
  showToast("로그아웃되었습니다.");
}

// 로그인 상태에 맞춰 인증 전/후 내비게이션을 전환한다.
function syncAuthState() {
  const currentUser = getCurrentUser();
  document.querySelectorAll(".login-only").forEach((button) => {
    button.classList.toggle("hidden", Boolean(currentUser));
  });
  document.querySelectorAll(".auth-only").forEach((button) => {
    button.classList.toggle("hidden", !currentUser);
  });
}

// 지정된 섹션만 보이게 하고 내비게이션 메뉴를 닫는다.
function showPage(view) {
  state.currentView = view;
  const sections = [
    pageRefs.homeSection,
    pageRefs.searchSection,
    pageRefs.detailSection,
    pageRefs.calculatorSection,
    pageRefs.favoritesSection,
    pageRefs.authSection,
    pageRefs.analysisSection,
    pageRefs.mypageSection,
  ];

  sections.forEach((section) => section.classList.remove("active"));

  const targetMap = {
    home: pageRefs.homeSection,
    search: pageRefs.searchSection,
    detail: pageRefs.detailSection,
    calculator: pageRefs.calculatorSection,
    favorites: pageRefs.favoritesSection,
    auth: pageRefs.authSection,
    analysis: pageRefs.analysisSection,
    mypage: pageRefs.mypageSection,
  };

  const target = targetMap[view];
  if (target) target.classList.add("active");

  if (pageRefs.mainNav) pageRefs.mainNav.classList.remove("open");
}

// 데모 계산 기록을 최근 10개까지만 브라우저 저장소에 보관한다.
function saveAnalysisRecord(record) {
  const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.analysisHistory) || "[]");
  const nextHistory = [record, ...history].slice(0, 10);
  localStorage.setItem(STORAGE_KEYS.analysisHistory, JSON.stringify(nextHistory));
  renderMyPage();
}

// 브라우저 저장소에 보관된 분석 기록을 반환한다.
function loadAnalysisHistory() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.analysisHistory) || "[]");
}

// 데모 사용자 통계와 최근 분석 내역을 마이페이지에 렌더링한다.
function renderMyPage() {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    pageRefs.mypageContent.innerHTML = '<div class="empty-state">로그인이 필요합니다.</div>';
    return;
  }

  const favorites = getFavoriteIds();
  const history = loadAnalysisHistory();
  const recentHistory = history.slice(0, 5);

  pageRefs.mypageContent.innerHTML = `
    <div class="mypage-card">
      <div class="mypage-header">
        <h2>안녕하세요, ${currentUser.nickname}님</h2>
      </div>

      <div class="mypage-stats">
        <div class="analysis-stat"><span>관심상품</span><strong>${favorites.length}</strong></div>
        <div class="analysis-stat"><span>분석 횟수</span><strong>${history.length}</strong></div>
        <div class="analysis-stat"><span>거래 기록</span><strong>${recentHistory.length}</strong></div>
      </div>

      <div class="section-header"><h2>최근 분석</h2></div>
      ${recentHistory.length ? recentHistory.map((item) => `
        <div class="history-item">
          <div class="meta">
            <h3>${item.productName}</h3>
            <p>${new Date(item.analysisDate).toLocaleDateString("ko-KR")} · ${item.type === "calculator" ? "수익 계산기" : "매물 분석"}</p>
          </div>
          <div class="meta-right">
            <p>매입가: ${formatPrice(item.buyPrice || 0)}</p>
            <p>예상 판매가: ${formatPrice(item.expectedSellPrice || 0)}</p>
            <p>예상 수익: ${formatPrice(item.expectedProfit || 0)}</p>
            <p>Flip Score: ${item.flipScore || 0}</p>
          </div>
        </div>
      `).join("") : '<div class="empty-state">아직 분석 기록이 없습니다.</div>'}
    </div>
  `;
}

// 짧은 상태 알림을 표시하고 이전 알림 타이머를 정리한다.
function showToast(message) {
  pageRefs.toast.textContent = message;
  pageRefs.toast.classList.add("show");
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => pageRefs.toast.classList.remove("show"), 2200);
}
