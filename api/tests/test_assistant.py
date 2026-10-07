"""The agent loop and tools, driven by a scripted fake model instead of Gemini."""

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


def chat(client, message, headers=None, history=None):
    return client.post("/api/assistant/chat", headers=headers or {}, json={"message": message, "history": history or []})


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
