import os

import click
from flask import Flask, jsonify
from pydantic import ValidationError
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import generate_password_hash

from . import db
from .errors import ApiError


def create_app(config: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config.update(
        DATABASE_URL=os.environ.get("DATABASE_URL", "postgresql://haven:haven@localhost:5432/haven"),
        JWT_SECRET=os.environ.get("JWT_SECRET"),
        JWT_TTL_HOURS=int(os.environ.get("JWT_TTL_HOURS", "8")),
        # Optional: without a key the assistant endpoints report it as disabled.
        GEMINI_API_KEY=os.environ.get("GEMINI_API_KEY"),
        GEMINI_MODEL=os.environ.get("GEMINI_MODEL", "gemini-flash-latest"),
    )
    if config:
        app.config.update(config)
    if len(app.config["JWT_SECRET"] or "") < 32:
        raise RuntimeError("JWT_SECRET must be set to at least 32 characters")

    # nginx sits in front of the API; trust its X-Forwarded-For so request.remote_addr
    # is the shopper's address (used by the assistant's rate limit).
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)

    db.init_app(app)

    from . import assistant
    from .auth import bp as auth_bp
    from .orders import bp as orders_bp
    from .products import bp as products_bp

    assistant.init_app(app)
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(products_bp, url_prefix="/api")
    app.register_blueprint(orders_bp, url_prefix="/api")
    app.register_blueprint(assistant.bp, url_prefix="/api/assistant")

    @app.get("/api/health")
    def health():
        with db.connection() as conn:
            conn.execute("SELECT 1")
        return {"status": "ok"}

    @app.errorhandler(ApiError)
    def handle_api_error(err: ApiError):
        return jsonify(error=err.message, **err.extra), err.status

    @app.errorhandler(ValidationError)
    def handle_validation_error(err: ValidationError):
        details = [{"field": ".".join(str(p) for p in e["loc"]), "message": e["msg"]} for e in err.errors()]
        return jsonify(error="Invalid request", details=details), 422

    @app.errorhandler(HTTPException)
    def handle_http_error(err: HTTPException):
        return jsonify(error=err.description), err.code

    @app.cli.command("create-admin")
    @click.argument("email")
    @click.argument("password")
    @click.option("--name", default="Admin")
    def create_admin(email: str, password: str, name: str):
        """Create an admin user, or promote an existing one."""
        with db.connection() as conn:
            conn.execute(
                """
                INSERT INTO users (email, password_hash, name, is_admin)
                VALUES (%s, %s, %s, true)
                ON CONFLICT (email) DO UPDATE SET is_admin = true
                """,
                (email.lower(), generate_password_hash(password), name),
            )
        click.echo(f"Admin ready: {email}")

    return app
