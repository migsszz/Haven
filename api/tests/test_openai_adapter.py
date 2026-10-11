"""OpenAIChat's conversion to and from the Responses API, with the network call faked."""

import json
from types import SimpleNamespace

import httpx2
import openai

from app.assistant.llm import Message, OpenAIChat, ToolResult
from app.assistant.tools import TOOL_SPECS


def text_item(text):
    return SimpleNamespace(type="message", content=[SimpleNamespace(type="output_text", text=text)])


def call_item(call_id, name, arguments):
    return SimpleNamespace(type="function_call", call_id=call_id, name=name, arguments=arguments)


def reasoning_item():
    return SimpleNamespace(type="reasoning", summary=[])


def response(id, *items):
    return SimpleNamespace(id=id, output=list(items))


class FakeResponses:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests = []

    def create(self, **kwargs):
        self.requests.append(kwargs)
        return self.responses.pop(0)


def chat_with(*responses, history=()):
    api = FakeResponses(*responses)
    client = SimpleNamespace(responses=api)
    return OpenAIChat(client, "test-model", "be helpful", TOOL_SPECS, list(history)), api


def test_tool_call_round_trip():
    chat, api = chat_with(
        response("r1", reasoning_item(), call_item("c1", "search_products", '{"query": "mug"}')),
        response("r2", text_item("Here you go.")),
        history=[Message("user", "hi"), Message("assistant", "hello")],
    )

    turn = chat.send_message("find a mug")
    assert turn.text == ""  # the reasoning item is never shown to the shopper
    assert [(c.id, c.name, c.args) for c in turn.calls] == [("c1", "search_products", {"query": "mug"})]

    turn = chat.send_tool_results([ToolResult(call=turn.calls[0], output={"products": []})])
    assert turn.text == "Here you go." and turn.calls == []

    first, second = api.requests
    # First request: the whole conversation, as plain messages.
    assert first["input"] == [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
        {"role": "user", "content": "find a mug"},
    ]
    assert "previous_response_id" not in first
    # Second request: only the tool result, chained to the first response.
    assert second["previous_response_id"] == "r1"
    assert [(i["type"], i["call_id"]) for i in second["input"]] == [("function_call_output", "c1")]
    assert json.loads(second["input"][0]["output"]) == {"products": []}


def test_instructions_and_tools_are_sent_on_every_call():
    chat, api = chat_with(response("r1", call_item("c1", "get_cart", "{}")), response("r2", text_item("ok")))
    turn = chat.send_message("hi")
    chat.send_tool_results([ToolResult(turn.calls[0], {})])

    for request in api.requests:
        assert request["model"] == "test-model"
        assert request["instructions"] == "be helpful"  # not carried over by previous_response_id
        assert [t["name"] for t in request["tools"]] == [t["name"] for t in TOOL_SPECS]


def test_tools_are_declared_as_non_strict_functions():
    chat, api = chat_with(response("r1", text_item("hi")))
    chat.send_message("hello")
    tools = api.requests[0]["tools"]
    # Strict mode would reject our optional arguments.
    assert all(t["type"] == "function" and t["strict"] is False for t in tools)
    assert tools[0]["parameters"] == TOOL_SPECS[0]["parameters"]


def test_parallel_calls_each_get_an_output_in_order():
    chat, api = chat_with(
        response("r1", call_item("a", "get_cart", "{}"), call_item("b", "list_categories", "{}")),
        response("r2", text_item("done")),
    )
    turn = chat.send_message("hi")
    chat.send_tool_results([ToolResult(c, {"n": i}) for i, c in enumerate(turn.calls)])
    assert [i["call_id"] for i in api.requests[1]["input"]] == ["a", "b"]


def test_unusable_arguments_become_empty_args():
    chat, _ = chat_with(
        response("r1", call_item("a", "get_product", "not json"), call_item("b", "get_product", "[1]"), call_item("c", "get_cart", None))
    )
    assert [c.args for c in chat.send_message("hi").calls] == [{}, {}, {}]


def test_text_is_joined_and_refusals_are_shown():
    refusal = SimpleNamespace(type="message", content=[SimpleNamespace(type="refusal", refusal="I can't help with that.")])
    chat, _ = chat_with(response("r1", refusal), response("r2", text_item("Hello "), text_item("there")))
    assert chat.send_message("hi").text == "I can't help with that."
    assert chat.send_message("again").text == "Hello there"


def test_empty_response_is_an_empty_turn():
    chat, _ = chat_with(response("r1"))
    turn = chat.send_message("hi")
    assert turn.text == "" and turn.calls == []


def test_works_against_the_real_sdk():
    """Runs the adapter through the actual openai client with a canned HTTP response, so the request
    it builds and the response types it reads are the SDK's own, not our idea of them."""
    requests = []
    replies = [
        {
            "id": "resp_1",
            "object": "response",
            "created_at": 0,
            "status": "completed",
            "model": "gpt-6-luna",
            "output": [
                {"type": "reasoning", "id": "rs_1", "summary": []},
                {"type": "function_call", "id": "fc_1", "call_id": "call_1", "name": "search_products",
                 "arguments": '{"query": "mug"}', "status": "completed"},
            ],
        },
        {
            "id": "resp_2",
            "object": "response",
            "created_at": 0,
            "status": "completed",
            "model": "gpt-6-luna",
            "output": [
                {"type": "message", "id": "msg_1", "role": "assistant", "status": "completed",
                 "content": [{"type": "output_text", "text": "Try the Travel Mug.", "annotations": []}]},
            ],
        },
    ]

    def handler(request: httpx2.Request) -> httpx2.Response:
        requests.append((request.url.path, json.loads(request.content)))
        return httpx2.Response(200, json=replies.pop(0))

    client = openai.OpenAI(
        api_key="test", base_url="https://api.test/v1", http_client=openai.DefaultHttpxClient(transport=httpx2.MockTransport(handler))
    )
    chat = OpenAIChat(client, "gpt-6-luna", "be helpful", TOOL_SPECS, [])

    turn = chat.send_message("a mug please")
    assert [(c.id, c.name, c.args) for c in turn.calls] == [("call_1", "search_products", {"query": "mug"})]
    turn = chat.send_tool_results([ToolResult(turn.calls[0], {"products": []})])
    assert turn.text == "Try the Travel Mug."

    (path1, body1), (path2, body2) = requests
    assert path1 == path2 == "/v1/responses"
    assert body1["model"] == "gpt-6-luna" and body1["instructions"] == "be helpful"
    assert body1["input"] == [{"role": "user", "content": "a mug please"}]
    assert body1["tools"][0]["strict"] is False
    assert "reasoning_effort" not in body1  # we leave the model's own default alone
    assert "previous_response_id" not in body1
    assert body2["previous_response_id"] == "resp_1"
    assert body2["input"][0]["type"] == "function_call_output"
