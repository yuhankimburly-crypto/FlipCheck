// 루트 UI의 검색·추천 가격·인증·계정 기능을 연결하는 브라우저 앱 진입점.
// Vite 개발 서버와 배포 프록시가 같은 호스트의 API 경로로 전달한다.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

// 화면 상세정보와 점수 표시에서 사용하는 데모 상품 데이터.
const products = [
  {
    id: 1,
    name: "iPhone 15 128GB",
    category: "스마트폰",
    averagePrice: 430000,
    minPrice: 390000,
    maxPrice: 470000,
    recommendedBuyPrice: 400000,
    expectedSellPrice: 450000,
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
  },
];

const STORAGE_KEYS = {
  users: "flipcheck_users",
  currentUser: "flipcheck_current_user",
  favorites: "flipcheck_favorites",
  liveFavorites: "flipcheck_live_favorites",
  analysisHistory: "flipcheck_analysis_history",
  availableCapital: "flipcheck_available_capital",
  recentSearches: "flipcheck_recent_searches",
};

// 화면 간 공유가 필요한 검색 결과와 서버에서 동기화한 계정 데이터를 보관한다.
const state = {
  currentView: "home",
  currentProductId: null,
  currentLiveListing: null,
  currentSearchResults: [],
  homeRecommendations: [],
  homeRecommendationRequestId: 0,
  calculatorContext: null,
  analysisContext: null,
  pendingListingAnalysis: null,
  availableCapital: null,
  liveFavorites: [],
  analysisHistory: [],
  sessionReady: null,
};

const pageRefs = {};

document.addEventListener("DOMContentLoaded", initializeApp);
document.addEventListener("submit", (event) => {
  event.preventDefault();
}, true);
// 동적 카드 버튼의 기본 링크/폼 동작을 초기화 완료 여부와 관계없이 차단한다.
document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action='toggle-live-favorite'], [data-action='toggle-favorite'], [data-action='calculate-listing']");
  if (action) event.preventDefault();
}, true);

// DOM 준비 후 이벤트 연결, 초기 화면 렌더링, 서버 세션 복원을 시작한다.
function initializeApp() {
  cachePageRefs();
  initializeCapitalInputs();
  bindEvents();
  syncAuthState();
  renderFavorites();
  populateCalculatorFavoriteSelect();
  renderMyPage();
  renderRecentSearches();
  showPage("home");
  state.sessionReady = restoreServerSession();
}

// 인증된 API 요청에 쿠키 세션을 포함시킨다.
async function fetchWithSession(path, options = {}) {
  return fetch(`${API_BASE}${path}`, { ...options, credentials: "include" });
}

// 새로고침 후 서버 세션을 확인하고 로컬 UI 상태를 계정 데이터로 다시 맞춘다.
async function restoreServerSession() {
  try {
    const response = await fetchWithSession("/api/auth/me");
    if (!response.ok) {
      throw new Error("No active session");
    }
    const payload = await response.json();
    saveCurrentUser(payload.user);
    await refreshAccountData();
  } catch {
    localStorage.removeItem(STORAGE_KEYS.currentUser);
    state.liveFavorites = [];
    state.analysisHistory = [];
  }

  syncAuthState();
  renderFavorites();
  populateCalculatorFavoriteSelect();
  renderMyPage();
}

// 관심상품과 분석 이력을 병렬로 받아 현재 사용자 상태에 반영한다.
async function refreshAccountData() {
  const [favoritesResponse, historyResponse] = await Promise.all([
    fetchWithSession("/api/favorites"),
    fetchWithSession("/api/history"),
  ]);
  if (!favoritesResponse.ok || !historyResponse.ok) {
    throw new Error("계정 데이터를 불러오지 못했습니다.");
  }

  const [favorites, history] = await Promise.all([
    favoritesResponse.json(),
    historyResponse.json(),
  ]);
  state.liveFavorites = Array.isArray(favorites) ? favorites : [];
  state.analysisHistory = Array.isArray(history) ? history : [];
}

// HTML 요소를 한 번 찾아 저장해 이후 렌더링과 이벤트 처리에서 재사용한다.
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
  pageRefs.calculatorFavoriteSelect = document.getElementById("calcFavoriteSelect");
  pageRefs.calculatorSuggestion = document.getElementById("calculatorSuggestion");
  pageRefs.analysisForm = document.getElementById("analysisForm");
  pageRefs.loginForm = document.getElementById("loginForm");
  pageRefs.signupForm = document.getElementById("signupForm");

  pageRefs.homeSearchInput = document.getElementById("homeSearchInput");
  pageRefs.homeCapitalInput = document.getElementById("homeCapitalInput");
  pageRefs.searchInput = document.getElementById("searchInput");
  pageRefs.searchCapitalInput = document.getElementById("searchCapitalInput");
  pageRefs.calculatorResult = document.getElementById("calculatorResult");
  pageRefs.analysisResult = document.getElementById("analysisResult");
  pageRefs.productDetailContent = document.getElementById("productDetailContent");
  pageRefs.searchResults = document.getElementById("searchResults");
  pageRefs.homeRecommendations = document.getElementById("homeRecommendations");
  pageRefs.favoritesContent = document.getElementById("favoritesContent");
  pageRefs.mypageContent = document.getElementById("mypageContent");
  pageRefs.mobileMenuToggle = document.getElementById("mobileMenuToggle");
  pageRefs.mainNav = document.getElementById("mainNav");
  pageRefs.logoutButton = document.getElementById("logoutButton");
  pageRefs.toast = document.getElementById("toast");
}

function initializeCapitalInputs() {
  const savedCapital = localStorage.getItem(STORAGE_KEYS.availableCapital);
  if (savedCapital === null) return;

  const capital = Number(savedCapital);
  if (!Number.isFinite(capital) || capital < 0) {
    localStorage.removeItem(STORAGE_KEYS.availableCapital);
    return;
  }

  state.availableCapital = capital;
  pageRefs.homeCapitalInput.value = String(capital);
  pageRefs.searchCapitalInput.value = String(capital);
}

function syncCapitalInputs(sourceInput) {
  const rawValue = sourceInput.value.trim();
  const otherInput = sourceInput === pageRefs.homeCapitalInput
    ? pageRefs.searchCapitalInput
    : pageRefs.homeCapitalInput;
  otherInput.value = rawValue;

  if (!rawValue) {
    state.availableCapital = null;
    localStorage.removeItem(STORAGE_KEYS.availableCapital);
    return;
  }

  const capital = Number(rawValue);
  if (!Number.isFinite(capital) || capital < 0) return;
  state.availableCapital = capital;
  localStorage.setItem(STORAGE_KEYS.availableCapital, String(capital));
}

function readCapitalInput(input) {
  const rawValue = input.value.trim();
  if (!rawValue) return null;
  const capital = Number(rawValue);
  if (!Number.isFinite(capital) || capital < 0) {
    showToast("보유 자본금은 0원 이상으로 입력해주세요.");
    return undefined;
  }
  syncCapitalInputs(input);
  return capital;
}

function searchFromHomeTerm(term) {
  const keyword = String(term || "").trim();
  if (!keyword) return;
  pageRefs.homeSearchInput.value = keyword;
  const capital = readCapitalInput(pageRefs.homeCapitalInput);
  if (capital === undefined) return;
  pageRefs.searchInput.value = keyword;
  showPage("search");
  renderSearchResults(keyword, capital);
}

function renderRecentSearches() {
  const container = document.getElementById("recentSearches");
  if (!container) return;
  let searches = [];
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.recentSearches) || "[]");
    searches = Array.isArray(stored) ? stored.filter((item) => typeof item === "string") : [];
  } catch {
    localStorage.removeItem(STORAGE_KEYS.recentSearches);
  }
  container.innerHTML = searches.length
    ? searches.map((term) => `<button type="button" class="search-chip" data-search-term="${escapeHTML(term)}">${escapeHTML(term)}</button>`).join("")
    : '<p class="discovery-empty">검색한 상품이 여기에 표시됩니다.</p>';
}

async function renderPopularSearches() {
  const container = document.getElementById("popularSearches");
  if (!container) return;

  try {
    const response = await fetch(`${API_BASE}/api/products/popular-searches?limit=4`);
    if (!response.ok) throw new Error("인기 검색어를 불러오지 못했습니다.");
    const payload = await response.json();
    const searches = Array.isArray(payload.searches) ? payload.searches : [];
    container.innerHTML = searches.length
      ? searches.map((item) => {
        const count = Number(item.searchCount);
        const countLabel = Number.isFinite(count) ? count.toLocaleString("ko-KR") : "0";
        const keyword = escapeHTML(item.keyword || "");
        return `<button type="button" class="search-chip popular-search-chip" data-search-term="${keyword}"><span>${keyword}</span><span class="search-count">${countLabel}회</span></button>`;
      }).join("")
      : '<p class="discovery-empty">최근 30일 검색 데이터가 없습니다.</p>';
  } catch {
    container.innerHTML = '<p class="discovery-empty">인기 검색어를 불러오지 못했습니다.</p>';
  }
}

async function renderHomeRecommendations() {
  const container = pageRefs.homeRecommendations;
  if (!container) return;

  let searchTerms = [];
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.recentSearches) || "[]");
    searchTerms = Array.isArray(stored)
      ? stored.filter((term) => typeof term === "string" && term.trim()).slice(0, 3)
      : [];
  } catch {
    localStorage.removeItem(STORAGE_KEYS.recentSearches);
  }

  const requestId = ++state.homeRecommendationRequestId;
  if (!searchTerms.length) {
    state.homeRecommendations = [];
    container.innerHTML = '<p class="discovery-empty">상품을 검색하면 관련 매물을 추천해드립니다.</p>';
    return;
  }

  container.innerHTML = '<p class="discovery-empty">최근 검색어에서 가격이 확인된 매물을 찾는 중입니다.</p>';
  const resultsByTerm = await Promise.allSettled(searchTerms.map(async (term) => {
    const response = await fetch(`${API_BASE}/api/products/search?q=${encodeURIComponent(term)}&track=false`);
    if (!response.ok) throw new Error("추천 매물을 불러오지 못했습니다.");
    const payload = await response.json();
    return (Array.isArray(payload.products) ? payload.products : [])
      .filter((product) => (product.pricingAvailable && Number(product.averagePrice) > 0) || product.priceLabel === "나눔")
      .sort((first, second) => {
        const firstScore = first.flipScore === null || first.flipScore === undefined ? -1 : Number(first.flipScore);
        const secondScore = second.flipScore === null || second.flipScore === undefined ? -1 : Number(second.flipScore);
        return secondScore - firstScore;
      })
      .slice(0, 2)
      .map((product) => ({ ...product, recommendedFor: term }));
  }));

  if (requestId !== state.homeRecommendationRequestId) return;
  const recommendations = [];
  const seenListings = new Set();
  for (const result of resultsByTerm) {
    if (result.status !== "fulfilled") continue;
    for (const listing of result.value) {
      const key = listing.url || `${listing.source}:${listing.id}`;
      if (seenListings.has(key)) continue;
      seenListings.add(key);
      recommendations.push(listing);
      if (recommendations.length === 6) break;
    }
    if (recommendations.length === 6) break;
  }

  state.homeRecommendations = recommendations;
  if (recommendations.length) {
    container.innerHTML = recommendations.map((listing) => {
      const isDonation = listing.priceLabel === "나눔";
      const isFavorite = getLiveFavorites().some((favorite) => String(favorite.id) === String(listing.id));
      const productId = escapeHTML(listing.id);
      const safeUrl = getSafeDaangnUrl(listing.url);
      const score = listing.flipScore === null || listing.flipScore === undefined
        ? ""
        : `<span class="score-pill ${getFlipScoreClass(Number(listing.flipScore))}">${Number(listing.flipScore)}점${listing.scoreStatus === "provisional" ? " · 잠정" : ""}</span>`;
      return `
        <article class="recommendation-card">
          <div class="recommendation-card-top">
            <span class="product-category">${escapeHTML(listing.sourceSite || "중고거래")}</span>
            ${score}
          </div>
          <h3>${escapeHTML(listing.name)}</h3>
          <p class="recommendation-query">최근 검색 · ${escapeHTML(listing.recommendedFor)}</p>
          <div class="recommendation-price-label">등록 가격</div>
          <div class="recommendation-price">${isDonation ? "나눔" : formatPrice(listing.averagePrice)}</div>
          <p class="recommendation-status">${escapeHTML(listing.status || "중고거래")}</p>
          <div class="recommendation-actions">
            <button type="button" class="secondary-btn" data-action="show-live-detail" data-product-id="${productId}">상세 분석</button>
            <button type="button" class="favorite-button ${isFavorite ? "active" : ""}" data-action="toggle-live-favorite" data-product-id="${productId}" aria-pressed="${isFavorite}">${isFavorite ? "저장됨" : "관심상품"}</button>
            ${safeUrl ? `<a class="ghost-btn" href="${safeUrl}" target="_blank" rel="noopener noreferrer">원본 매물</a>` : ""}
          </div>
        </article>
      `;
    }).join("");
  } else if (resultsByTerm.every((result) => result.status === "rejected")) {
    container.innerHTML = '<p class="discovery-empty">추천 매물을 불러오지 못했습니다. 잠시 후 다시 확인해주세요.</p>';
  } else {
    container.innerHTML = '<p class="discovery-empty">최근 검색어에서 가격이 확인된 추천 매물이 없습니다.</p>';
  }
}

function rememberSearch(term) {
  const keyword = String(term || "").trim();
  if (!keyword) return;
  let searches = [];
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.recentSearches) || "[]");
    searches = Array.isArray(stored) ? stored.filter((item) => typeof item === "string") : [];
  } catch {
    searches = [];
  }
  const updated = [keyword, ...searches.filter((item) => item !== keyword)].slice(0, 5);
  localStorage.setItem(STORAGE_KEYS.recentSearches, JSON.stringify(updated));
  renderRecentSearches();
}

// 폼 제출, 메뉴 전환 및 동적 카드 클릭을 화면 동작에 연결한다.
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
    const capital = readCapitalInput(pageRefs.homeCapitalInput);
    if (capital === undefined) return;
    showPage("search");
    pageRefs.searchInput.value = keyword;
    renderSearchResults(keyword, capital);
  });

  pageRefs.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const keyword = pageRefs.searchInput.value.trim();
    if (!keyword) {
      showToast("검색어를 입력해주세요.");
      return;
    }
    const capital = readCapitalInput(pageRefs.searchCapitalInput);
    if (capital === undefined) return;
    renderSearchResults(keyword, capital);
  });

  pageRefs.homeCapitalInput.addEventListener("input", () => syncCapitalInputs(pageRefs.homeCapitalInput));
  pageRefs.searchCapitalInput.addEventListener("input", () => syncCapitalInputs(pageRefs.searchCapitalInput));

  pageRefs.calculatorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleCalculatorSubmit(event.submitter);
  });

  // 스크립트가 연결된 상태에서 계산 폼의 기본 페이지 이동이 발생하지 않게 한다.
  pageRefs.calculatorFavoriteSelect.addEventListener("change", applySelectedFavoriteToCalculator);
  ["calcBuyPrice", "calcSellPrice"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderCalculatorSuggestion);
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
    const isOpen = pageRefs.mainNav.classList.toggle("open");
    pageRefs.mobileMenuToggle.setAttribute("aria-expanded", String(isOpen));
    pageRefs.mobileMenuToggle.setAttribute("aria-label", isOpen ? "메뉴 닫기" : "메뉴 열기");
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
    const searchChip = event.target.closest("[data-search-term]");
    if (searchChip) {
      searchFromHomeTerm(searchChip.dataset.searchTerm || "");
      return;
    }

    const guardedAction = event.target.closest("[data-action='toggle-live-favorite'], [data-action='toggle-favorite'], [data-action='calculate-listing']");
    if (guardedAction) event.preventDefault();

    const liveDetailButton = event.target.closest("[data-action='show-live-detail']");
    if (liveDetailButton) {
      const listing = findLiveListingById(liveDetailButton.dataset.productId);
      if (listing) showLiveListingDetail(listing);
      return;
    }

    const analyzeListingButton = event.target.closest("[data-action='analyze-listing']");
    if (analyzeListingButton) {
      const listing = findLiveListingById(analyzeListingButton.dataset.productId);
      if (listing) prepareListingAnalysis(listing);
      return;
    }

    const calculateListingButton = event.target.closest("[data-action='calculate-listing']");
    if (calculateListingButton) {
      const listing = findLiveListingById(calculateListingButton.dataset.productId);
      if (listing) prepareListingCalculation(listing);
      return;
    }

    const liveFavoriteButton = event.target.closest("[data-action='toggle-live-favorite']");
    if (liveFavoriteButton) {
      event.preventDefault();
      const productId = liveFavoriteButton.dataset.productId;
      const listing = [...state.currentSearchResults, ...getLiveFavorites()]
        .concat(state.homeRecommendations)
        .find((item) => String(item.id) === String(productId));
      if (listing) {
        void toggleLiveFavorite(listing);
      }
      return;
    }

    const productCard = event.target.closest("[data-product-id]");
    if (productCard && !event.target.closest("[data-action]")) {
      showProductDetail(Number(productCard.dataset.productId));
      return;
    }

    if (event.target.closest("[data-action='toggle-favorite']")) {
      event.preventDefault();
      const productId = Number(event.target.closest("[data-action='toggle-favorite']").dataset.productId);
      void toggleFavorite(productId);
      return;
    }

    if (event.target.closest("[data-action='go-home']")) {
      showPage("home");
    }
  });
}

// 데모 상품 목록에서 이름·분류를 기준으로 간단히 로컬 검색한다.
function searchProducts(keyword) {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return products;
  }

  return products.filter((product) => {
    const searchableText = `${product.name} ${product.category}`.toLowerCase();
    return searchableText.includes(normalizedKeyword);
  });
}

// Tavily가 확인한 당근 게시 가격만 모아 최저가·산술 평균가·최고가를 계산한다.
function buildSearchSummary(results) {
  const prices = results
    .filter((product) => product.source === "tavily" && product.pricingAvailable)
    .map((product) => Number(product.averagePrice || 0))
    .filter((price) => Number.isFinite(price) && price > 0)
    .sort((first, second) => first - second);

  if (!prices.length) {
    return { minPrice: 0, averagePrice: 0, maxPrice: 0, itemCount: 0, resultCount: results.length };
  }

  return {
    minPrice: prices[0],
    averagePrice: Math.round(prices.reduce((total, price) => total + price, 0) / prices.length),
    maxPrice: prices[prices.length - 1],
    itemCount: prices.length,
    resultCount: results.length,
  };
}

function formatSnapshotTime(value) {
  if (!value) return "확인 불가";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "확인 불가";
  return date.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
}

function isListingWithinCapital(product, capital) {
  const price = Number(product.listingPrice ?? product.averagePrice ?? 0);
  return capital !== null && Boolean(product.pricingAvailable) && price > 0 && price <= capital;
}

function renderSearchSummaryMarkup(keyword, results, capital = null) {
  const summary = buildSearchSummary(results);
  const isDemoSearch = results.length > 0 && results.every((product) => product.isDemo);
  const withinCapitalCount = capital === null
    ? null
    : results.filter((product) => isListingWithinCapital(product, capital)).length;
  const title = isDemoSearch ? `${keyword} 예시 가격` : `${keyword} 당근 등록 가격`;
  const listingCount = isDemoSearch
    ? `예시 매물 ${summary.resultCount}개`
    : `매물 ${summary.resultCount}개 · 가격 확인 ${summary.itemCount}개${withinCapitalCount === null ? "" : ` · 자본 내 ${withinCapitalCount}개`}`;

  return `
    <div class="search-summary-strip">
      <div class="search-summary-header">
        <h3>${escapeHTML(title)}</h3>
        <span class="product-category">${listingCount}</span>
      </div>
      <div class="search-summary-metrics">
        <div class="search-summary-metric">
          <div class="price-label">최저가</div>
          <div class="price-value">${summary.itemCount ? formatPrice(summary.minPrice) : "확인 불가"}</div>
        </div>
        <div class="search-summary-metric">
          <div class="price-label">평균가</div>
          <div class="price-value">${summary.itemCount ? formatPrice(summary.averagePrice) : "확인 불가"}</div>
        </div>
        <div class="search-summary-metric">
          <div class="price-label">최고가</div>
          <div class="price-value">${summary.itemCount ? formatPrice(summary.maxPrice) : "확인 불가"}</div>
        </div>
      </div>
      <p class="field-hint">확인된 등록 가격 ${summary.itemCount}건을 기준으로 계산했습니다. 완료 거래 가격과는 다릅니다. 검색 기준 시각: ${formatSnapshotTime(results[0]?.marketSnapshotAt)} · 동일 검색어 결과는 30분간 유지됩니다.${capital === null ? "" : ` 등록 가격이 보유 자본금 ${formatPrice(capital)} 이하인 매물을 먼저 표시합니다.`}</p>
    </div>
  `;
}

// 검색 API 결과를 등록 가격과 비교 표본 정보가 포함된 카드로 표시한다.
async function renderSearchResults(keyword = "", capital = null) {
  keyword = keyword.trim();
  pageRefs.searchResults.setAttribute("aria-busy", "true");
  pageRefs.searchResults.innerHTML = '<div class="empty-state loading-state"><span class="loading-indicator" aria-hidden="true"></span>웹에서 매물 정보를 찾는 중...</div>';

  try {
    const response = await fetch(`${API_BASE}/api/products/search?q=${encodeURIComponent(keyword)}`);
    if (!response.ok) {
      throw new Error("검색 요청에 실패했습니다.");
    }

    const payload = await response.json();
    pageRefs.searchResults.setAttribute("aria-busy", "false");
    rememberSearch(keyword);
    const results = Array.isArray(payload.products) ? payload.products : [];
    const orderedResults = results
      .map((product, index) => ({
        product,
        index,
        withinCapital: capital === null ? false : isListingWithinCapital(product, capital),
        score: product.flipScore !== null && product.flipScore !== undefined && Number.isFinite(Number(product.flipScore))
          ? Number(product.flipScore)
          : -1,
      }))
      .sort((first, second) =>
        Number(second.withinCapital) - Number(first.withinCapital)
        || second.score - first.score
        || first.index - second.index,
      )
      .map(({ product }) => product);
    state.currentSearchResults = orderedResults;

    if (!orderedResults.length) {
      pageRefs.searchResults.innerHTML = '<div class="empty-state">검색 결과가 없습니다.</div>';
      return;
    }

    const productCardsMarkup = orderedResults
      .map((product) => {
        const avgPrice = Number(product.averagePrice || 0);
        const hasPrice = Boolean(product.pricingAvailable && avgPrice > 0);
        const hasScore = product.flipScore !== null && product.flipScore !== undefined;
        const isDonation = product.priceLabel === "나눔";
        const priceConfidenceLabel = ({ high: "높음", medium: "보통", low: "낮음", none: "표본 없음" })[product.pricingConfidence] || "확인 중";
        const analysisReadiness = product.scoreStatus === "scored"
          ? "분석 자료 충분"
          : product.scoreStatus === "provisional"
            ? "잠정 분석"
            : "분석 자료 부족";
        const withinCapital = isListingWithinCapital(product, capital);
        const isFavorite = getLiveFavorites().some((favorite) => String(favorite.id) === String(product.id));
        const listingId = escapeHTML(product.id);
        const safeUrl = getSafeDaangnUrl(product.url);
        return `
          <article class="product-card">
            <div class="product-card-header">
              <h3>${escapeHTML(product.name)}</h3>
              <span class="product-category">${escapeHTML(product.sourceSite || product.category || "중고거래")}</span>
              ${withinCapital ? '<span class="capital-match-badge">자본 내 매물</span>' : ""}
              <span class="analysis-readiness ${hasScore ? "available" : "unavailable"}">${analysisReadiness}</span>
            </div>

            <div class="product-card-meta">
              <div>
                <div class="price-label">판매 상태</div>
                <div class="price-value small-text">${escapeHTML(product.status || "중고거래")}</div>
              </div>
              <span class="score-pill ${hasScore ? getFlipScoreClass(product.flipScore) : ""}">${hasScore ? `${Number(product.flipScore)}점${product.scoreStatus === "provisional" ? " · 잠정" : ""}` : "점수 산정 불가"}</span>
            </div>

            ${hasPrice || isDonation ? `
              <div class="product-card-meta">
                <div>
                  <div class="price-label">${product.isDemo ? "예시 가격" : "등록 가격"}</div>
                  <div class="price-value">${isDonation ? "나눔" : formatPrice(avgPrice)}</div>
                  <div class="price-evidence">가격 정보 신뢰도 ${priceConfidenceLabel}${product.comparableListings ? ` · 비교 매물 ${Number(product.comparableListings)}건` : ""}</div>
                </div>
              </div>
            ` : `
              <div class="product-card-meta">
                <div>
                  <div class="price-label">가격 정보</div>
                  <div class="price-value small-text">가격 정보를 충분히 찾지 못했습니다</div>
                  <div class="price-evidence unavailable">가격 근거가 없어 분석에서 제외됩니다</div>
                </div>
              </div>
            `}

            <div class="product-card-meta">
              <div>
                <div class="price-label">출처</div>
                <div class="price-value small-text">${escapeHTML(product.sourceSite || product.source || "검색 결과")}</div>
              </div>
            </div>

            ${renderFlipAssessment(product)}

            <div class="product-card-meta">
              <div>
                <div class="price-label">핵심 내용</div>
                <div class="price-value small-text">${escapeHTML((product.description || "중고거래에 대한 검색 결과입니다.").slice(0, 120))}</div>
              </div>
            </div>

            <div class="product-card-actions">
              <button type="button" class="secondary-btn" data-action="show-live-detail" data-product-id="${listingId}">상세 분석</button>
              <button type="button" onclick="return false;" class="favorite-button ${isFavorite ? "active" : ""}" data-action="toggle-live-favorite" data-product-id="${listingId}" aria-pressed="${isFavorite}">
                ${isFavorite ? "♥ 저장됨" : "♡ 관심상품"}
              </button>
              ${safeUrl ? `<a class="ghost-btn" href="${safeUrl}" target="_blank" rel="noopener noreferrer">원본 페이지</a>` : ""}
            </div>
          </article>
        `;
      })
      .join("");

    pageRefs.searchResults.innerHTML = `
      ${renderSearchSummaryMarkup(keyword || "검색 결과", orderedResults, capital)}
      <div class="search-result-list">
        ${productCardsMarkup}
      </div>
    `;
  } catch (error) {
    pageRefs.searchResults.setAttribute("aria-busy", "false");
    pageRefs.searchResults.innerHTML = `
      <div class="empty-state">
        웹 매물 검색 중 문제가 발생했습니다.<br />
        ${escapeHTML(error.message || "잠시 후 다시 시도해주세요.")}
      </div>
    `;
    showToast("검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
  }
}

function findLiveListingById(productId) {
  return [
    ...state.currentSearchResults,
    ...state.homeRecommendations,
    ...getLiveFavorites(),
    ...(state.currentLiveListing ? [state.currentLiveListing] : []),
  ].find((item) => String(item.id) === String(productId));
}

function showLiveListingDetail(listing) {
  state.currentLiveListing = listing;
  const listingId = escapeHTML(listing.id);
  const safeUrl = getSafeDaangnUrl(listing.url);
  const postedPrice = Number(listing.averagePrice || 0);
  const medianPrice = Number(listing.marketMedianPrice || 0);
  const isFavorite = getLiveFavorites().some((favorite) => String(favorite.id) === String(listing.id));
  const pricingSummary = listing.priceLabel === "나눔"
    ? "나눔"
    : listing.pricingAvailable && postedPrice > 0
      ? formatPrice(postedPrice)
      : "등록 가격을 확인하지 못했습니다";
  const marketSummary = medianPrice > 0
    ? `${formatPrice(medianPrice)} · 등록가 표본 ${Number(listing.comparableListings || 0)}건`
    : "비교 가능한 게시 가격이 부족합니다";
  const hasScore = listing.flipScore !== null && listing.flipScore !== undefined;

  pageRefs.productDetailContent.innerHTML = `
    <div class="detail-top">
      <div class="detail-title">
        <h2>${escapeHTML(listing.name)}</h2>
        <span class="score-pill">${escapeHTML(listing.status || "중고거래")}</span>
        <span class="score-pill ${hasScore ? getFlipScoreClass(listing.flipScore) : ""}">${hasScore ? `${Number(listing.flipScore)}점${listing.scoreStatus === "provisional" ? " · 잠정" : ""}` : "점수 산정 불가"}</span>
      </div>
      <div class="product-card-actions">
        <button type="button" onclick="return false;" class="favorite-button ${isFavorite ? "active" : ""}" data-action="toggle-live-favorite" data-product-id="${listingId}" aria-pressed="${isFavorite}">
          ${isFavorite ? "♥ 저장됨" : "♡ 관심상품"}
        </button>
        <button type="button" onclick="return false;" class="secondary-btn" data-action="calculate-listing" data-product-id="${listingId}">수익 계산</button>
        <button type="button" class="primary-btn" data-action="analyze-listing" data-product-id="${listingId}">매물 분석</button>
        ${safeUrl ? `<a class="ghost-btn" href="${safeUrl}" target="_blank" rel="noopener noreferrer">원본 매물</a>` : ""}
        <button type="button" class="secondary-btn" data-action="go-home">홈으로</button>
      </div>
    </div>
    <div class="detail-summary">
      <div class="summary-block">
        <h3>등록 가격과 비교 시세</h3>
        <div class="market-metrics">
          <div class="metric-row"><span>등록 가격</span><strong>${pricingSummary}</strong></div>
          <div class="metric-row"><span>실제 거래 완료 가격</span><strong>${listing.completedSalePrice ? formatPrice(listing.completedSalePrice) : "자료 없음"}</strong></div>
          <div class="metric-row"><span>등록가 표본 중앙값</span><strong>${marketSummary}</strong></div>
          <div class="metric-row"><span>검색 결과 기준 시점(추정)</span><strong>${escapeHTML(listing.publishedDate || "확인되지 않음")}</strong></div>
          <div class="metric-row"><span>출처</span><strong>${escapeHTML(listing.sourceSite || "당근")}</strong></div>
          <div class="metric-row"><span>가격 기준</span><strong>${listing.priceBasis === "completed_sale" ? "거래 완료 가격" : listing.priceBasis === "example" ? "화면 예시 가격" : listing.priceBasis === "listing" ? "판매자가 등록한 희망 가격" : "확인되지 않음"}</strong></div>
        </div>
        <p>${escapeHTML(listing.description || "매물 설명이 없습니다.")}</p>
      </div>
    </div>
    ${renderFlipAssessment(listing)}
  `;
  showPage("detail");
}

function prepareListingCalculation(listing) {
  state.calculatorContext = listing;
  document.getElementById("calcProductName").value = listing.name || "";
  const buyPrice = Number(listing.averagePrice || 0);
  const sellPrice = getRecommendedSellPrice(listing);
  document.getElementById("calcBuyPrice").value = buyPrice > 0 ? buyPrice : "";
  document.getElementById("calcSellPrice").value = sellPrice > 0 ? sellPrice : "";
  pageRefs.calculatorFavoriteSelect.value = "";
  renderCalculatorSuggestion();
  showPage("calculator");
  if (!buyPrice || !sellPrice) showToast("확인된 가격이 부족합니다. 매입가와 판매가를 직접 입력해주세요.");
}

function prepareListingAnalysis(listing) {
  if (!getCurrentUser()) {
    state.pendingListingAnalysis = listing;
    showToast("매물 분석 기록은 로그인 후 저장됩니다.");
    showPage("auth");
    return;
  }

  state.analysisContext = listing;
  document.getElementById("analysisProductName").value = listing.name || "";
  document.getElementById("analysisBuyPrice").value = Number(listing.averagePrice || 0) || "";
  document.getElementById("analysisSellPrice").value = Number(listing.marketMedianPrice || 0) || "";
  document.getElementById("analysisTransactionFee").value = "";
  document.getElementById("analysisShippingCost").value = "";
  document.getElementById("analysisOtherCost").value = "";
  showPage("analysis");
}

// 고정 샘플 상품에는 시장 근거가 없으므로 Flip Score를 표시하지 않는다.
function showProductDetail(productId) {
  const product = products.find((item) => item.id === productId);
  if (!product) {
    showToast("존재하지 않는 상품입니다.");
    return;
  }

  state.currentProductId = productId;
  const isFavorite = getFavoriteIds().includes(productId);

  pageRefs.productDetailContent.innerHTML = `
    <div class="detail-top">
      <div class="detail-title">
        <h2>${product.name}</h2>
        <span class="score-pill">예시 데이터</span>
      </div>
      <div class="product-card-actions">
        <button
          type="button"
          class="favorite-button ${isFavorite ? "active" : ""}"
          onclick="return false;"
          data-action="toggle-favorite"
          data-product-id="${product.id}"
        >
          ${isFavorite ? "♥ 관심상품 취소" : "♡ 관심상품"}
        </button>
        <button type="button" class="secondary-btn" data-action="go-home">홈으로</button>
      </div>
    </div>

    <div class="detail-summary">
      <div class="summary-block">
        <h3>예시 가격 (실시간 시세 아님)</h3>
        <div class="detail-price-row">
          <div class="detail-price-box">
            <span>최저가</span>
            <strong>${formatPrice(product.minPrice)}</strong>
          </div>
          <div class="detail-price-box">
            <span>평균가</span>
            <strong>${formatPrice(product.averagePrice)}</strong>
          </div>
          <div class="detail-price-box">
            <span>최고가</span>
            <strong>${formatPrice(product.maxPrice)}</strong>
          </div>
        </div>

        <div class="market-metrics">
          <div class="metric-row"><span>자료 출처</span><strong>화면 예시 값</strong></div>
        </div>
      </div>

      <div class="price-block">
        <h3>Flip Score</h3>
        <div class="score-line">
          <span class="score-pill">산정 불가</span>
          <span>실제 시장 데이터가 없습니다.</span>
        </div>
        <p class="field-hint">이 값은 예시 화면용이며 실제 매입가 메리트·수요·판매 회전성·거래 리스크를 뒷받침하지 않습니다.</p>
      </div>
    </div>
  `;

  showPage("detail");
}

// 점수 구간을 카드 색상 CSS 클래스에 대응시킨다.
function getFlipScoreClass(score) {
  if (score >= 65) return "good";
  if (score >= 48) return "moderate";
  return "bad";
}

// 숫자를 한국 원화 표시 규칙으로 포맷한다.
function formatPrice(value) {
  return `${new Intl.NumberFormat("ko-KR").format(Number(value || 0))}원`;
}

// 동적 가중치와 각 항목의 점수 기여도를 보여준다.
function renderFlipAssessment(assessment) {
  const score = assessment.flipScore ?? assessment.flip_score ?? null;
  const status = assessment.scoreStatus || assessment.score_status || "unavailable";
  const breakdown = assessment.scoreBreakdown || assessment.score_breakdown || [];
  const category = assessment.scoreCategory || assessment.score_category || "general";
  const categoryLabel = ({ electronics: "전자제품", fashion: "패션·신발", collectibles: "수집품", general: "일반" })[category] || category;
  const statusText = status === "scored"
    ? "5개 평가 항목을 반영한 점수"
    : status === "provisional"
      ? "확인 가능한 항목만 반영한 잠정 추정치"
      : "근거 데이터가 부족해 점수를 산정하지 않았습니다";

  const rows = breakdown.map((item) => {
    const included = item.score !== null && item.score !== undefined;
    const valueText = included
      ? `${Number(item.score).toFixed(0)}점 × 유효 가중치 ${Number(item.effectiveWeight || 0).toFixed(1)}% = 기여 ${Number(item.contribution || 0).toFixed(1)}점`
      : "미산출 · 근거 데이터 없음";
    return `
      <div class="score-breakdown-row ${included ? "included" : "unavailable"}">
        <div class="score-breakdown-heading"><strong>${escapeHTML(item.label || item.key)}</strong><span>${valueText}</span></div>
        <p>상품군·시장 조정 가중치 ${Number(item.weight || 0).toFixed(1)}%</p>
        <p class="field-hint">산식: ${escapeHTML(item.method || "")}</p>
        <p>${escapeHTML(item.evidence || "")}</p>
      </div>
    `;
  }).join("");

  return `
    <div class="score-assessment">
      <p class="field-hint">${statusText} · 상품군 프로필: ${escapeHTML(categoryLabel)}</p>
      <details class="score-breakdown">
        <summary>산출 과정과 항목별 기여도</summary>
        <div class="score-breakdown-list">${rows || '<p class="field-hint">계산에 사용할 수 있는 항목이 없습니다.</p>'}</div>
      </details>
    </div>
  `;
}

// 외부 검색 문자열을 HTML에 삽입하기 전에 특수문자를 이스케이프한다.
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

// 원본 링크는 HTTPS 당근 도메인만 허용해 안전한 외부 링크로 만든다.
function getSafeDaangnUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "daangn.com" || url.hostname.endsWith(".daangn.com"))
      ? escapeHTML(url.href)
      : "";
  } catch {
    return "";
  }
}

// 사용자가 입력한 가격을 검증하고 수익·ROI·추천 등급을 표시한다.
async function handleCalculatorSubmit(submitter) {
  const productName = document.getElementById("calcProductName").value.trim();
  const buyPrice = Number(document.getElementById("calcBuyPrice").value);
  const sellPrice = Number(document.getElementById("calcSellPrice").value);
  const transactionFee = 0;
  const shippingCost = 0;
  const otherCost = 0;

  if (!productName) {
    showToast("상품명을 입력해주세요.");
    return;
  }

  if (![buyPrice, sellPrice].every(Number.isFinite)) {
    showToast("숫자 형태의 가격을 입력해주세요.");
    return;
  }

  if (buyPrice < 0 || sellPrice < 0) {
    showToast("가격은 0 이상이어야 합니다.");
    return;
  }
  if (buyPrice === 0) {
    showToast("매입 가격을 0보다 크게 입력해주세요.");
    return;
  }

  const context = state.calculatorContext || {};
  let resultData;
  const submitButton = submitter || pageRefs.calculatorForm.querySelector("[data-action='submit-calculation']");
  if (submitButton) submitButton.disabled = true;
  try {
    const response = await fetch(`${API_BASE}/api/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_name: productName,
        buy_price: buyPrice,
        expected_sell_price: sellPrice,
        transaction_fee: transactionFee,
        shipping_cost: shippingCost,
        other_cost: otherCost,
        market_median_price: Number(context.marketMedianPrice || 0),
        market_sample_count: Number(context.comparableListings || 0),
        freshness_days: context.marketFreshnessDays ?? null,
        freshness_coverage: Number(context.marketFreshnessCoverage || 0),
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || "수익 계산에 실패했습니다.");
    resultData = payload;
  } catch (error) {
    showToast(error.message || "계산 서버에 연결할 수 없습니다.");
    return;
  } finally {
    if (submitButton) submitButton.disabled = false;
  }

  const profit = resultData.profit === null ? null : Number(resultData.profit);
  const roi = resultData.roi === null ? null : Number(resultData.roi);
  const flipScore = resultData.flip_score === null ? null : Number(resultData.flip_score);
  const recommendation = resultData.recommendation;
  const recommendationClass = flipScore === null ? "" : getFlipScoreClass(flipScore);

  const result = `
    <div class="result-card">
      <div class="detail-title">
        <h3>${escapeHTML(productName)}</h3>
        <span class="score-pill ${recommendationClass}">${flipScore === null ? "점수 산정 불가" : `${flipScore}점 · ${escapeHTML(recommendation)}`}</span>
      </div>
      <div class="result-summary">
        <div class="metric-card">
          <div class="metric-label">순수익 추정</div>
          <div class="metric-value ${profit === null ? "" : profit >= 0 ? "positive" : "negative"}">${profit === null ? "비용 입력 필요" : formatPrice(profit)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">ROI</div>
          <div class="metric-value">${roi === null ? "산정 불가" : `${roi.toFixed(1)}%`}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Flip Score</div>
          <div class="metric-value">${flipScore === null ? "산정 불가" : flipScore}</div>
        </div>
      </div>
      ${renderFlipAssessment(resultData)}
    </div>
  `;

  pageRefs.calculatorResult.innerHTML = result;
  pageRefs.calculatorResult.classList.remove("hidden");
  pageRefs.calculatorResult.setAttribute("aria-live", "polite");
  pageRefs.calculatorResult.scrollIntoView({ behavior: "smooth", block: "nearest" });

  void saveAnalysisRecord({
    productName,
    buyPrice,
    sellPrice,
    otherCost: 0,
    expectedProfit: profit,
    roi,
    flipScore,
    analysisDate: new Date().toISOString(),
    type: "calculator",
  });

  showToast(profit !== null && profit < 0 ? "손실 예상 결과를 계산했습니다." : "수익 계산이 완료되었습니다.");
}

// 상품 상태를 반영한 서버 분석을 요청하고 결과 및 사용자 이력을 갱신한다.
async function handleAnalysisSubmit() {
  const productName = document.getElementById("analysisProductName").value.trim();
  const buyPrice = Number(document.getElementById("analysisBuyPrice").value);
  const sellPrice = Number(document.getElementById("analysisSellPrice").value);
  const transactionFeeInput = document.getElementById("analysisTransactionFee").value;
  const shippingCostInput = document.getElementById("analysisShippingCost").value;
  const otherCostInput = document.getElementById("analysisOtherCost").value;
  const transactionFee = Number(transactionFeeInput);
  const shippingCost = Number(shippingCostInput);
  const otherCost = Number(otherCostInput);

  if (!productName) {
    showToast("상품명을 입력해주세요.");
    return;
  }

  if ([transactionFeeInput, shippingCostInput, otherCostInput].some((value) => value === "")) {
    showToast("수수료·배송비·기타 비용을 입력해주세요. 비용이 없으면 0을 입력하세요.");
    return;
  }

  if (![buyPrice, sellPrice, transactionFee, shippingCost, otherCost].every(Number.isFinite)) {
    showToast("숫자 형태의 가격을 입력해주세요.");
    return;
  }

  if (buyPrice < 0 || sellPrice < 0 || transactionFee < 0 || shippingCost < 0 || otherCost < 0) {
    showToast("가격은 0 이상이어야 합니다.");
    return;
  }
  if (buyPrice === 0) {
    showToast("매입 가격을 0보다 크게 입력해주세요.");
    return;
  }
  if (!getCurrentUser()) {
    showToast("매물 분석과 기록 저장은 로그인 후 이용할 수 있습니다.");
    showPage("auth");
    return;
  }

  const context = state.analysisContext || {};
  let resultData;
  try {
    const response = await fetchWithSession("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_name: productName,
        buy_price: buyPrice,
        expected_sell_price: sellPrice,
        transaction_fee: transactionFee,
        shipping_cost: shippingCost,
        other_cost: otherCost,
        market_median_price: Number(context.marketMedianPrice || 0),
        market_sample_count: Number(context.comparableListings || 0),
        freshness_days: context.marketFreshnessDays ?? null,
        freshness_coverage: Number(context.marketFreshnessCoverage || 0),
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || "매물 분석에 실패했습니다.");
    resultData = payload;
  } catch (error) {
    showToast(error.message || "분석 서버에 연결할 수 없습니다.");
    return;
  }

  const expectedProfit = resultData.profit === null ? null : Number(resultData.profit);
  const roi = resultData.roi === null ? null : Number(resultData.roi);
  const flipScore = resultData.flip_score === null ? null : Number(resultData.flip_score);
  const recommendation = resultData.recommendation;
  const recommendationClass = flipScore === null ? "" : getFlipScoreClass(flipScore);
  const estimatedMarketPrice = Number(resultData.estimated_market_price || 0);

  const result = `
    <div class="result-card">
      <div class="detail-title">
        <h3>${escapeHTML(productName)}</h3>
        <span class="score-pill ${recommendationClass}">${flipScore === null ? "점수 산정 불가" : `${flipScore}점 · ${escapeHTML(recommendation)}`}</span>
      </div>
      <div class="result-summary">
        <div class="metric-card">
          <div class="metric-label">등록가 표본 중앙값</div>
          <div class="metric-value">${estimatedMarketPrice > 0 ? formatPrice(estimatedMarketPrice) : "비교 시세 부족"}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">예상 판매가</div>
          <div class="metric-value">${formatPrice(resultData.expected_sell_price)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">예상 수익</div>
          <div class="metric-value ${expectedProfit === null ? "" : expectedProfit >= 0 ? "positive" : "negative"}">${expectedProfit === null ? "비용 입력 필요" : formatPrice(expectedProfit)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">ROI</div>
          <div class="metric-value">${roi === null ? "산정 불가" : `${roi.toFixed(1)}%`}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Flip Score</div>
          <div class="metric-value">${flipScore === null ? "산정 불가" : flipScore}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">추천 여부</div>
          <div class="metric-value">${recommendation}</div>
        </div>
      </div>
      <p class="field-hint">실제 거래 완료 가격 표본은 확인되지 않았습니다. 예상 판매가는 입력값이며, 결과는 시장 데이터가 부족한 항목을 제외한 잠정 추정치입니다.</p>
      ${renderFlipAssessment(resultData)}
    </div>
  `;

  pageRefs.analysisResult.innerHTML = result;
  pageRefs.analysisResult.classList.remove("hidden");
  state.analysisContext = null;
  try {
    await refreshAccountData();
    renderMyPage();
  } catch {
    showToast("분석은 완료했지만 이력 화면을 새로고침하지 못했습니다.");
    return;
  }
  showToast(expectedProfit !== null && expectedProfit < 0 ? "손실 예상 분석을 기록했습니다." : "매물 분석을 기록했습니다.");
}

// 브라우저에 저장된 데모 상품 관심 ID를 배열로 읽는다.
function getFavoriteIds() {
  const favorites = JSON.parse(localStorage.getItem(STORAGE_KEYS.favorites) || "[]");
  return Array.isArray(favorites) ? favorites : [];
}

// 현재 로그인 계정의 서버 동기화 관심 매물 목록을 반환한다.
function getLiveFavorites() {
  return Array.isArray(state.liveFavorites) ? state.liveFavorites : [];
}

// 계산기 선택 목록에 데모 상품과 실시간 매물을 공통 형식으로 결합한다.
function getCalculatorFavoriteProducts() {
  const savedProducts = products
    .filter((product) => getFavoriteIds().includes(product.id))
    .map((product) => ({ ...product, favoriteKey: `demo:${product.id}` }));
  const savedListings = getLiveFavorites()
    .map((listing) => ({ ...listing, favoriteKey: `live:${listing.source || "listing"}:${listing.id}` }));
  return [...savedProducts, ...savedListings];
}

// 관심상품 선택 메뉴를 다시 만들고 기존 선택이 여전히 유효하면 보존한다.
function populateCalculatorFavoriteSelect() {
  const favorites = getCalculatorFavoriteProducts();
  const selectedKey = pageRefs.calculatorFavoriteSelect.value;
  pageRefs.calculatorFavoriteSelect.innerHTML = favorites.length
    ? `<option value="">관심상품 선택</option>${favorites.map((item) => {
      const postedPrice = Number(item.averagePrice || 0);
      const recommendedSellPrice = Number(item.recommendedSellPrice || item.expectedSellPrice || 0);
      const sampleLabel = item.source === "demo" ? " · 예시" : "";
      const priceLabel = postedPrice > 0 ? ` · 등록 ${formatPrice(postedPrice)}` : " · 등록가 없음";
      const recommendationLabel = recommendedSellPrice > 0 ? ` · 참고 판매가 ${formatPrice(recommendedSellPrice)}` : "";
      return `<option value="${escapeHTML(item.favoriteKey)}">${escapeHTML(item.name)}${sampleLabel}${priceLabel}${recommendationLabel}</option>`;
    }).join("")}`
    : '<option value="">관심상품을 먼저 추가해주세요.</option>';
  pageRefs.calculatorFavoriteSelect.disabled = favorites.length === 0;
  if (favorites.some((item) => item.favoriteKey === selectedKey)) {
    pageRefs.calculatorFavoriteSelect.value = selectedKey;
  }
}

// 선택한 관심 매물의 가격을 수익 계산기 입력란에 자동으로 채운다.
function applySelectedFavoriteToCalculator() {
  const selectedKey = pageRefs.calculatorFavoriteSelect.value;
  const product = getCalculatorFavoriteProducts().find((item) => item.favoriteKey === selectedKey);
  if (!product) {
    state.calculatorContext = null;
    pageRefs.calculatorSuggestion.classList.add("hidden");
    return;
  }

  state.calculatorContext = product;
  document.getElementById("calcProductName").value = product.name;
  const buyPrice = Number(product.recommendedBuyPrice || product.averagePrice || 0);
  const sellPrice = getRecommendedSellPrice(product);
  document.getElementById("calcBuyPrice").value = buyPrice > 0 ? buyPrice : "";
  document.getElementById("calcSellPrice").value = sellPrice > 0 ? sellPrice : "";
  renderCalculatorSuggestion();
  if (!buyPrice || !sellPrice) {
    showToast("매물 가격이 없어 매입가와 판매가를 직접 입력해주세요.");
  }
}

// 등록 가격 중앙값은 예상 판매가 입력의 참고값으로만 사용한다.
function getRecommendedSellPrice(listing) {
  const medianPrice = Number(listing.marketMedianPrice || 0);
  if (medianPrice > 0) return medianPrice;
  const postedPrice = Number(listing.averagePrice || 0);
  if (listing.source === "tavily" && postedPrice > 0) return postedPrice;
  return Number(listing.recommendedSellPrice || listing.expectedSellPrice || 0);
}

// 선택한 매물의 게시가 중앙값과 비용 0원 가정으로 간편 수익을 표시한다.
function renderCalculatorSuggestion() {
  const listing = state.calculatorContext;
  const recommendedSellPrice = listing ? getRecommendedSellPrice(listing) : 0;
  if (!listing || recommendedSellPrice <= 0) {
    pageRefs.calculatorSuggestion.classList.add("hidden");
    pageRefs.calculatorSuggestion.innerHTML = "";
    return;
  }

  const buyPrice = Number(document.getElementById("calcBuyPrice").value || 0);
  const sellPrice = Number(document.getElementById("calcSellPrice").value || 0);
  const profit = sellPrice - buyPrice;
  const profitText = buyPrice > 0
    ? `비용 0원 가정 순수익: <strong>${formatPrice(profit)}</strong>`
    : "매입가를 입력하면 순수익을 계산합니다.";

  pageRefs.calculatorSuggestion.innerHTML = `
    <h3>게시 가격 중앙값 참고</h3>
    <div class="suggested-price">${formatPrice(recommendedSellPrice)}</div>
    <p class="field-hint">현재 매물의 등록 가격 표본 중앙값입니다. 실제 거래 완료 가격이나 추천 판매가가 아니므로 예상 판매가를 직접 조정하세요.</p>
    <p>${profitText}</p>
  `;
  pageRefs.calculatorSuggestion.classList.remove("hidden");
}

// 데모 관심상품 ID 배열을 브라우저 저장소에 기록한다.
function saveFavoriteIds(favorites) {
  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(favorites));
}

// 로그인 여부를 확인한 뒤 데모 관심상품을 추가/제거하고 관련 화면을 갱신한다.
async function toggleFavorite(productId) {
  await state.sessionReady;
  if (!getCurrentUser()) {
    showToast("관심상품을 사용하려면 로그인이 필요합니다.");
    showPage("auth");
    return;
  }

  const favorites = getFavoriteIds();
  const nextFavorites = favorites.includes(productId)
    ? favorites.filter((id) => id !== productId)
    : [...favorites, productId];

  saveFavoriteIds(nextFavorites);
  renderFavorites();
  populateCalculatorFavoriteSelect();
  renderMyPage();

  if (state.currentProductId === productId) {
    showProductDetail(productId);
  }

  showToast(nextFavorites.includes(productId) ? "관심상품에 저장되었습니다." : "관심상품에서 제거되었습니다.");
}

// 서버 API를 통해 실시간 매물을 저장/삭제하고 화면의 버튼 상태를 맞춘다.
async function toggleLiveFavorite(listing) {
  await state.sessionReady;
  if (!getCurrentUser()) {
    showToast("관심상품을 사용하려면 로그인이 필요합니다.");
    showPage("auth");
    return;
  }

  const favorites = getLiveFavorites();
  const isSaved = favorites.some((item) =>
    String(item.id) === String(listing.id) && String(item.source || "listing") === String(listing.source || "listing")
  );
  const favoriteKey = `${listing.source || "listing"}:${listing.id}`;
  try {
    const response = isSaved
      ? await fetchWithSession(`/api/favorites/${encodeURIComponent(favoriteKey)}`, { method: "DELETE" })
      : await fetchWithSession("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing }),
      });
    if (!response.ok) {
      throw new Error("관심상품 저장에 실패했습니다.");
    }
    await refreshAccountData();
  } catch (error) {
    showToast(error.message || "서버에 연결할 수 없습니다.");
    return;
  }

  const nextIsSaved = !isSaved;
  document.querySelectorAll("[data-action='toggle-live-favorite']").forEach((button) => {
    if (String(button.dataset.productId) !== String(listing.id)) {
      return;
    }
    button.classList.toggle("active", nextIsSaved);
    button.setAttribute("aria-pressed", String(nextIsSaved));
    button.textContent = nextIsSaved ? "♥ 저장됨" : "♡ 관심상품";
  });

  renderFavorites();
  populateCalculatorFavoriteSelect();
  renderMyPage();
  showToast(nextIsSaved ? "관심상품에 저장되었습니다." : "관심상품에서 제거되었습니다.");
}

// 데모 상품과 서버 매물을 합쳐 관심상품 화면을 다시 그린다.
function renderFavorites() {
  const favorites = getFavoriteIds();
  const liveFavorites = getLiveFavorites();
  if (!favorites.length && !liveFavorites.length) {
    pageRefs.favoritesContent.innerHTML = '<div class="empty-state">저장된 관심상품이 없습니다.</div>';
    return;
  }

  const favoriteProducts = products.filter((product) => favorites.includes(product.id));

  const savedDemoMarkup = favoriteProducts
    .map(
      (product) => `
        <article class="favorite-item" data-product-id="${product.id}">
          <div class="favorite-header">
            <div>
              <h3>${product.name}</h3>
              <p>${product.category}</p>
            </div>
            <button type="button" onclick="return false;" class="secondary-btn" data-action="toggle-favorite" data-product-id="${product.id}">
              관심 해제
            </button>
          </div>
          <p>평균 시세: ${formatPrice(product.averagePrice)} / 예상 판매가: ${formatPrice(product.expectedSellPrice)}</p>
        </article>
      `
    )
    .join("");

  const savedLiveMarkup = liveFavorites
    .map((listing) => {
      const listingUrl = getSafeDaangnUrl(listing.url);
      return `
        <article class="favorite-item">
          <div class="favorite-header">
            <div>
              <h3>${escapeHTML(listing.name)}</h3>
              <p>${escapeHTML(listing.sourceSite || listing.category || "중고거래")}</p>
            </div>
            <button type="button" onclick="return false;" class="favorite-button active" data-action="toggle-live-favorite" data-product-id="${escapeHTML(listing.id)}" aria-pressed="true">
              ♥ 저장됨
            </button>
          </div>
          <p>${listing.isDemo ? `예시 가격: ${formatPrice(listing.averagePrice)}` : listing.pricingAvailable ? `등록 가격: ${formatPrice(listing.averagePrice)}` : "가격 정보 없음"} / ${escapeHTML(listing.status || "중고거래")}</p>
          <button type="button" class="secondary-btn" data-action="show-live-detail" data-product-id="${escapeHTML(listing.id)}">상세 분석</button>
          ${listingUrl ? `<a class="ghost-btn" href="${listingUrl}" target="_blank" rel="noopener noreferrer">원본 매물</a>` : ""}
        </article>
      `;
    })
    .join("");

  pageRefs.favoritesContent.innerHTML = savedDemoMarkup + savedLiveMarkup;
}

// 브라우저에 캐시된 공개 사용자 정보를 읽는다. 인증의 기준은 서버 세션이다.
function getCurrentUser() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.currentUser) || "null");
}

// 로그인 후 내비게이션 표시를 위한 공개 사용자 정보를 브라우저에 저장한다.
function saveCurrentUser(user) {
  localStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify(user));
}

// 이전 데모 인증에서 사용하던 로컬 사용자 목록을 읽는다.
function getUsers() {
  const rawUsers = JSON.parse(localStorage.getItem(STORAGE_KEYS.users) || "[]");
  return Array.isArray(rawUsers) ? rawUsers : [];
}

// 이전 데모 인증용 사용자 목록을 브라우저 저장소에 기록한다.
function saveUsers(users) {
  localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
}

// 자격 증명을 서버에 보내고 세션 쿠키와 계정별 데이터를 초기화한다.
async function loginUser() {
  const username = document.getElementById("loginId").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  if (!username || !password) {
    showToast("아이디와 비밀번호를 모두 입력해주세요.");
    return;
  }

  try {
    const response = await fetchWithSession("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || "로그인에 실패했습니다.");
    }

    saveCurrentUser(payload.user);
    await refreshAccountData();
    syncAuthState();
    renderFavorites();
    populateCalculatorFavoriteSelect();
    renderMyPage();
    if (state.pendingListingAnalysis) {
      const pendingListing = state.pendingListingAnalysis;
      state.pendingListingAnalysis = null;
      prepareListingAnalysis(pendingListing);
    } else {
      showPage("mypage");
    }
    showToast("로그인되었습니다.");
    pageRefs.loginForm.reset();
  } catch (error) {
    showToast(error.message || "서버에 연결할 수 없습니다.");
  }
}

// 새 계정을 서버에 만들고, 성공 시 로그인 상태로 전환한다.
async function signupUser() {
  const username = document.getElementById("signupId").value.trim();
  const password = document.getElementById("signupPassword").value.trim();

  if (!username || !password) {
    showToast("아이디와 비밀번호를 모두 입력해주세요.");
    return;
  }

  try {
    const response = await fetchWithSession("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || "회원가입에 실패했습니다.");
    }

    saveCurrentUser(payload.user);
    state.liveFavorites = [];
    state.analysisHistory = [];
    syncAuthState();
    renderFavorites();
    populateCalculatorFavoriteSelect();
    renderMyPage();
    if (state.pendingListingAnalysis) {
      const pendingListing = state.pendingListingAnalysis;
      state.pendingListingAnalysis = null;
      prepareListingAnalysis(pendingListing);
    } else {
      showPage("mypage");
    }
    showToast("회원가입이 완료되었습니다.");
    pageRefs.signupForm.reset();
  } catch (error) {
    showToast(error.message || "서버에 연결할 수 없습니다.");
  }
}

// 서버 세션을 무효화하고 브라우저의 계정별 화면 상태를 비운다.
async function logoutUser() {
  try {
    await fetchWithSession("/api/auth/logout", { method: "POST" });
  } catch {
    showToast("서버와 연결하지 못했지만 이 브라우저에서는 로그아웃했습니다.");
  }
  localStorage.removeItem(STORAGE_KEYS.currentUser);
  state.liveFavorites = [];
  state.analysisHistory = [];
  syncAuthState();
  renderFavorites();
  populateCalculatorFavoriteSelect();
  renderMyPage();
  showPage("home");
  showToast("로그아웃되었습니다.");
}

// 캐시된 로그인 상태에 따라 로그인/인증 전용 내비게이션을 토글한다.
function syncAuthState() {
  const currentUser = getCurrentUser();
  const loginOnlyButtons = document.querySelectorAll(".login-only");
  const authOnlyButtons = document.querySelectorAll(".auth-only");

  loginOnlyButtons.forEach((button) => {
    button.classList.toggle("hidden", Boolean(currentUser));
  });

  authOnlyButtons.forEach((button) => {
    button.classList.toggle("hidden", !currentUser);
  });
}

// 요청한 단일 화면 섹션만 활성화하고 모바일 메뉴를 닫는다.
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
  if (target) {
    target.classList.add("active");
  }

  if (view === "home") {
    void renderPopularSearches();
    void renderHomeRecommendations();
  }

  const activeView = view === "detail" ? "search" : view === "analysis" ? "calculator" : view;
  document.querySelectorAll(".nav-item[data-view]").forEach((item) => {
    const isActive = item.dataset.view === activeView;
    item.classList.toggle("active", isActive);
    if (isActive) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });

  if (view === "search") {
    pageRefs.searchInput.focus();
  }

  if (pageRefs.mainNav) {
    pageRefs.mainNav.classList.remove("open");
    pageRefs.mobileMenuToggle.setAttribute("aria-expanded", "false");
    pageRefs.mobileMenuToggle.setAttribute("aria-label", "메뉴 열기");
  }
}

// 계산기/분석 결과를 로그인 계정의 서버 이력에 저장한다.
async function saveAnalysisRecord(record) {
  if (!getCurrentUser()) {
    showToast("계산 기록은 로그인 후 서버에 저장됩니다.");
    return;
  }

  try {
    const response = await fetchWithSession("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_name: record.productName,
        buy_price: record.buyPrice,
        expected_sell_price: record.sellPrice,
        other_cost: record.otherCost || 0,
        expected_profit: record.expectedProfit,
        roi: record.roi,
        flip_score: record.flipScore,
        analysis_date: record.analysisDate,
        analysis_type: record.type,
      }),
    });
    if (!response.ok) {
      throw new Error("계산 기록을 저장하지 못했습니다.");
    }

    await refreshAccountData();
    renderMyPage();
  } catch (error) {
    showToast(error.message || "계산 기록을 서버에 저장하지 못했습니다.");
  }
}

// 서버에서 동기화된 분석 이력 배열을 안전한 기본값과 함께 반환한다.
function loadAnalysisHistory() {
  return Array.isArray(state.analysisHistory) ? state.analysisHistory : [];
}

// 사용자 통계와 최근 분석 내역으로 마이페이지 콘텐츠를 구성한다.
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
        <h2>안녕하세요, ${escapeHTML(currentUser.nickname)}님</h2>
      </div>

      <div class="mypage-stats">
        <div class="analysis-stat">
          <span>관심상품</span>
          <strong>${favorites.length + getLiveFavorites().length}</strong>
        </div>
        <div class="analysis-stat">
          <span>분석한 상품</span>
          <strong>${history.length}</strong>
        </div>
        <div class="analysis-stat">
          <span>최근 분석</span>
          <strong>${recentHistory.length}</strong>
        </div>
      </div>

      <div class="section-header">
        <h2>최근 분석 기록</h2>
      </div>

      ${recentHistory.length ? recentHistory.map((item) => `
        <div class="history-item">
          <div class="meta">
            <h3>${escapeHTML(item.productName)}</h3>
            <p>${new Date(item.analysisDate).toLocaleDateString("ko-KR")} · ${item.type === "calculator" ? "수익 계산기" : "매물 분석"}</p>
          </div>
          <div class="meta-right">
            <p>수익: ${formatPrice(item.expectedProfit || 0)}</p>
            <p>ROI: ${(item.roi || 0).toFixed(1)}%</p>
            <p>Flip Score: ${item.flipScore || 0}</p>
          </div>
        </div>
      `).join("") : '<div class="empty-state">아직 분석 기록이 없습니다.</div>'}
    </div>
  `;
}

// 짧은 시간 동안 상태 메시지를 노출하고 기존 타이머를 교체한다.
function showToast(message) {
  pageRefs.toast.textContent = message;
  pageRefs.toast.classList.add("show");
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => {
    pageRefs.toast.classList.remove("show");
  }, 2200);
}
