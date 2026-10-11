"""The model behind the assistant, reduced to the two calls the agent loop needs.

The loop in agent.py only sees ModelTurn/ToolCall, so the provider can be swapped
(or faked in tests) without touching it.
"""

import json
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class ToolCall:
    name: str
    args: dict[str, Any]
    id: str | None = None


@dataclass
class ToolResult:
    call: ToolCall
    output: dict[str, Any]


@dataclass
class ModelTurn:
    text: str = ""
    calls: list[ToolCall] = field(default_factory=list)


@dataclass
class Message:
    role: str  # "user" or "assistant"
    text: str


class ChatSession(Protocol):
    def send_message(self, text: str) -> ModelTurn: ...

    def send_tool_results(self, results: list[ToolResult]) -> ModelTurn: ...


class LLM(Protocol):
    def start_chat(self, system: str, tools: list[dict], history: list[Message]) -> ChatSession: ...


class OpenAILLM:
    def __init__(self, api_key: str, model: str):
        from openai import OpenAI

        # A turn can make several calls, so a stuck one must fail rather than hold a worker.
        self.client = OpenAI(api_key=api_key, timeout=60.0, max_retries=2)
        self.model = model

    def start_chat(self, system: str, tools: list[dict], history: list[Message]) -> ChatSession:
        return OpenAIChat(self.client, self.model, system, tools, history)


class OpenAIChat:
    """One conversation over the Responses API. The tools are run by us, never by the SDK.

    Chat Completions can't be used here: reasoning models reject function tools on it unless
    reasoning is switched off. The Responses API allows both. The reasoning the model does between
    tool calls stays on OpenAI's side and is picked back up through previous_response_id, so we
    only ever send the new tool results.
    """

    def __init__(self, client, model: str, system: str, tools: list[dict], history: list[Message]):
        self.client = client
        self.model = model
        self.system = system
        self.tools = [
            # strict=False because our schemas have optional arguments, which strict mode doesn't allow.
            {"type": "function", "name": t["name"], "description": t["description"], "parameters": t["parameters"], "strict": False}
            for t in tools
        ]
        self.history: list[dict[str, Any]] = [{"role": m.role, "content": m.text} for m in history]
        self.previous_response_id: str | None = None

    def send_message(self, text: str) -> ModelTurn:
        return self._generate(self.history + [{"role": "user", "content": text}])

    def send_tool_results(self, results: list[ToolResult]) -> ModelTurn:
        # One output per call, matched by call_id. The calls themselves are already on OpenAI's side.
        return self._generate(
            [{"type": "function_call_output", "call_id": r.call.id, "output": json.dumps(r.output)} for r in results]
        )

    def _generate(self, items: list[dict[str, Any]]) -> ModelTurn:
        params: dict[str, Any] = {
            "model": self.model,
            # instructions and tools are not carried over by previous_response_id, so they go on every call.
            "instructions": self.system,
            "input": items,
            "tools": self.tools,
        }
        if self.previous_response_id:
            params["previous_response_id"] = self.previous_response_id
        response = self.client.responses.create(**params)
        self.previous_response_id = response.id

        calls, text = [], []
        for item in response.output or []:
            if item.type == "function_call":
                calls.append(ToolCall(name=item.name, args=_parse_args(item.arguments), id=item.call_id))
            elif item.type == "message":
                for part in item.content:
                    if part.type == "output_text":
                        text.append(part.text)
                    elif part.type == "refusal":
                        text.append(part.refusal)
        return ModelTurn(text="".join(text).strip(), calls=calls)


def _parse_args(raw: str | None) -> dict[str, Any]:
    """Tool arguments arrive as a JSON string. Anything unusable becomes {}, which the tool reports as missing input."""
    try:
        args = json.loads(raw or "{}")
    except json.JSONDecodeError:
        return {}
    return args if isinstance(args, dict) else {}
