from flask import Blueprint, g, request
from pydantic import BaseModel, Field

from . import db
from .auth import require_admin, require_auth
from .errors import ApiError

bp = Blueprint("orders", __name__)

# Which status changes an admin may make. Cancelling from 'placed' returns stock.
TRANSITIONS = {
    "placed": {"shipped", "cancelled"},
    "shipped": {"delivered"},
    "delivered": set(),
    "cancelled": set(),
}
MAX_LINES = 50


class OrderLineIn(BaseModel):
    product_id: int = Field(alias="productId", gt=0)
    quantity: int = Field(gt=0, le=20)


class OrderIn(BaseModel):
    items: list[OrderLineIn] = Field(min_length=1, max_length=MAX_LINES)
    shipping_name: str = Field(alias="shippingName", min_length=1, max_length=120)
    shipping_address: str = Field(alias="shippingAddress", min_length=5, max_length=500)


class StatusIn(BaseModel):
    status: str


def _serialize_order(order: dict, items: list[dict]) -> dict:
    return {
        "id": order["id"],
        "status": order["status"],
        "totalCents": order["total_cents"],
        "shippingName": order["shipping_name"],
        "shippingAddress": order["shipping_address"],
        "createdAt": order["created_at"].isoformat(),
        "customerEmail": order.get("email"),
        "items": [
            {
                "productId": i["product_id"],
                "productName": i["product_name"],
                "unitPriceCents": i["unit_price_cents"],
                "quantity": i["quantity"],
            }
            for i in items
        ],
    }


def _load_orders(conn, where: str, params: list) -> list[dict]:
    orders = conn.execute(
        f"""
        SELECT o.*, u.email FROM orders o JOIN users u ON u.id = o.user_id
        {where}
        ORDER BY o.created_at DESC, o.id DESC
        """,
        params,
    ).fetchall()
    if not orders:
        return []
    items = conn.execute(
        "SELECT * FROM order_items WHERE order_id = ANY(%s) ORDER BY id",
        ([o["id"] for o in orders],),
    ).fetchall()
    by_order: dict[int, list[dict]] = {}
    for item in items:
        by_order.setdefault(item["order_id"], []).append(item)
    return [_serialize_order(o, by_order.get(o["id"], [])) for o in orders]


def _restock(conn, order_id: int) -> None:
    conn.execute(
        """
        UPDATE products p SET stock = p.stock + oi.quantity, updated_at = now()
        FROM order_items oi
        WHERE oi.order_id = %s AND oi.product_id = p.id
        """,
        (order_id,),
    )


@bp.post("/orders")
@require_auth
def create_order():
    body = OrderIn.model_validate(request.get_json(silent=True) or {})

    # Merge duplicate lines so each product is checked against stock once.
    quantities: dict[int, int] = {}
    for line in body.items:
        quantities[line.product_id] = quantities.get(line.product_id, 0) + line.quantity
    product_ids = sorted(quantities)

    with db.connection() as conn, conn.transaction():
        # Lock the rows in id order so two concurrent checkouts can't both take
        # the last unit, and can't deadlock each other.
        products = conn.execute(
            """
            SELECT id, name, price_cents, stock, is_active
            FROM products WHERE id = ANY(%s)
            ORDER BY id
            FOR UPDATE
            """,
            (product_ids,),
        ).fetchall()
        found = {p["id"]: p for p in products}

        problems = []
        for pid in product_ids:
            product = found.get(pid)
            if not product or not product["is_active"]:
                problems.append({"productId": pid, "message": "This product is no longer available"})
            elif product["stock"] < quantities[pid]:
                problems.append(
                    {
                        "productId": pid,
                        "message": f"Only {product['stock']} left of {product['name']}",
                        "available": product["stock"],
                    }
                )
        if problems:
            # Raising inside the transaction rolls it back and releases the locks.
            raise ApiError(409, "Some items in your cart are no longer available", {"problems": problems})

        # Prices always come from the database, never from the client's cart.
        total = sum(found[pid]["price_cents"] * quantities[pid] for pid in product_ids)
        order = conn.execute(
            """
            INSERT INTO orders (user_id, total_cents, shipping_name, shipping_address)
            VALUES (%s, %s, %s, %s)
            RETURNING id
            """,
            (g.user_id, total, body.shipping_name.strip(), body.shipping_address.strip()),
        ).fetchone()
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity)
                VALUES (%s, %s, %s, %s, %s)
                """,
                [
                    (order["id"], pid, found[pid]["name"], found[pid]["price_cents"], quantities[pid])
                    for pid in product_ids
                ],
            )
            cur.executemany(
                "UPDATE products SET stock = stock - %s, updated_at = now() WHERE id = %s",
                [(quantities[pid], pid) for pid in product_ids],
            )
        created = _load_orders(conn, "WHERE o.id = %s", [order["id"]])[0]

    return created, 201



@bp.get("/orders")
@require_auth
def my_orders():
    with db.connection() as conn:
        return _load_orders(conn, "WHERE o.user_id = %s", [g.user_id])


@bp.get("/orders/<int:order_id>")
@require_auth
def get_order(order_id: int):
    with db.connection() as conn:
        orders = _load_orders(conn, "WHERE o.id = %s AND (o.user_id = %s OR %s)", [order_id, g.user_id, g.is_admin])
    if not orders:
        raise ApiError(404, "Order not found")
    return orders[0]


@bp.post("/orders/<int:order_id>/cancel")
@require_auth
def cancel_order(order_id: int):
    with db.connection() as conn, conn.transaction():
        order = conn.execute(
            "SELECT id, status FROM orders WHERE id = %s AND user_id = %s FOR UPDATE",
            (order_id, g.user_id),
        ).fetchone()
        if not order:
            raise ApiError(404, "Order not found")
        if order["status"] != "placed":
            raise ApiError(409, "Only orders that haven't shipped can be cancelled")
        conn.execute("UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = %s", (order_id,))
        _restock(conn, order_id)
        return _load_orders(conn, "WHERE o.id = %s", [order_id])[0]


@bp.get("/admin/orders")
@require_admin
def admin_list_orders():
    status = request.args.get("status")
    with db.connection() as conn:
        if status:
            if status not in TRANSITIONS:
                raise ApiError(400, f"'status' must be one of: {', '.join(TRANSITIONS)}")
            return _load_orders(conn, "WHERE o.status = %s", [status])
        return _load_orders(conn, "", [])


@bp.patch("/admin/orders/<int:order_id>")
@require_admin
def admin_update_status(order_id: int):
    body = StatusIn.model_validate(request.get_json(silent=True) or {})
    with db.connection() as conn, conn.transaction():
        order = conn.execute("SELECT id, status FROM orders WHERE id = %s FOR UPDATE", (order_id,)).fetchone()
        if not order:
            raise ApiError(404, "Order not found")
        if body.status not in TRANSITIONS[order["status"]]:
            raise ApiError(409, f"Can't change an order from '{order['status']}' to '{body.status}'")
        conn.execute("UPDATE orders SET status = %s, updated_at = now() WHERE id = %s", (body.status, order_id))
        if body.status == "cancelled":
            _restock(conn, order_id)
        return _load_orders(conn, "WHERE o.id = %s", [order_id])[0]
