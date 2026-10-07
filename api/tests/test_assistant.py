"""The agent loop and tools, driven by a scripted fake model instead of a real one."""

import pytest

from app.assistant.agent import MAX_STEPS
from app.assistant.llm import ModelTurn, ToolCall


class FakeChat:
    def __init__(self, script, log):
        self.script = list(script)
        self.log = log

    def send_message(self, text):
        self.log.append(("user", text))
        return self._next()

    def send_tool_results(self, results):
        self.log.append(("tools", [(r.call.name, r.output) for r in results]))
        return self._next()

    def _next(self):
        step = self.script.pop(0)
        return step(self.log) if callable(step) else step


class FakeLLM:
    """Replays a list of ModelTurns (or functions of the log, to react to tool output)."""

    def __init__(self, *script):
        self.script = script
        self.log = []
        self.history = None

    def start_chat(self, system, tools, history):
        self.history = history
        return FakeChat(self.script, self.log)


@pytest.fixture
def use_llm(app):
    def install(llm):
        app.extensions["assistant_llm"] = llm
        app.extensions["assistant_limiter"].hits.clear()
        return llm

    yield install
    app.extensions.pop("assistant_llm", None)


def chat(client, message, headers=None, history=None, cart=None):
    return client.post(
        "/api/assistant/chat",
        headers=headers or {},
        json={"message": message, "history": history or [], "cart": cart or []},
    )


def last_tool_output(log):
    return log[-1][1][0][1]


def test_disabled_without_a_model(client):
    assert client.get("/api/assistant/status").json == {"enabled": False}
    assert chat(client, "hi").status_code == 503


def test_search_then_answer_shows_product_cards(client, use_llm):
    llm = use_llm(
        FakeLLM(
            ModelTurn(calls=[ToolCall("search_products", {"query": "water", "max_price_dollars": 30})]),
            lambda log: ModelTurn(text=f"Try the {last_tool_output(log)['products'][0]['name']}."),
        )
    )

    res = chat(client, "a water bottle under $30?", history=[{"role": "user", "text": "hello"}])

    assert res.status_code == 200, res.json
    assert res.json["reply"] == "Try the Insulated Water Bottle 750ml."
    assert [p["slug"] for p in res.json["products"]] == ["insulated-water-bottle"]
    assert llm.history[0].text == "hello"
    # The price filter reached the query: the $69 daypack also mentions water but isn't returned.
    names = [p["name"] for p in last_tool_output(llm.log[:2])["products"]]
    assert names == ["Insulated Water Bottle 750ml"]


def test_add_to_cart_is_returned_as_an_action_capped_at_stock(client, use_llm):
    lamp = client.get("/api/products/smart-desk-lamp").json
    use_llm(
        FakeLLM(
            ModelTurn(calls=[ToolCall("add_to_cart", {"product_id": lamp["id"], "quantity": 50})]),
            ModelTurn(text="Done!"),
        )
    )

    res = chat(client, "add ten lamps")

    [action] = res.json["actions"]
    assert action["type"] == "add_to_cart"
    assert action["product"]["id"] == lamp["id"]
    assert action["quantity"] == lamp["stock"]
    # Stock is untouched: the cart lives in the browser until checkout.
    assert client.get("/api/products/smart-desk-lamp").json["stock"] == lamp["stock"]


def test_order_tools_require_sign_in_and_only_see_own_orders(client, use_llm, shopper, admin):
    item = client.get("/api/products/fountain-pen").json
    order = client.post(
        "/api/orders",
        headers=admin,
        json={"items": [{"productId": item["id"], "quantity": 1}], "shippingName": "A", "shippingAddress": "1 Admin Rd"},
    ).json

    llm = use_llm(
        FakeLLM(ModelTurn(calls=[ToolCall("list_my_orders", {})]), ModelTurn(text="Please sign in."))
    )
    chat(client, "where is my order?")
    assert "not signed in" in last_tool_output(llm.log)["error"]

    llm = use_llm(
        FakeLLM(ModelTurn(calls=[ToolCall("get_order", {"order_id": order["id"]})]), ModelTurn(text="Not found."))
    )
    chat(client, f"status of order {order['id']}?", headers=shopper)
    assert "No order" in last_tool_output(llm.log)["error"]


def test_cancellation_is_only_proposed(client, use_llm, shopper):
    item = client.get("/api/products/yoga-mat").json
    order = client.post(
        "/api/orders",
        headers=shopper,
        json={"items": [{"productId": item["id"], "quantity": 1}], "shippingName": "S", "shippingAddress": "1 Shop St"},
    ).json
    use_llm(
        FakeLLM(
            ModelTurn(calls=[ToolCall("request_order_cancellation", {"order_id": order["id"]})]),
            ModelTurn(text="Use the button below to confirm."),
        )
    )

    res = chat(client, "cancel my order", headers=shopper)

    assert res.json["actions"] == [{"type": "confirm_cancel_order", "orderId": order["id"]}]
    assert client.get(f"/api/orders/{order['id']}", headers=shopper).json["status"] == "placed"


def test_tool_errors_are_reported_to_the_model_not_the_shopper(client, use_llm):
    llm = use_llm(
        FakeLLM(
            ModelTurn(calls=[ToolCall("drop_tables", {}), ToolCall("search_products", {"max_price_dollars": "abc"})]),
            ModelTurn(text="Sorry about that."),
        )
    )

    res = chat(client, "hmm")

    assert res.status_code == 200
    outputs = [output for _, output in llm.log[-1][1]]
    assert all("error" in o for o in outputs)


def test_loop_stops_after_max_steps(client, use_llm):
    looping = ModelTurn(calls=[ToolCall("list_categories", {})])
    use_llm(FakeLLM(*[looping] * (MAX_STEPS + 1)))

    res = chat(client, "loop forever")

    assert res.status_code == 200
    assert "couldn't finish" in res.json["reply"]


def test_model_failure_is_a_clean_502(client, use_llm):
    def boom(log):
        raise RuntimeError("upstream down")

    use_llm(FakeLLM(boom))
    res = chat(client, "hello")
    assert res.status_code == 502
    assert "unavailable" in res.json["error"]


def test_rate_limit(app, client, use_llm):
    use_llm(FakeLLM(*[ModelTurn(text="hi")] * 30))
    statuses = [chat(client, "hi").status_code for _ in range(app.extensions["assistant_limiter"].limit + 1)]
    assert statuses[-1] == 429
    assert set(statuses[:-1]) == {200}


def line(product, quantity):
    return {"productId": product["id"], "quantity": quantity}


def test_get_cart_prices_the_cart_from_the_database_and_flags_problems(client, use_llm):
    lamp = client.get("/api/products/smart-desk-lamp").json
    pen = client.get("/api/products/fountain-pen").json
    llm = use_llm(FakeLLM(ModelTurn(calls=[ToolCall("get_cart", {})]), ModelTurn(text="ok")))

    # The browser claims more lamps than exist; the tool says so rather than trusting the cart.
    chat(client, "what's in my cart?", cart=[line(lamp, 20), line(pen, 2)])

    out = last_tool_output(llm.log)
    by_name = {i["name"]: i for i in out["items"]}
    assert by_name[pen["name"]]["lineTotal"] == f"${pen['priceCents'] * 2 / 100:,.2f}"
    assert "problem" in by_name[lamp["name"]]
    assert "problem" not in by_name[pen["name"]]
    assert "checkout would reject" in out["note"]
    assert out["subtotal"] == f"${(pen['priceCents'] * 2 + lamp['priceCents'] * 20) / 100:,.2f}"


def test_get_cart_on_an_empty_cart(client, use_llm):
    llm = use_llm(FakeLLM(ModelTurn(calls=[ToolCall("get_cart", {})]), ModelTurn(text="Empty.")))
    chat(client, "my cart?")
    assert last_tool_output(llm.log)["items"] == []


def test_add_to_cart_counts_what_is_already_in_the_cart(client, use_llm):
    lamp = client.get("/api/products/smart-desk-lamp").json
    use_llm(
        FakeLLM(
            ModelTurn(calls=[ToolCall("add_to_cart", {"product_id": lamp["id"], "quantity": lamp["stock"]})]),
            ModelTurn(text="Added."),
        )
    )

    res = chat(client, "add them all", cart=[line(lamp, 1)])

    [action] = res.json["actions"]
    assert action["quantity"] == lamp["stock"] - 1  # one is already in the cart


def test_add_to_cart_is_refused_when_the_cart_already_holds_all_the_stock(client, use_llm):
    lamp = client.get("/api/products/smart-desk-lamp").json
    llm = use_llm(
        FakeLLM(ModelTurn(calls=[ToolCall("add_to_cart", {"product_id": lamp["id"]})]), ModelTurn(text="No more."))
    )
    res = chat(client, "one more", cart=[line(lamp, min(lamp["stock"], 20))])
    assert res.json["actions"] == []
    assert "already has" in last_tool_output(llm.log)["error"]


def test_a_later_tool_sees_what_an_earlier_one_changed(client, use_llm):
    lamp = client.get("/api/products/smart-desk-lamp").json
    llm = use_llm(
        FakeLLM(
            ModelTurn(calls=[ToolCall("add_to_cart", {"product_id": lamp["id"]}), ToolCall("get_cart", {})]),
            ModelTurn(text="Done."),
        )
    )
    chat(client, "add a lamp and show my cart")
    cart_output = llm.log[-1][1][1][1]
    assert [(i["productId"], i["quantity"]) for i in cart_output["items"]] == [(lamp["id"], 1)]


def test_remove_from_cart_returns_the_new_total(client, use_llm):
    pen = client.get("/api/products/fountain-pen").json
    use_llm(
        FakeLLM(
            ModelTurn(calls=[ToolCall("remove_from_cart", {"product_id": pen["id"], "quantity": 1})]),
            ModelTurn(text="Removed one."),
        )
    )
    res = chat(client, "take one pen out", cart=[line(pen, 3)])
    assert res.json["actions"] == [
        {"type": "set_cart_quantity", "productId": pen["id"], "name": pen["name"], "quantity": 2}
    ]


def test_remove_from_cart_without_a_quantity_removes_the_line(client, use_llm):
    pen = client.get("/api/products/fountain-pen").json
    use_llm(FakeLLM(ModelTurn(calls=[ToolCall("remove_from_cart", {"product_id": pen["id"]})]), ModelTurn(text="Gone.")))
    res = chat(client, "remove the pen", cart=[line(pen, 3)])
    assert res.json["actions"][0]["quantity"] == 0


def test_remove_from_cart_rejects_a_product_that_is_not_in_the_cart(client, use_llm):
    pen = client.get("/api/products/fountain-pen").json
    llm = use_llm(FakeLLM(ModelTurn(calls=[ToolCall("remove_from_cart", {"product_id": pen["id"]})]), ModelTurn(text="?")))
    res = chat(client, "remove the pen")
    assert res.json["actions"] == []
    assert "isn't in the cart" in last_tool_output(llm.log)["error"]


def test_search_can_filter_by_min_price_and_stock(client, use_llm, admin):
    cheap = client.get("/api/products?sort=price_asc&pageSize=1").json["items"][0]
    client.patch(f"/api/admin/products/{cheap['id']}", headers=admin, json={"stock": 0})
    llm = use_llm(
        FakeLLM(
            ModelTurn(calls=[ToolCall("search_products", {"in_stock_only": True, "sort": "price_asc"})]),
            ModelTurn(text="ok"),
        )
    )
    chat(client, "cheapest in stock")
    names = [p["name"] for p in last_tool_output(llm.log)["products"]]
    assert cheap["name"] not in names

    llm = use_llm(
        FakeLLM(ModelTurn(calls=[ToolCall("search_products", {"min_price_dollars": 60})]), ModelTurn(text="ok"))
    )
    chat(client, "premium")
    prices = [float(p["price"].strip("$").replace(",", "")) for p in last_tool_output(llm.log)["products"]]
    assert prices and min(prices) >= 60


def test_bad_arguments_get_a_specific_message(client, use_llm):
    llm = use_llm(
        FakeLLM(ModelTurn(calls=[ToolCall("add_to_cart", {"product_id": "lamp"})]), ModelTurn(text="Sorry."))
    )
    chat(client, "add a lamp")
    assert last_tool_output(llm.log)["error"] == "product_id must be a whole number."


def test_cart_is_validated(client, use_llm):
    use_llm(FakeLLM(ModelTurn(text="hi")))
    assert chat(client, "hi", cart=[{"productId": 1, "quantity": 999}]).status_code == 422
    assert chat(client, "hi", cart=[{"productId": 0, "quantity": 1}]).status_code == 422
