"""Configure env vars BEFORE any app import."""
import os

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_smoke.db"
os.environ["SUPERADMIN_EMAIL"] = "admin@voicenter.com.py"
os.environ["UPLOAD_DIR"] = "./test_uploads"
os.environ["SECRET_KEY"] = "test-secret-key-1234567890"

# Generate fresh bcrypt hash
from passlib.context import CryptContext  # noqa: E402

_ctx = CryptContext(schemes=["bcrypt"])
os.environ["SUPERADMIN_PASSWORD_HASH"] = _ctx.hash("Test1234!")
