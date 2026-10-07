"""OpenAIChat's conversion to and from Chat Completions messages, with the network call faked."""

import json
from types import SimpleNamespace

from app.assistant.llm import Message, OpenAIChat, ToolResult
from app.assistant.tools import TOOL_SPECS


def completion(content=None, tool_calls=None, refusal=None):
    message = SimpleNamespace(content=content, tool_calls=tool_calls, refusal=refusal)
    return SimpleNamespace(choices=[SimpleNamespace(message=message)])


def call(id, name, arguments):
    return SimpleNamespace(id=id, function=SimpleNamespace(name=name, arguments=arguments))


class FakeCompletions:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests = []

    def create(self, model, messages, tools):
        self.requests.append({"model": model, "messages": [dict(m) for m in messages], "tools": tools})
        return self.responses.pop(0)


def chat_with(*responses, history=()):
    completions = FakeCompletions(*responses)
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    return OpenAIChat(client, "test-model", "be helpful", TOOL_SPECS, list(history)), completions


def test_tool_call_round_trip():
    chat, completions = chat_with(
        completion(tool_calls=[call("c1", "search_products", '{"query": "mug"}')]),
        completion(content="Here you go."),
        history=[Message("user", "hi"), Message("assistant", "hello")],
    )

    turn = chat.send_message("find a mug")
    assert turn.text == ""
    assert [(c.id, c.name, c.args) for c in turn.calls] == [("c1", "search_products", {"query": "mug"})]

    turn = chat.send_tool_results([ToolResult(call=turn.calls[0], output={"products": []})])
    assert turn.text == "Here you go." and turn.calls == []

    sent = completions.requests[1]["messages"]
    assert [m["role"] for m in sent] == ["system", "user", "assistant", "user", "assistant", "tool"]
    assert sent[0]["content"] == "be helpful"
    # The assistant's tool call is kept, and the result answers it by id.
    assert sent[4]["tool_calls"][0]["id"] == "c1"
    assert sent[4]["tool_calls"][0]["function"] == {"name": "search_products", "arguments": '{"query": "mug"}'}
    assert sent[5]["tool_call_id"] == "c1"
    assert json.loads(sent[5]["content"]) == {"products": []}


def test_parallel_calls_each_get_a_result_message_in_order():
    chat, completions = chat_with(
        completion(tool_calls=[call("a", "get_cart", "{}"), call("b", "list_categories", "{}")]),
        completion(content="done"),
    )
    turn = chat.send_message("hi")
    chat.send_tool_results([ToolResult(c, {"n": i}) for i, c in enumerate(turn.calls)])

    tool_messages = [m for m in completions.requests[1]["messages"] if m["role"] == "tool"]
    assert [m["tool_call_id"] for m in tool_messages] == ["a", "b"]


def test_unusable_arguments_become_empty_args():
    chat, _ = chat_with(
        completion(tool_calls=[call("a", "get_product", "not json"), call("b", "get_product", "[1]"), call("c", "get_cart", None)])
    )
    assert [c.args for c in chat.send_message("hi").calls] == [{}, {}, {}]


def test_refusal_is_shown_when_there_is_no_content():
    chat, _ = chat_with(completion(refusal="I can't help with that."))
    assert chat.send_message("hi").text == "I can't help with that."


def test_empty_response_is_an_empty_turn():
    chat, _ = chat_with(SimpleNamespace(choices=[]))
    turn = chat.send_message("hi")
    assert turn.text == "" and turn.calls == []


def test_tools_are_declared_as_functions_from_the_specs():
    chat, completions = chat_with(completion(content="hi"))
    chat.send_message("hello")
    declared = completions.requests[0]["tools"]
    assert [t["function"]["name"] for t in declared] == [t["name"] for t in TOOL_SPECS]
    assert all(t["type"] == "function" for t in declared)
    assert declared[0]["function"]["parameters"] == TOOL_SPECS[0]["parameters"]
    assert completions.requests[0]["model"] == "test-model"
