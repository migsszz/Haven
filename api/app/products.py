from flask import Blueprint, request
from psycopg.errors import ForeignKeyViolation, UniqueViolation
from pydantic import BaseModel, Field

from . import db
from .auth import require_admin
from .errors import ApiError

bp = Blueprint("products", __name__)

# Whitelisted so the sort key can be put straight into ORDER BY.
SORTS = {
    "newest": "p.created_at DESC, p.id DESC",
    "price_asc": "p.price_cents ASC, p.id",
    "price_desc": "p.price_cents DESC, p.id",
    "name": "p.name ASC, p.id",
}
MAX_PAGE_SIZE = 48

PRODUCT_COLUMNS = """
    p.id, p.slug, p.name, p.description, p.price_cents, p.stock, p.image_url, p.is_active,
    c.slug AS category_slug, c.name AS category_name
"""


class ProductIn(BaseModel):
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=80)
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    category_slug: str = Field(alias="categorySlug")
    price_cents: int = Field(alias="priceCents", ge=0, le=10_000_000)
    stock: int = Field(ge=0, le=1_000_000)
    image_url: str | None = Field(default=None, alias="imageUrl", max_length=500)
    is_active: bool = Field(default=True, alias="isActive")


class ProductPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    category_slug: str | None = Field(default=None, alias="categorySlug")
    price_cents: int | None = Field(default=None, alias="priceCents", ge=0, le=10_000_000)
    stock: int | None = Field(default=None, ge=0, le=1_000_000)
    image_url: str | None = Field(default=None, alias="imageUrl", max_length=500)
    is_active: bool | None = Field(default=None, alias="isActive")


def serialize_product(row: dict) -> dict:
    return {
        "id": row["id"],
        "slug": row["slug"],
        "name": row["name"],
        "description": row["description"],
        "priceCents": row["price_cents"],
        "stock": row["stock"],
        "imageUrl": row["image_url"],
        "isActive": row["is_active"],
        "category": {"slug": row["category_slug"], "name": row["category_name"]},
    }


def _int_arg(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(request.args.get(name, default))
    except ValueError:
        raise ApiError(400, f"'{name}' must be a number")
    return max(minimum, min(value, maximum))


def _fetch_product(conn, where: str, value) -> dict | None:
    return conn.execute(
        f"SELECT {PRODUCT_COLUMNS} FROM products p JOIN categories c ON c.id = p.category_id WHERE {where}",
        (value,),
    ).fetchone()


@bp.get("/categories")
def list_categories():
    with db.connection() as conn:
        rows = conn.execute(
            """
            SELECT c.slug, c.name, count(p.id) AS product_count
            FROM categories c
            LEFT JOIN products p ON p.category_id = c.id AND p.is_active
            GROUP BY c.id
            ORDER BY c.id
            """
        ).fetchall()
    return [{"slug": r["slug"], "name": r["name"], "productCount": r["product_count"]} for r in rows]


def _search_products(include_inactive: bool):
    q = request.args.get("q", "").strip()
    category = request.args.get("category", "").strip()
    sort = request.args.get("sort", "newest")
    if sort not in SORTS:
        raise ApiError(400, f"'sort' must be one of: {', '.join(SORTS)}")
    page = _int_arg("page", 1, 1, 10_000)
    page_size = _int_arg("pageSize", 12, 1, MAX_PAGE_SIZE)

    conditions, params = [], []
    if not include_inactive:
        conditions.append("p.is_active")
    if q:
        conditions.append("(p.name ILIKE %s OR p.description ILIKE %s)")
        pattern = f"%{q}%"
        params += [pattern, pattern]
    if category:
        conditions.append("c.slug = %s")
        params.append(category)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    with db.connection() as conn:
        rows = conn.execute(
            f"""
            SELECT {PRODUCT_COLUMNS}, count(*) OVER () AS total
            FROM products p JOIN categories c ON c.id = p.category_id
            {where}
            ORDER BY {SORTS[sort]}
            LIMIT %s OFFSET %s
            """,
            params + [page_size, (page - 1) * page_size],
        ).fetchall()

    total = rows[0]["total"] if rows else 0
    return {
        "items": [serialize_product(r) for r in rows],
        "page": page,
        "pageSize": page_size,
        "total": total,
    }


@bp.get("/products")
def list_products():
    return _search_products(include_inactive=False)


@bp.get("/products/<slug>")
def get_product(slug: str):
    with db.connection() as conn:
        row = _fetch_product(conn, "p.slug = %s AND p.is_active", slug)
    if not row:
        raise ApiError(404, "Product not found")
    return serialize_product(row)


@bp.get("/admin/products")
@require_admin
def admin_list_products():
    return _search_products(include_inactive=True)


def _category_id(conn, slug: str) -> int:
    row = conn.execute("SELECT id FROM categories WHERE slug = %s", (slug,)).fetchone()
    if not row:
        raise ApiError(422, f"Unknown category '{slug}'")
    return row["id"]


@bp.post("/admin/products")
@require_admin
def admin_create_product():
    body = ProductIn.model_validate(request.get_json(silent=True) or {})
    try:
        with db.connection() as conn:
            product_id = conn.execute(
                """
                INSERT INTO products (slug, name, description, category_id, price_cents, stock, image_url, is_active)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    body.slug,
                    body.name,
                    body.description,
                    _category_id(conn, body.category_slug),
                    body.price_cents,
                    body.stock,
                    body.image_url,
                    body.is_active,
                ),
            ).fetchone()["id"]
            row = _fetch_product(conn, "p.id = %s", product_id)
    except UniqueViolation:
        raise ApiError(409, f"A product with slug '{body.slug}' already exists")
    return serialize_product(row), 201


@bp.patch("/admin/products/<int:product_id>")
@require_admin
def admin_update_product(product_id: int):
    body = ProductPatch.model_validate(request.get_json(silent=True) or {})
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise ApiError(400, "Nothing to update")

    with db.connection() as conn:
        if "category_slug" in changes:
            changes["category_id"] = _category_id(conn, changes.pop("category_slug"))
        # Keys come from the pydantic model's field names, never from the client.
        assignments = ", ".join(f"{column} = %s" for column in changes)
        try:
            updated = conn.execute(
                f"UPDATE products SET {assignments}, updated_at = now() WHERE id = %s RETURNING id",
                list(changes.values()) + [product_id],
            ).fetchone()
        except ForeignKeyViolation:
            raise ApiError(422, "Unknown category")
        if not updated:
            raise ApiError(404, "Product not found")
        row = _fetch_product(conn, "p.id = %s", product_id)
    return serialize_product(row)
