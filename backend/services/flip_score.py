from math import tanh
from typing import Any, Dict, Mapping, Optional


BASE_WEIGHTS = {
    "profitability": 35.0,
    "entry_price_advantage": 20.0,
    "liquidity": 20.0,
    "demand": 15.0,
    "transaction_risk": 10.0,
}

DIMENSION_LABELS = {
    "profitability": "비용 차감 수익성",
    "entry_price_advantage": "매입가 메리트",
    "liquidity": "판매 회전성",
    "demand": "상품 수요",
    "transaction_risk": "거래·가격 리스크",
}

DIMENSION_METHODS = {
    "profitability": "ROI 점수 65%와 순수익 규모 점수 35%를 결합합니다. 두 점수 모두 손익분기점 0을 50점으로 둡니다.",
    "entry_price_advantage": "50 + 50 × tanh((비교 등록가 중앙값 − 매입가) ÷ 중앙값 ÷ 20%); 완료 거래가가 아닌 활성 등록가를 참고합니다.",
    "liquidity": "판매까지 걸린 기간, 판매 완료율 등 실제 회전 데이터가 있을 때 산출합니다.",
    "demand": "완료 거래 빈도와 검색 관심 추이 등 실제 수요 지표가 있을 때 산출합니다.",
    "transaction_risk": "상품 상태, 정품·수리 여부, 반품 위험, 기간별 완료가 변동 데이터가 있을 때 산출합니다.",
}

CATEGORY_FACTORS = {
    "electronics": {
        "profitability": 1.05,
        "entry_price_advantage": 0.95,
        "liquidity": 1.05,
        "demand": 0.95,
        "transaction_risk": 1.15,
    },
    "fashion": {
        "profitability": 1.0,
        "entry_price_advantage": 1.05,
        "liquidity": 1.1,
        "demand": 1.15,
        "transaction_risk": 1.0,
    },
    "collectibles": {
        "profitability": 0.95,
        "entry_price_advantage": 1.0,
        "liquidity": 0.85,
        "demand": 1.2,
        "transaction_risk": 1.1,
    },
}

NET_PROFIT_SCALE = {
    "electronics": 100_000,
    "fashion": 60_000,
    "collectibles": 50_000,
    "general": 60_000,
}


def calculate_profitability_score(net_profit: int, buy_price: int, category: str) -> tuple[float, float]:
    """ROI와 원화 순수익 규모를 함께 평가해 수익성 점수와 ROI를 반환한다."""
    roi = net_profit / buy_price * 100 if buy_price > 0 else 0.0
    roi_score = 50.0 + 50.0 * tanh(roi / 100.0)
    profit_scale = NET_PROFIT_SCALE.get(category, NET_PROFIT_SCALE["general"])
    profit_amount_score = 50.0 + 50.0 * tanh(net_profit / profit_scale)
    return roi_score * 0.65 + profit_amount_score * 0.35, roi


def calculate_entry_price_score(reference_price: int, entry_price: int) -> tuple[float, float]:
    """활성 등록가 중앙값 대비 매입가 우위를 점수와 비율로 반환한다."""
    if reference_price <= 0:
        return 0.0, 0.0
    relative_advantage = (reference_price - entry_price) / reference_price
    return 50.0 + 50.0 * tanh(relative_advantage / 0.20), relative_advantage


def classify_category(name: str, category: str = "") -> str:
    """상품명과 공급자 카테고리에서 점수 가중치 프로필을 정한다."""
    text = f"{name} {category}".lower().replace(" ", "")
    if any(term in text for term in (
        "아이폰", "iphone", "갤럭시", "galaxy", "에어팟", "airpods", "전자", "노트북",
        "laptop", "카메라", "camera", "태블릿", "tablet", "스마트폰", "phone",
    )):
        return "electronics"
    if any(term in text for term in (
        "신발", "운동화", "스니커", "sneaker", "의류", "옷", "가방", "패션", "fashion",
        "나이키", "nike", "아디다스", "adidas", "뉴발란스", "newbalance",
    )):
        return "fashion"
    if any(term in text for term in (
        "피규어", "figure", "레고", "lego", "카드", "굿즈", "수집", "collectible", "한정판",
    )):
        return "collectibles"
    return "general"


def get_dynamic_weights(
    category: str,
    sample_count: int = 0,
    price_spread_ratio: Optional[float] = None,
) -> Dict[str, float]:
    """기본 비중을 상품군과 관측된 시장 표본 특성에 따라 조정해 100%로 정규화한다."""
    factors = CATEGORY_FACTORS.get(category, {})
    weights = {key: value * factors.get(key, 1.0) for key, value in BASE_WEIGHTS.items()}

    # 적은 비교 매물이나 큰 게시가 격차는 매입가 메리트 점수의 비중을 낮춘다.
    if 0 < sample_count < 5:
        weights["entry_price_advantage"] *= 0.7
    if price_spread_ratio is not None and price_spread_ratio >= 0.4:
        weights["entry_price_advantage"] *= 0.7
        weights["transaction_risk"] *= 1.2

    total = sum(weights.values())
    return {key: round(value * 100 / total, 1) for key, value in weights.items()}


def _confidence_level(confidence: int) -> str:
    if confidence >= 75:
        return "높음"
    if confidence >= 50:
        return "보통"
    return "낮음"


def calculate_flip_assessment(
    dimension_scores: Mapping[str, Optional[float]],
    category: str = "general",
    sample_count: int = 0,
    freshness_days: Optional[float] = None,
    freshness_coverage: float = 0.0,
    price_spread_ratio: Optional[float] = None,
    dimension_evidence: Optional[Mapping[str, str]] = None,
) -> Dict[str, Any]:
    """관측된 항목을 정규화하고 점수·가중치·기여 내역을 반환한다."""
    weights = get_dynamic_weights(category, sample_count, price_spread_ratio)
    available = {
        key: max(0.0, min(100.0, float(value)))
        for key, value in dimension_scores.items()
        if key in BASE_WEIGHTS and value is not None
    }
    available_weight = sum(weights[key] for key in available)

    sample_confidence = 0
    if sample_count == 1:
        sample_confidence = 20
    elif sample_count == 2:
        sample_confidence = 32
    elif 3 <= sample_count <= 4:
        sample_confidence = 45
    elif 5 <= sample_count <= 9:
        sample_confidence = 62
    elif 10 <= sample_count <= 19:
        sample_confidence = 78
    elif sample_count >= 20:
        sample_confidence = 90

    if freshness_days is None:
        freshness_confidence = 0
    elif freshness_days <= 7:
        freshness_confidence = 95
    elif freshness_days <= 30:
        freshness_confidence = 75
    elif freshness_days <= 90:
        freshness_confidence = 50
    else:
        freshness_confidence = 20
    freshness_coverage = max(0.0, min(1.0, freshness_coverage))
    freshness_confidence = round(freshness_confidence * freshness_coverage)

    evidence_coverage = sum(weights[key] for key in available)
    confidence = int(round(evidence_coverage * 0.5 + sample_confidence * 0.3 + freshness_confidence * 0.2))
    confidence_level = _confidence_level(confidence)

    score = None
    score_status = "unavailable"
    if available:
        score = int(round(sum(available[key] * weights[key] for key in available) / available_weight))
        score_status = "scored" if len(available) == len(BASE_WEIGHTS) else "provisional"

    evidence = dimension_evidence or {}
    breakdown = []
    for key, label in DIMENSION_LABELS.items():
        value = available.get(key)
        effective_weight = round(weights[key] * 100 / available_weight, 1) if value is not None else 0.0
        contribution = round(value * effective_weight / 100, 1) if value is not None else None
        breakdown.append({
            "key": key,
            "label": label,
            "score": round(value, 1) if value is not None else None,
            "weight": weights[key],
            "effectiveWeight": effective_weight,
            "contribution": contribution,
            "method": DIMENSION_METHODS[key],
            "status": "included" if value is not None else "unavailable",
            "evidence": evidence.get(key) or "판단에 필요한 시장 데이터가 없습니다.",
        })

    missing_dimensions = [DIMENSION_LABELS[key] for key in BASE_WEIGHTS if key not in available]
    confidence_reasons = []
    confidence_reasons.append(f"평가 항목 {len(available)}/5개에 근거 데이터가 있습니다.")
    if sample_count < 5:
        confidence_reasons.append(f"가격 표본이 {sample_count}개로 적습니다.")
    if freshness_days is None:
        confidence_reasons.append("게시 시점을 확인하지 못했습니다.")
    elif freshness_days > 30:
        confidence_reasons.append("검색 데이터가 30일보다 오래됐습니다.")
    if sample_count and freshness_coverage < 0.8:
        confidence_reasons.append(f"가격 표본 중 게시 시점을 확인한 비율은 {freshness_coverage:.0%}입니다.")
    if missing_dimensions:
        confidence_reasons.append(f"미산출 항목: {', '.join(missing_dimensions)}.")

    return {
        "flipScore": score,
        "scoreStatus": score_status,
        "scoreLabel": get_flip_score_label(score) if score is not None else "산정 불가",
        "scoreCategory": category,
        "scoreWeights": weights,
        "scoreBreakdown": breakdown,
        "dataConfidence": confidence,
        "dataConfidenceLevel": confidence_level,
        "dataConfidenceReasons": confidence_reasons,
        "scoredDimensionCount": len(available),
        "missingDimensions": missing_dimensions,
    }


def get_flip_score_label(score: Optional[int]) -> str:
    """점수 구간을 사용자가 이해하기 쉬운 매입 판단 문구로 바꾼다."""
    if score is None:
        return "산정 불가"
    if score >= 80:
        return "매우 좋은 매물"
    if score >= 65:
        return "구매 고려"
    if score >= 48:
        return "보통"
    if score >= 30:
        return "주의"
    return "손해 가능성 높음"


def calculate_analysis_summary(
    buy_price: int,
    expected_sell_price: int,
    other_cost: Optional[int] = None,
    transaction_fee: Optional[int] = None,
    shipping_cost: Optional[int] = None,
    category: str = "general",
    market_median_price: Optional[int] = None,
    market_sample_count: int = 0,
    freshness_days: Optional[float] = None,
    freshness_coverage: float = 0.0,
) -> Dict[str, Any]:
    """명시된 거래 비용과 평가 가능 시장 신호만 사용해 상세 점수를 계산한다."""
    category = category or "general"
    costs_known = other_cost is not None and transaction_fee is not None and shipping_cost is not None
    net_profit = None
    roi = None
    profitability_score = None
    if costs_known:
        net_profit = expected_sell_price - buy_price - int(other_cost) - int(transaction_fee) - int(shipping_cost)
        profitability_score, roi = calculate_profitability_score(net_profit, buy_price, category)

    entry_price_advantage = None
    evidence = {}
    if net_profit is not None:
        evidence["profitability"] = (
            f"순수익 {net_profit:,}원 · ROI {roi:.1f}% → 결합 수익성 {profitability_score:.1f}점 "
            f"(ROI 환산 점수 비중 65%, 순수익 규모 점수 비중 35%). "
            f"(판매가 {expected_sell_price:,}원 − 매입가 {buy_price:,}원 − "
            f"수수료 {int(transaction_fee):,}원 − 배송비 {int(shipping_cost):,}원 − 기타 {int(other_cost):,}원)"
        )
    else:
        evidence["profitability"] = "수수료·배송비·기타 비용을 모두 입력해야 순수익을 평가합니다."

    if market_median_price and market_median_price > 0 and market_sample_count >= 3:
        entry_price_advantage, relative_advantage = calculate_entry_price_score(market_median_price, buy_price)
        evidence["entry_price_advantage"] = (
            f"매입가 {buy_price:,}원은 게시 가격 중앙값 {market_median_price:,}원보다 "
            f"{relative_advantage * 100:+.1f}% 우위이며 매입가 메리트 {entry_price_advantage:.1f}점. "
            f"({market_sample_count}개 게시 가격 표본; 완료 거래가 아님)"
        )

    assessment = calculate_flip_assessment(
        {
            "profitability": profitability_score,
            "entry_price_advantage": entry_price_advantage,
            "liquidity": None,
            "demand": None,
            "transaction_risk": None,
        },
        category=category,
        sample_count=market_sample_count,
        freshness_days=freshness_days,
        freshness_coverage=freshness_coverage,
        dimension_evidence=evidence,
    )

    return {
        "profit": net_profit,
        "roi": round(roi, 2) if roi is not None else None,
        "flip_score": assessment["flipScore"],
        "recommendation": assessment["scoreLabel"],
        "score_status": assessment["scoreStatus"],
        "score_category": assessment["scoreCategory"],
        "score_weights": assessment["scoreWeights"],
        "score_breakdown": assessment["scoreBreakdown"],
        "data_confidence": assessment["dataConfidence"],
        "data_confidence_level": assessment["dataConfidenceLevel"],
        "data_confidence_reasons": assessment["dataConfidenceReasons"],
        "scored_dimension_count": assessment["scoredDimensionCount"],
        "missing_dimensions": assessment["missingDimensions"],
        "cost_breakdown": {
            "transaction_fee": transaction_fee,
            "shipping_cost": shipping_cost,
            "other_cost": other_cost,
            "net_profit": net_profit,
            "expected_sell_price_basis": "user_estimate",
        },
    }
