"""Tools the assistant can call.

Every tool runs as the shopper who sent the message (ctx.user_id, None for guests)
and goes through the same queries as the normal endpoints, so the assistant can
never see or change more than the shopper could by clicking around.

Tools never change anything on their own: cart changes are handed to the browser
(the cart lives there), and cancelling an order only proposes it; the shopper
confirms with a button. The cart itself is read from what the browser sent with the
message, and prices and stock are always looked up fresh.
"""

from dataclasses import dataclass, field
from typing import Any, Callable

from .. import db
from ..orders import load_orders
from ..products import SORTS, fetch_product, fetch_products, search_products, serialize_product

MAX_SEARCH_RESULTS = 8
MAX_CART_QUANTITY = 20


@dataclass
class ToolContext:
    user_id: int | None
    # Products the tools returned, so the reply can show them as cards.
    seen_products: dict[int, dict] = field(default_factory=dict)
    # Cart changes and confirmations for the browser to apply.
    actions: list[dict] = field(default_factory=list)
    # The shopper's cart as the browser reported it (product id -> quantity), kept up to date
    # as tools change it so a later tool in the same turn sees the result of an earlier one.
    cart: dict[int, int] = field(default_factory=dict)


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


class BadArgs(Exception):
    """The model sent an argument we can't use. The message goes back to it so it can retry."""


def _int(args: dict, name: str, default: int | None = None, minimum: int | None = None) -> int:
    value = args.get(name, default)
    if value in (None, ""):
        raise BadArgs(f"{name} is required.")
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise BadArgs(f"{name} must be a whole number.")
    if minimum is not None and number < minimum:
        raise BadArgs(f"{name} must be at least {minimum}.")
    return number


def _dollars_to_cents(args: dict, name: str) -> int | None:
    value = args.get(name)
    if value in (None, ""):
        return None
    try:
        cents = round(float(value) * 100)
    except (TypeError, ValueError):
        raise BadArgs(f"{name} must be a number of dollars.")
    if cents < 0:
        raise BadArgs(f"{name} can't be negative.")
    return cents


def _sign_in_required() -> dict:
    return {"error": "The shopper is not signed in. Ask them to sign in to see their orders."}


def search_products_tool(ctx: ToolContext, args: dict) -> dict:
    result = search_products(
        q=str(args.get("query") or "").strip(),
        category=str(args.get("category") or "").strip(),
        sort=args.get("sort") if args.get("sort") in SORTS else "newest",
        page_size=MAX_SEARCH_RESULTS,
        max_price_cents=_dollars_to_cents(args, "max_price_dollars"),
        min_price_cents=_dollars_to_cents(args, "min_price_dollars"),
        in_stock_only=args.get("in_stock_only") is True,
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


def _cart_line(product: dict, quantity: int) -> dict:
    line = {
        "productId": product["id"],
        "name": product["name"],
        "quantity": quantity,
        "unitPrice": _money(product["priceCents"]),
        "lineTotal": _money(product["priceCents"] * quantity),
        "inStock": product["stock"],
    }
    if not product["isActive"]:
        line["problem"] = "No longer sold. It will be rejected at checkout."
    elif product["stock"] == 0:
        line["problem"] = "Sold out. It will be rejected at checkout."
    elif quantity > product["stock"]:
        line["problem"] = f"Only {product['stock']} left, fewer than the {quantity} in the cart."
    return line


def get_cart_tool(ctx: ToolContext, args: dict) -> dict:
    if not ctx.cart:
        return {"items": [], "subtotal": _money(0), "note": "The cart is empty."}
    with db.connection() as conn:
        found = fetch_products(conn, list(ctx.cart))
    lines, subtotal = [], 0
    for product_id, quantity in ctx.cart.items():
        row = found.get(product_id)
        if not row:
            lines.append({"productId": product_id, "quantity": quantity, "problem": "This product no longer exists."})
            continue
        product = serialize_product(row)
        lines.append(_cart_line(product, quantity))
        if product["isActive"]:
            subtotal += product["priceCents"] * quantity
    result = {"items": lines, "subtotal": _money(subtotal)}
    if any("problem" in line for line in lines):
        result["note"] = "Some lines have problems that checkout would reject. Tell the shopper which, and offer to fix them."
    return result


def add_to_cart_tool(ctx: ToolContext, args: dict) -> dict:
    product_id = _int(args, "product_id", minimum=1)
    wanted = _int(args, "quantity", default=1, minimum=1)
    with db.connection() as conn:
        row = fetch_product(conn, "p.id = %s AND p.is_active", product_id)
    if not row:
        return {"error": "That product isn't available."}
    product = serialize_product(row)
    if product["stock"] == 0:
        return {"error": f"{product['name']} is sold out."}

    # What's already in the cart counts against stock and the per-item limit.
    already = ctx.cart.get(product_id, 0)
    room = min(product["stock"], MAX_CART_QUANTITY) - already
    if room <= 0:
        return {
            "error": f"The cart already has {already} x {product['name']}, "
            f"which is the most the shopper can buy ({product['stock']} in stock)."
        }
    quantity = min(wanted, room)
    ctx.cart[product_id] = already + quantity
    _remember(ctx, product)
    ctx.actions.append({"type": "add_to_cart", "product": product, "quantity": quantity})
    result = {"ok": True, "added": f"{quantity} x {product['name']}", "nowInCart": already + quantity}
    if quantity < wanted:
        result["note"] = f"Only {quantity} of the {wanted} requested fit, because of stock or the per-item limit."
    return result


def remove_from_cart_tool(ctx: ToolContext, args: dict) -> dict:
    product_id = _int(args, "product_id", minimum=1)
    in_cart = ctx.cart.get(product_id, 0)
    if not in_cart:
        return {"error": "That product isn't in the cart."}
    if args.get("quantity") in (None, ""):
        remaining = 0
    else:
        remaining = max(0, in_cart - _int(args, "quantity", minimum=1))
    with db.connection() as conn:
        row = fetch_products(conn, [product_id]).get(product_id)
    name = row["name"] if row else f"product {product_id}"
    if remaining:
        ctx.cart[product_id] = remaining
    else:
        del ctx.cart[product_id]
    # The browser gets the new total rather than a delta, so applying it twice does no harm.
    ctx.actions.append({"type": "set_cart_quantity", "productId": product_id, "name": name, "quantity": remaining})
    return {"ok": True, "product": name, "nowInCart": remaining}


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
    """The shopper's own order, or None. Another user's order looks exactly like a missing one."""
    order_id = _int(args, "order_id", minimum=1)
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
                "min_price_dollars": {"type": "number", "description": "Only products at or above this price."},
                "in_stock_only": {"type": "boolean", "description": "Leave out sold-out products."},
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
        "name": "get_cart",
        "description": (
            "See what is in the shopper's cart right now, with current prices, stock, and the subtotal. "
            "Use it whenever the shopper asks about their cart or before suggesting additions or removals."
        ),
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "add_to_cart",
        "description": (
            "Add a product to the shopper's cart. Only do this when the shopper asks you to. "
            "Quantities already in the cart count toward stock."
        ),
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
        "name": "remove_from_cart",
        "description": (
            "Remove a product from the shopper's cart, or lower its quantity. Only do this when the shopper asks you to. "
            "Leave quantity out to remove the whole line."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "product_id": {"type": "integer"},
                "quantity": {"type": "integer", "minimum": 1, "description": "How many to take out."},
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
    "get_cart": get_cart_tool,
    "add_to_cart": add_to_cart_tool,
    "remove_from_cart": remove_from_cart_tool,
    "list_my_orders": list_my_orders_tool,
    "get_order": get_order_tool,
    "request_order_cancellation": request_order_cancellation_tool,
}
