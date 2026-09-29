from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import Blueprint, current_app, g, request
from psycopg.errors import UniqueViolation
from pydantic import BaseModel, EmailStr, Field
from werkzeug.security import check_password_hash, generate_password_hash

from . import db
from .errors import ApiError

bp = Blueprint("auth", __name__)


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=100)


class LoginIn(BaseModel):
    # Not EmailStr: login only has to match what's stored, and the format rules
    # can reject addresses that were valid when the account was created.
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)


def _public_user(row: dict) -> dict:
    return {"id": row["id"], "email": row["email"], "name": row["name"], "isAdmin": row["is_admin"]}


def _issue_token(user: dict) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user["id"]),
        "admin": user["is_admin"],
        "iat": now,
        "exp": now + timedelta(hours=current_app.config["JWT_TTL_HOURS"]),
    }
    return jwt.encode(payload, current_app.config["JWT_SECRET"], algorithm="HS256")


def require_auth(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            raise ApiError(401, "Sign in required")
        try:
            claims = jwt.decode(header[7:], current_app.config["JWT_SECRET"], algorithms=["HS256"])
        except jwt.InvalidTokenError:
            raise ApiError(401, "Session expired, please sign in again")
        g.user_id = int(claims["sub"])
        g.is_admin = bool(claims.get("admin"))
        return view(*args, **kwargs)

    return wrapper


def require_admin(view):
    @wraps(view)
    @require_auth
    def wrapper(*args, **kwargs):
        if not g.is_admin:
            raise ApiError(403, "Admin access required")
        return view(*args, **kwargs)

    return wrapper


@bp.post("/register")
def register():
    body = RegisterIn.model_validate(request.get_json(silent=True) or {})
    try:
        with db.connection() as conn:
            user = conn.execute(
                """
                INSERT INTO users (email, password_hash, name)
                VALUES (%s, %s, %s)
                RETURNING id, email, name, is_admin
                """,
                (body.email.lower(), generate_password_hash(body.password), body.name.strip()),
            ).fetchone()
    except UniqueViolation:
        raise ApiError(409, "An account with that email already exists")
    return {"token": _issue_token(user), "user": _public_user(user)}, 201


@bp.post("/login")
def login():
    body = LoginIn.model_validate(request.get_json(silent=True) or {})
    with db.connection() as conn:
        user = conn.execute(
            "SELECT id, email, name, is_admin, password_hash FROM users WHERE email = %s",
            (body.email.lower(),),
        ).fetchone()
    if not user or not check_password_hash(user["password_hash"], body.password):
        raise ApiError(401, "Incorrect email or password")
    return {"token": _issue_token(user), "user": _public_user(user)}


@bp.get("/me")
@require_auth
def me():
    with db.connection() as conn:
        user = conn.execute("SELECT id, email, name, is_admin FROM users WHERE id = %s", (g.user_id,)).fetchone()
    if not user:
        raise ApiError(401, "Account no longer exists")
    return _public_user(user)
