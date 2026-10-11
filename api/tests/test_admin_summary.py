from tests.test_api import place_order, product


def test_summary_is_admin_only(client, shopper):
    assert client.get("/api/admin/summary").status_code == 401
    assert client.get("/api/admin/summary", headers=shopper).status_code == 403


def test_summary_counts_orders_revenue_and_stock(client, admin, shopper):
    empty = client.get("/api/admin/summary", headers=admin).json
    assert empty["ordersByStatus"] == {"placed": 0, "shipped": 0, "delivered": 0, "cancelled": 0}
    assert empty["revenueCents"] == 0
    live_before = empty["liveProducts"]

    pen = product(client, "fountain-pen")
    bank = product(client, "portable-power-bank")
    first = place_order(client, shopper, (pen["id"], 2)).json
    second = place_order(client, shopper, (bank["id"], 1)).json
    place_order(client, shopper, (pen["id"], 1))
    client.patch(f"/api/admin/orders/{first['id']}", headers=admin, json={"status": "shipped"})
    client.post(f"/api/orders/{second['id']}/cancel", headers=shopper)

    result = client.get("/api/admin/summary", headers=admin).json

    assert result["ordersByStatus"] == {"placed": 1, "shipped": 1, "delivered": 0, "cancelled": 1}
    # The cancelled order is not revenue.
    assert result["revenueCents"] == pen["priceCents"] * 3
    assert result["liveProducts"] == live_before


def test_summary_counts_low_stock_and_hidden_products(client, admin):
    before = client.get("/api/admin/summary", headers=admin).json
    item = product(client, "dotted-notebook")

    client.patch(f"/api/admin/products/{item['id']}", headers=admin, json={"stock": 5})
    low = client.get("/api/admin/summary", headers=admin).json
    assert low["lowStockProducts"] == before["lowStockProducts"] + 1

    client.patch(f"/api/admin/products/{item['id']}", headers=admin, json={"isActive": False})
    hidden = client.get("/api/admin/summary", headers=admin).json
    # A hidden product is neither live nor counted as low stock.
    assert hidden["hiddenProducts"] == before["hiddenProducts"] + 1
    assert hidden["liveProducts"] == before["liveProducts"] - 1
    assert hidden["lowStockProducts"] == before["lowStockProducts"]
