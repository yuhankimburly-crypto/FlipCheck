import hashlib
import hmac
import secrets


def hash_password(password: str) -> str:
    """계정별 난수 salt와 scrypt를 사용해 저장 가능한 비밀번호 해시를 만든다."""
    salt = secrets.token_bytes(16)
    password_hash = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=16384, r=8, p=1, dklen=32)
    return f"scrypt$16384$8$1${salt.hex()}${password_hash.hex()}"


def verify_password(password: str, encoded_hash: str) -> bool:
    """저장 형식의 매개변수로 후보 비밀번호를 재계산해 상수 시간 비교한다."""
    try:
        algorithm, n_value, r_value, p_value, salt_hex, expected_hex = encoded_hash.split("$")
        if algorithm != "scrypt":
            return False
        candidate = hashlib.scrypt(
            password.encode("utf-8"),
            salt=bytes.fromhex(salt_hex),
            n=int(n_value),
            r=int(r_value),
            p=int(p_value),
            dklen=32,
        )
        return hmac.compare_digest(candidate.hex(), expected_hex)
    except (ValueError, TypeError):
        return False


def create_session_token() -> str:
    """브라우저 쿠키에 사용할 예측하기 어려운 세션 토큰을 생성한다."""
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    """원문 세션 토큰 대신 DB에 저장할 SHA-256 해시를 만든다."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()