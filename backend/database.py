import os
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

DB_PATH = os.path.join(os.path.dirname(__file__), "flipcheck.db")


def get_connection() -> sqlite3.Connection:
    """SQLite 연결을 만들고 컬럼명을 키로 조회할 수 있게 설정한다."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """기존 DB를 보존하면서 앱에서 사용하는 테이블을 없을 때만 생성한다."""
    conn = get_connection()
    # 아래 두 테이블은 계정 연결 기능 이전 버전의 전역 기록 구조를 보존한다.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS analysis_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_name TEXT NOT NULL,
            buy_price INTEGER NOT NULL,
            expected_sell_price INTEGER NOT NULL,
            expected_profit INTEGER NOT NULL,
            roi REAL NOT NULL,
            flip_score INTEGER NOT NULL,
            analysis_date TEXT NOT NULL,
            analysis_type TEXT NOT NULL
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nickname TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    # 현재 인증/계정 데이터는 user_accounts를 기준으로 분리 저장한다.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL COLLATE NOCASE UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    # 쿠키 원문 대신 해시만 저장하며, 계정 삭제 시 세션도 함께 제거한다.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS auth_sessions (
            token_hash TEXT PRIMARY KEY,
            account_id INTEGER NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    # 매물 원본은 JSON으로 보관하고 계정별 복합 키로 중복 저장을 막는다.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_favorites (
            account_id INTEGER NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
            favorite_key TEXT NOT NULL,
            listing_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (account_id, favorite_key)
        )
        """
    )
    # 수익 계산과 매물 분석 이력은 계정 소유로 저장해 사용자 간 분리한다.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_analysis_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
            product_name TEXT NOT NULL,
            buy_price INTEGER NOT NULL,
            expected_sell_price INTEGER NOT NULL,
            other_cost INTEGER NOT NULL DEFAULT 0,
            expected_profit INTEGER NOT NULL,
            roi REAL NOT NULL,
            flip_score INTEGER NOT NULL,
            analysis_date TEXT NOT NULL,
            analysis_type TEXT NOT NULL
        )
        """
    )

    # 검색어는 최근 30일의 인기 검색 순위 집계에만 사용하고 이후 자동 정리한다.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS search_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query_key TEXT NOT NULL,
            display_query TEXT NOT NULL,
            searched_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_search_events_searched_at ON search_events(searched_at)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_search_events_query_key ON search_events(query_key)"
    )

    conn.commit()
    conn.close()


def record_search_query(query: str) -> None:
    """검색 요청 한 건을 기록하고 30일이 지난 검색어 이력을 정리한다."""
    display_query = " ".join((query or "").split())
    if not display_query:
        return

    now = datetime.now(timezone.utc)
    searched_at = now.isoformat(timespec="microseconds")
    cutoff = (now - timedelta(days=30)).isoformat(timespec="microseconds")
    conn = get_connection()
    try:
        conn.execute("DELETE FROM search_events WHERE searched_at < ?", (cutoff,))
        conn.execute(
            "INSERT INTO search_events (query_key, display_query, searched_at) VALUES (?, ?, ?)",
            (display_query.casefold(), display_query, searched_at),
        )
        conn.commit()
    finally:
        conn.close()


def get_popular_searches(limit: int = 4) -> List[Dict[str, Any]]:
    """최근 30일 동안의 검색 횟수 내림차순으로 검색어를 반환한다."""
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=30)).isoformat(timespec="microseconds")
    conn = get_connection()
    try:
        conn.execute("DELETE FROM search_events WHERE searched_at < ?", (cutoff,))
        rows = conn.execute(
            """
            SELECT grouped.query_key,
                (
                    SELECT latest.display_query
                    FROM search_events AS latest
                    WHERE latest.query_key = grouped.query_key
                    ORDER BY latest.searched_at DESC, latest.id DESC
                    LIMIT 1
                ) AS keyword,
                grouped.search_count AS searchCount
            FROM (
                SELECT query_key, COUNT(*) AS search_count, MAX(searched_at) AS latest_at
                FROM search_events
                WHERE searched_at >= ?
                GROUP BY query_key
            ) AS grouped
            ORDER BY grouped.search_count DESC, grouped.latest_at DESC, grouped.query_key ASC
            LIMIT ?
            """,
            (cutoff, max(1, min(int(limit), 20))),
        ).fetchall()
        conn.commit()
        return [
            {"keyword": row["keyword"], "searchCount": row["searchCount"]}
            for row in rows
        ]
    finally:
        conn.close()


def create_user_account(username: str, password_hash: str) -> Dict[str, Any]:
    """고유 사용자 계정을 만들고 공개 가능한 생성 결과를 반환한다."""
    conn = get_connection()
    cursor = conn.execute(
        "INSERT INTO user_accounts (username, password_hash) VALUES (?, ?)",
        (username, password_hash),
    )
    account_id = cursor.lastrowid
    row = conn.execute(
        "SELECT id, username, created_at FROM user_accounts WHERE id = ?",
        (account_id,),
    ).fetchone()
    conn.commit()
    conn.close()
    return dict(row)


def get_user_account_by_username(username: str) -> Dict[str, Any] | None:
    """로그인 검증에 필요한 해시를 포함해 사용자 이름으로 계정을 찾는다."""
    conn = get_connection()
    row = conn.execute(
        "SELECT id, username, password_hash, created_at FROM user_accounts WHERE username = ?",
        (username,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_account_by_id(account_id: int) -> Dict[str, Any] | None:
    """비밀번호 해시를 제외한 계정 요약을 ID로 조회한다."""
    conn = get_connection()
    row = conn.execute(
        "SELECT id, username, created_at FROM user_accounts WHERE id = ?",
        (account_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def create_auth_session(account_id: int, token_hash: str, expires_at: str) -> None:
    """원문이 아닌 토큰 해시와 만료 시각을 계정에 연결해 저장한다."""
    conn = get_connection()
    conn.execute(
        "INSERT INTO auth_sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)",
        (token_hash, account_id, expires_at),
    )
    conn.commit()
    conn.close()


def get_account_for_session(token_hash: str, now: str) -> Dict[str, Any] | None:
    """토큰이 일치하고 아직 만료되지 않은 세션의 사용자만 조회한다."""
    conn = get_connection()
    row = conn.execute(
        """
        SELECT accounts.id, accounts.username, accounts.created_at
        FROM auth_sessions AS sessions
        JOIN user_accounts AS accounts ON accounts.id = sessions.account_id
        WHERE sessions.token_hash = ? AND sessions.expires_at > ?
        """,
        (token_hash, now),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_auth_session(token_hash: str) -> None:
    """로그아웃된 세션 토큰 해시를 DB에서 제거한다."""
    conn = get_connection()
    conn.execute("DELETE FROM auth_sessions WHERE token_hash = ?", (token_hash,))
    conn.commit()
    conn.close()


def get_user_favorites(account_id: int) -> List[Dict[str, Any]]:
    """사용자별 JSON 매물 목록을 최근 저장 순서로 읽어 객체로 복원한다."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT listing_json FROM user_favorites WHERE account_id = ? ORDER BY created_at DESC",
        (account_id,),
    ).fetchall()
    conn.close()
    return [json.loads(row["listing_json"]) for row in rows]


def save_user_favorite(account_id: int, favorite_key: str, listing: Dict[str, Any]) -> None:
    """계정과 매물 키를 기준으로 관심상품을 추가하거나 최신 데이터로 갱신한다."""
    conn = get_connection()
    conn.execute(
        """
        INSERT INTO user_favorites (account_id, favorite_key, listing_json)
        VALUES (?, ?, ?)
        ON CONFLICT(account_id, favorite_key) DO UPDATE SET listing_json = excluded.listing_json
        """,
        (account_id, favorite_key, json.dumps(listing, ensure_ascii=False)),
    )
    conn.commit()
    conn.close()


def delete_user_favorite(account_id: int, favorite_key: str) -> None:
    """지정 계정에 속한 관심상품 한 건만 삭제한다."""
    conn = get_connection()
    conn.execute(
        "DELETE FROM user_favorites WHERE account_id = ? AND favorite_key = ?",
        (account_id, favorite_key),
    )
    conn.commit()
    conn.close()


def save_user_analysis_record(account_id: int, record: Dict[str, Any]) -> None:
    """계정별 수익 계산/분석 결과를 숫자형 필드로 검증해 저장한다."""
    conn = get_connection()
    conn.execute(
        """
        INSERT INTO user_analysis_history (
            account_id, product_name, buy_price, expected_sell_price, other_cost,
            expected_profit, roi, flip_score, analysis_date, analysis_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            account_id,
            record.get("product_name"),
            int(record.get("buy_price", 0)),
            int(record.get("expected_sell_price", 0)),
            int(record.get("other_cost", 0)),
            int(record.get("expected_profit", 0)),
            float(record.get("roi", 0)),
            int(record.get("flip_score", 0)),
            record.get("analysis_date"),
            record.get("analysis_type", "calculator"),
        ),
    )
    conn.commit()
    conn.close()


def get_user_analysis_history(account_id: int, limit: int = 10) -> List[Dict[str, Any]]:
    """사용자 계정에 속한 최근 분석 기록만 제한된 개수로 반환한다."""
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT product_name, buy_price, expected_sell_price, other_cost, expected_profit,
            roi, flip_score, analysis_date, analysis_type
        FROM user_analysis_history
        WHERE account_id = ?
        ORDER BY id DESC
        LIMIT ?
        """,
        (account_id, limit),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def save_analysis_record(record: Dict[str, Any]) -> None:
    """계정 연결이 없는 레거시 분석 기록 테이블에 결과를 저장한다."""
    conn = get_connection()
    conn.execute(
        """
        INSERT INTO analysis_history (
            product_name,
            buy_price,
            expected_sell_price,
            expected_profit,
            roi,
            flip_score,
            analysis_date,
            analysis_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            record.get("product_name"),
            int(record.get("buy_price", 0)),
            int(record.get("expected_sell_price", 0)),
            int(record.get("expected_profit", 0)),
            float(record.get("roi", 0)),
            int(record.get("flip_score", 0)),
            record.get("analysis_date"),
            record.get("analysis_type", "analysis"),
        ),
    )
    conn.commit()
    conn.close()


def get_analysis_history(limit: int = 10) -> List[Dict[str, Any]]:
    """레거시 전체 분석 이력을 최신 순으로 제한 조회한다."""
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT * FROM analysis_history
        ORDER BY id DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]
