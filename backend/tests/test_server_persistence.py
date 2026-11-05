import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import database
from services.auth_security import create_session_token, hash_password, hash_session_token, verify_password


class ServerPersistenceTests(unittest.TestCase):
    """임시 SQLite DB에서 계정·세션·관심상품·기록의 분리 저장을 검증한다."""

    def setUp(self):
        """각 테스트가 독립된 임시 데이터베이스를 사용하도록 준비한다."""
        self.temporary_directory = tempfile.TemporaryDirectory()
        database_path = Path(self.temporary_directory.name) / "test.db"
        self.database_path_patch = patch.object(database, "DB_PATH", str(database_path))
        self.database_path_patch.start()
        database.init_db()

    def tearDown(self):
        """DB 경로 패치와 임시 파일을 테스트 종료 후 정리한다."""
        self.database_path_patch.stop()
        self.temporary_directory.cleanup()

    def test_credentials_and_user_data_are_persisted_per_account(self):
        """비밀번호 원문 미저장, 세션 만료 확인, 사용자 간 데이터 격리를 검증한다."""
        first_password = "test-password-123"
        first = database.create_user_account("server-persist-user", hash_password(first_password))
        stored_account = database.get_user_account_by_username(first["username"])
        self.assertNotEqual(stored_account["password_hash"], first_password)
        self.assertTrue(verify_password(first_password, stored_account["password_hash"]))

        token = create_session_token()
        token_hash = hash_session_token(token)
        database.create_auth_session(first["id"], token_hash, "2999-10-15T00:00:00+00:00")
        self.assertEqual(database.get_account_for_session(token_hash, "2026-10-15T00:00:00+00:00")["id"], first["id"])

        listing = {
            "id": 101,
            "source": "tavily",
            "name": "iPhone 15 listing",
            "averagePrice": 300000,
            "url": "https://www.daangn.com/kr/buy-sell/test",
        }
        database.save_user_favorite(first["id"], "tavily:101", listing)
        history = {
            "product_name": listing["name"],
            "buy_price": 250000,
            "expected_sell_price": 300000,
            "other_cost": 5000,
            "expected_profit": 45000,
            "roi": 18.0,
            "flip_score": 70,
            "analysis_date": "2026-10-15T00:00:00",
            "analysis_type": "calculator",
        }
        database.save_user_analysis_record(first["id"], history)

        second = database.create_user_account("other-persist-user", hash_password("test-password-456"))
        self.assertEqual(database.get_user_favorites(first["id"]), [listing])
        self.assertEqual(database.get_user_analysis_history(first["id"])[0]["product_name"], listing["name"])
        self.assertEqual(database.get_user_favorites(second["id"]), [])
        self.assertEqual(database.get_user_analysis_history(second["id"]), [])


if __name__ == "__main__":
    unittest.main()