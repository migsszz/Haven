"""Tools the assistant can call.

Every tool runs as the shopper who sent the message (ctx.user_id, None for guests)
and goes through the same queries as the normal endpoints, so the assistant can
never see or change more than the shopper could by clicking around.

Tools never change anything on their own: adding to the cart is handed to the
browser (the cart lives there), and cancelling an order only proposes it; the
shopper confirms with a button.
"""

from dataclasses import dataclass, field
from typing import Any, Callable

from .. import db
from ..orders import load_orders
from ..products import SORTS, fetch_product, search_products, serialize_product

MAX_SEARCH_RESULTS = 8
MAX_CART_QUANTITY = 20


@dataclass
class ToolContext:
    user_id: int | None
    # Products the tools returned, so the reply can show them as cards.
    seen_products: dict[int, dict] = field(default_factory=dict)
    # Cart changes and confirmations for the browser to apply.
    actions: list[dict] = field(default_factory=list)


def _money(cents: int) -> str:
    return f"${cents / 100:,.2f}"


def _for_model(product: dict) -> dict:
    """What the model sees: enough to recommend, without internal fields."""
    return {
        "id": product["id"],
        "slug": product["slug"],
        "name": product["name"],
        "category": product["category"]["name"],
        "price": _money(product["priceCents"]),
        "inStock": product["stock"],
        "description": product["description"],
    }


def _remember(ctx: ToolContext, product: dict) -> None:
    ctx.seen_products[product["id"]] = product


def _sign_in_required() -> dict:
    return {"error": "The shopper is not signed in. Ask them to sign in to see their orders."}


def search_products_tool(ctx: ToolContext, args: dict) -> dict:
    max_price = args.get("max_price_dollars")
    result = search_products(
        q=str(args.get("query") or "").strip(),
        category=str(args.get("category") or "").strip(),
        sort=args.get("sort") if args.get("sort") in SORTS else "newest",
        page_size=MAX_SEARCH_RESULTS,
        max_price_cents=int(float(max_price) * 100) if max_price not in (None, "") else None,
    )
    for p in result["items"]:
        _remember(ctx, p)
    return {"total": result["total"], "products": [_for_model(p) for p in result["items"]]}


def get_product_tool(ctx: ToolContext, args: dict) -> dict:
    with db.connection() as conn:
        row = fetch_product(conn, "p.slug = %s AND p.is_active", str(args.get("slug", "")))
    if not row:
        return {"error": "No product with that slug."}
    product = serialize_product(row)
    _remember(ctx, product)
    return _for_model(product)


def list_categories_tool(ctx: ToolContext, args: dict) -> dict:
    with db.connection() as conn:
        rows = conn.execute("SELECT slug, name FROM categories ORDER BY id").fetchall()
    return {"categories": [dict(r) for r in rows]}


def add_to_cart_tool(ctx: ToolContext, args: dict) -> dict:
    try:
        product_id = int(args.get("product_id"))
        quantity = max(1, min(int(args.get("quantity", 1)), MAX_CART_QUANTITY))
    except (TypeError, ValueError):
        return {"error": "product_id and quantity must be numbers."}
    with db.connection() as conn:
        row = fetch_product(conn, "p.id = %s AND p.is_active", product_id)
    if not row:
        return {"error": "That product isn't available."}
    product = serialize_product(row)
    if product["stock"] == 0:
        return {"error": f"{product['name']} is sold out."}
    quantity = min(quantity, product["stock"])
    _remember(ctx, product)
    ctx.actions.append({"type": "add_to_cart", "product": product, "quantity": quantity})
    return {"ok": True, "added": f"{quantity} x {product['name']}"}


def list_my_orders_tool(ctx: ToolContext, args: dict) -> dict:
    if ctx.user_id is None:
        return _sign_in_required()
    with db.connection() as conn:
        orders = load_orders(conn, "WHERE o.user_id = %s", [ctx.user_id])[:10]
    return {
        "orders": [
            {
                "id": o["id"],
                "status": o["status"],
                "total": _money(o["totalCents"]),
                "placedAt": o["createdAt"],
                "items": [f"{i['quantity']} x {i['productName']}" for i in o["items"]],
            }
            for o in orders
        ]
    }


def _own_order(ctx: ToolContext, args: dict) -> dict | None:
    try:
        order_id = int(args.get("order_id"))
    except (TypeError, ValueError):
        return None
    with db.connection() as conn:
        orders = load_orders(conn, "WHERE o.id = %s AND o.user_id = %s", [order_id, ctx.user_id])
    return orders[0] if orders else None


def get_order_tool(ctx: ToolContext, args: dict) -> dict:
    if ctx.user_id is None:
        return _sign_in_required()
    order = _own_order(ctx, args)
    if not order:
        return {"error": "No order with that number on this account."}
    return {
        "id": order["id"],
        "status": order["status"],
        "total": _money(order["totalCents"]),
        "placedAt": order["createdAt"],
        "shipTo": order["shippingName"],
        "items": [
            {"name": i["productName"], "quantity": i["quantity"], "unitPrice": _money(i["unitPriceCents"])}
            for i in order["items"]
        ],
    }


def request_order_cancellation_tool(ctx: ToolContext, args: dict) -> dict:
    if ctx.user_id is None:
        return _sign_in_required()
    order = _own_order(ctx, args)
    if not order:
        return {"error": "No order with that number on this account."}
    if order["status"] != "placed":
        return {"error": f"Order #{order['id']} is {order['status']} and can no longer be cancelled."}
    ctx.actions.append({"type": "confirm_cancel_order", "orderId": order["id"]})
    return {
        "ok": True,
        "note": "Nothing has been cancelled yet. The shopper will see a confirm button; tell them to use it.",
    }


TOOL_SPECS: list[dict[str, Any]] = [
    {
        "name": "search_products",
        "description": (
            "Search the store's catalog. Use short keywords (e.g. 'coffee', 'bag', 'keyboard'), not full sentences. "
            "Every keyword must match, so search again with fewer or different words if nothing comes back."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Keywords to match against names and descriptions."},
                "category": {"type": "string", "description": "A category slug from list_categories."},
                "max_price_dollars": {"type": "number", "description": "Only products at or below this price."},
                "sort": {"type": "string", "enum": list(SORTS), "description": "Result order."},
            },
        },
    },
    {
        "name": "get_product",
        "description": "Get one product's full details and current stock by its slug.",
        "parameters": {
            "type": "object",
            "properties": {"slug": {"type": "string"}},
            "required": ["slug"],
        },
    },
    {
        "name": "list_categories",
        "description": "List the store's product categories and their slugs.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "add_to_cart",
        "description": "Add a product to the shopper's cart. Only do this when the shopper asks you to.",
        "parameters": {
            "type": "object",
            "properties": {
                "product_id": {"type": "integer"},
                "quantity": {"type": "integer", "minimum": 1, "maximum": MAX_CART_QUANTITY},
            },
            "required": ["product_id"],
        },
    },
    {
        "name": "list_my_orders",
        "description": "List the signed-in shopper's most recent orders, newest first.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "get_order",
        "description": "Get the details and status of one of the signed-in shopper's orders.",
        "parameters": {
            "type": "object",
            "properties": {"order_id": {"type": "integer"}},
            "required": ["order_id"],
        },
    },
    {
        "name": "request_order_cancellation",
        "description": (
            "Offer to cancel one of the shopper's orders that hasn't shipped. This does not cancel it: "
            "the shopper gets a confirm button. Only use it when they ask to cancel."
        ),
        "parameters": {
            "type": "object",
            "properties": {"order_id": {"type": "integer"}},
            "required": ["order_id"],
        },
    },
]

TOOLS: dict[str, Callable[[ToolContext, dict], dict]] = {
    "search_products": search_products_tool,
    "get_product": get_product_tool,
    "list_categories": list_categories_tool,
    "add_to_cart": add_to_cart_tool,
    "list_my_orders": list_my_orders_tool,
    "get_order": get_order_tool,
    "request_order_cancellation": request_order_cancellation_tool,
}
