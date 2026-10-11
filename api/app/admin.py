from flask import Blueprint

from . import db
from .auth import require_admin
from .orders import TRANSITIONS

bp = Blueprint("admin", __name__)

# Matches the storefront's "Only N left" cut-off.
LOW_STOCK_THRESHOLD = 5


@bp.get("/admin/summary")
@require_admin
def summary():
    """Headline numbers for the admin dashboard, counted in the database so they cover every order and product."""
    with db.connection() as conn:
        by_status = {row["status"]: row["n"] for row in conn.execute("SELECT status, count(*) AS n FROM orders GROUP BY status")}
        revenue = conn.execute("SELECT coalesce(sum(total_cents), 0) AS cents FROM orders WHERE status <> 'cancelled'").fetchone()
        products = conn.execute(
            """
            SELECT
                count(*) FILTER (WHERE is_active) AS live,
                count(*) FILTER (WHERE NOT is_active) AS hidden,
                count(*) FILTER (WHERE is_active AND stock <= %s) AS low
            FROM products
            """,
            (LOW_STOCK_THRESHOLD,),
        ).fetchone()
    return {
        "ordersByStatus": {status: by_status.get(status, 0) for status in TRANSITIONS},
        "revenueCents": int(revenue["cents"]),
        "liveProducts": products["live"],
        "hiddenProducts": products["hidden"],
        "lowStockProducts": products["low"],
    }
