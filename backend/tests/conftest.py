"""Configure env vars BEFORE any app import."""
import os

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test_smoke.db"
os.environ["SUPERADMIN_EMAIL"] = "admin@voicenter.com.py"
os.environ["SUPERADMIN_PASSWORD"] = "Test1234!"  # password en plano
os.environ["UPLOAD_DIR"] = "./test_uploads"
os.environ["SECRET_KEY"] = "test-secret-key-1234567890"
