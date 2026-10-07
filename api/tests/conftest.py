import os
import tempfile
from pathlib import Path

import psycopg
import pytest

from app import create_app

DB_DIR = Path(__file__).resolve().parent.parent / "db"


@pytest.fixture(scope="session")
def database_url():
    """TEST_DATABASE_URL (used in CI), or a throwaway local Postgres via pgserver."""
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        yield url
        return
    pgserver = pytest.importorskip("pgserver", reason="set TEST_DATABASE_URL or `pip install pgserver`")
    with tempfile.TemporaryDirectory() as data_dir:
        server = pgserver.get_server(data_dir, cleanup_mode="stop")
        yield server.get_uri()
        server.cleanup()


@pytest.fixture(scope="session")
def app(database_url):
    # No OPENAI_API_KEY: assistant tests install a fake model instead of calling OpenAI.
    return create_app({"DATABASE_URL": database_url, "JWT_SECRET": "test-secret-" + "x" * 32, "OPENAI_API_KEY": None})


@pytest.fixture(autouse=True)
def fresh_db(database_url):
    """Rebuild the schema and seed data before every test."""
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        for sql_file in sorted(DB_DIR.glob("*.sql")):
            conn.execute(sql_file.read_text(encoding="utf-8"))


@pytest.fixture
def client(app):
    return app.test_client()


def _register(client, email: str) -> str:
    res = client.post("/api/auth/register", json={"email": email, "password": "password123", "name": "Test"})
    assert res.status_code == 201, res.json
    return res.json["token"]


@pytest.fixture
def shopper(client):
    return {"Authorization": f"Bearer {_register(client, 'shopper@example.com')}"}


@pytest.fixture
def admin(app, client, database_url):
    _register(client, "admin@example.com")
    with psycopg.connect(database_url, autocommit=True) as conn:
        conn.execute("UPDATE users SET is_admin = true WHERE email = 'admin@example.com'")
    res = client.post("/api/auth/login", json={"email": "admin@example.com", "password": "password123"})
    return {"Authorization": f"Bearer {res.json['token']}"}
