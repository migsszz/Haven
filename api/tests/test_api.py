def product(client, slug: str) -> dict:
    return client.get(f"/api/products/{slug}").json


def place_order(client, headers, *lines):
    return client.post(
        "/api/orders",
        headers=headers,
        json={
            "items": [{"productId": pid, "quantity": qty} for pid, qty in lines],
            "shippingName": "Test Shopper",
            "shippingAddress": "1 Test Street, Manila",
        },
    )


def test_login_rejects_wrong_password(client, shopper):
    res = client.post("/api/auth/login", json={"email": "shopper@example.com", "password": "wrong-password"})
    assert res.status_code == 401


def test_duplicate_registration_is_rejected(client, shopper):
    res = client.post(
        "/api/auth/register", json={"email": "SHOPPER@example.com", "password": "password123", "name": "Again"}
    )
    assert res.status_code == 409


def test_catalog_filters_sorts_and_paginates(client):
    res = client.get("/api/products?category=electronics&sort=price_asc")
    prices = [p["priceCents"] for p in res.json["items"]]
    assert res.json["total"] == 4
    assert prices == sorted(prices)

    res = client.get("/api/products?q=water&pageSize=1&page=2")
    assert res.json["total"] == 2  # matches a name and a description
    assert len(res.json["items"]) == 1

    assert client.get("/api/products?sort=drop table").status_code == 400


def test_order_uses_server_prices_and_decrements_stock(client, shopper):
    item = product(client, "wireless-earbuds")
    res = place_order(client, shopper, (item["id"], 2), (item["id"], 1))

    assert res.status_code == 201, res.json
    assert res.json["totalCents"] == item["priceCents"] * 3
    assert res.json["items"][0]["quantity"] == 3  # duplicate lines merged
    assert product(client, "wireless-earbuds")["stock"] == item["stock"] - 3


def test_insufficient_stock_rolls_back_whole_order(client, shopper):
    notebook = product(client, "dotted-notebook")
    lamp = product(client, "smart-desk-lamp")

    res = place_order(client, shopper, (notebook["id"], 1), (lamp["id"], lamp["stock"] + 1))

    assert res.status_code == 409
    assert res.json["problems"][0]["productId"] == lamp["id"]
    assert product(client, "dotted-notebook")["stock"] == notebook["stock"]
    assert client.get("/api/orders", headers=shopper).json == []


def test_cancel_returns_stock(client, shopper):
    item = product(client, "mechanical-keyboard")
    order = place_order(client, shopper, (item["id"], 2)).json

    res = client.post(f"/api/orders/{order['id']}/cancel", headers=shopper)

    assert res.json["status"] == "cancelled"
    assert product(client, "mechanical-keyboard")["stock"] == item["stock"]
    assert client.post(f"/api/orders/{order['id']}/cancel", headers=shopper).status_code == 409


def test_shoppers_cannot_see_other_orders_or_admin_routes(client, shopper, admin):
    item = product(client, "portable-power-bank")
    order = place_order(client, admin, (item["id"], 1)).json

    assert client.get(f"/api/orders/{order['id']}", headers=shopper).status_code == 404
    assert client.get("/api/admin/orders", headers=shopper).status_code == 403
    assert client.get("/api/orders").status_code == 401


def test_admin_status_transitions(client, shopper, admin):
    item = product(client, "portable-power-bank")
    order = place_order(client, shopper, (item["id"], 1)).json
    url = f"/api/admin/orders/{order['id']}"

    assert client.patch(url, headers=admin, json={"status": "delivered"}).status_code == 409
    assert client.patch(url, headers=admin, json={"status": "shipped"}).json["status"] == "shipped"
    assert client.post(f"/api/orders/{order['id']}/cancel", headers=shopper).status_code == 409
    assert client.patch(url, headers=admin, json={"status": "delivered"}).json["status"] == "delivered"


def test_admin_product_crud(client, admin):
    res = client.post(
        "/api/admin/products",
        headers=admin,
        json={"slug": "test-mug", "name": "Test Mug", "categorySlug": "home-kitchen", "priceCents": 999, "stock": 3},
    )
    assert res.status_code == 201, res.json

    res = client.patch(f"/api/admin/products/{res.json['id']}", headers=admin, json={"isActive": False})
    assert res.json["isActive"] is False
    assert client.get("/api/products/test-mug").status_code == 404

    res = client.post(
        "/api/admin/products",
        headers=admin,
        json={"slug": "Bad Slug", "name": "X", "categorySlug": "home-kitchen", "priceCents": -1, "stock": 0},
    )
    assert res.status_code == 422
