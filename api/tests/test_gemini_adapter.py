"""GeminiChat's conversion to and from google-genai types, with the network call faked."""

from types import SimpleNamespace

from google.genai import types

from app.assistant.llm import GeminiChat, Message, ToolResult
from app.assistant.tools import TOOL_SPECS


def response(*parts):
    return types.GenerateContentResponse(candidates=[types.Candidate(content=types.Content(role="model", parts=list(parts)))])


class FakeModels:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests = []

    def generate_content(self, model, contents, config):
        self.requests.append(list(contents))
        return self.responses.pop(0)


def test_tool_call_round_trip():
    models = FakeModels(
        response(
            types.Part(text="thinking...", thought=True),
            types.Part(function_call=types.FunctionCall(id="c1", name="search_products", args={"query": "mug"})),
        ),
        response(types.Part.from_text(text="Here you go.")),
    )
    chat = GeminiChat(SimpleNamespace(models=models), "test-model", "system", TOOL_SPECS, [Message("user", "hi")])

    turn = chat.send_message("find a mug")
    assert turn.text == ""  # thoughts are never shown to the shopper
    assert [(c.id, c.name, c.args) for c in turn.calls] == [("c1", "search_products", {"query": "mug"})]

    turn = chat.send_tool_results([ToolResult(call=turn.calls[0], output={"products": []})])
    assert turn.text == "Here you go."

    # Second request: history, the user message, the model's call (kept verbatim), then our result.
    sent = models.requests[1]
    assert [c.role for c in sent] == ["user", "user", "model", "user"]
    assert sent[2].parts[1].function_call.id == "c1"
    reply = sent[3].parts[0].function_response
    assert (reply.id, reply.name, reply.response) == ("c1", "search_products", {"result": {"products": []}})


def test_tool_declarations_are_built_from_the_specs():
    chat = GeminiChat(SimpleNamespace(models=FakeModels()), "m", "system", TOOL_SPECS, [])
    declared = chat.config.tools[0].function_declarations
    assert [d.name for d in declared] == [t["name"] for t in TOOL_SPECS]
    assert chat.config.automatic_function_calling.disable is True
