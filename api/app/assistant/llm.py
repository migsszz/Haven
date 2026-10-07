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
    """One conversation over the Chat Completions API. The tools are run by us, never by the SDK."""

    def __init__(self, client, model: str, system: str, tools: list[dict], history: list[Message]):
        self.client = client
        self.model = model
        self.tools = [
            {
                "type": "function",
                "function": {"name": t["name"], "description": t["description"], "parameters": t["parameters"]},
            }
            for t in tools
        ]
        self.messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
        self.messages += [{"role": m.role, "content": m.text} for m in history]

    def send_message(self, text: str) -> ModelTurn:
        self.messages.append({"role": "user", "content": text})
        return self._generate()

    def send_tool_results(self, results: list[ToolResult]) -> ModelTurn:
        # One "tool" message per call, in the order the model asked for them.
        for r in results:
            self.messages.append({"role": "tool", "tool_call_id": r.call.id, "content": json.dumps(r.output)})
        return self._generate()

    def _generate(self) -> ModelTurn:
        response = self.client.chat.completions.create(model=self.model, messages=self.messages, tools=self.tools)
        if not response.choices:
            return ModelTurn()
        message = response.choices[0].message
        tool_calls = message.tool_calls or []

        # Keep the model's turn in the history; a tool result must follow the call it answers.
        entry: dict[str, Any] = {"role": "assistant", "content": message.content}
        if tool_calls:
            entry["tool_calls"] = [
                {"id": c.id, "type": "function", "function": {"name": c.function.name, "arguments": c.function.arguments}}
                for c in tool_calls
            ]
        self.messages.append(entry)

        calls = [ToolCall(name=c.function.name, args=_parse_args(c.function.arguments), id=c.id) for c in tool_calls]
        text = message.content or getattr(message, "refusal", None) or ""
        return ModelTurn(text=text.strip(), calls=calls)


def _parse_args(raw: str | None) -> dict[str, Any]:
    """Tool arguments arrive as a JSON string. Anything unusable becomes {}, which the tool reports as missing input."""
    try:
        args = json.loads(raw or "{}")
    except json.JSONDecodeError:
        return {}
    return args if isinstance(args, dict) else {}
