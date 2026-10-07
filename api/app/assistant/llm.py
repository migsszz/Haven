"""The model behind the assistant, reduced to the two calls the agent loop needs.

The loop in agent.py only sees ModelTurn/ToolCall, so the provider can be swapped
(or faked in tests) without touching it.
"""

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


class GeminiLLM:
    def __init__(self, api_key: str, model: str):
        from google import genai

        self.client = genai.Client(api_key=api_key)
        self.model = model

    def start_chat(self, system: str, tools: list[dict], history: list[Message]) -> ChatSession:
        return GeminiChat(self.client, self.model, system, tools, history)


class GeminiChat:
    def __init__(self, client, model: str, system: str, tools: list[dict], history: list[Message]):
        from google.genai import types

        self.types = types
        self.client = client
        self.model = model
        self.config = types.GenerateContentConfig(
            system_instruction=system,
            tools=[
                types.Tool(
                    function_declarations=[
                        types.FunctionDeclaration(
                            name=t["name"],
                            description=t["description"],
                            parameters_json_schema=t["parameters"],
                        )
                        for t in tools
                    ]
                )
            ],
            # We run the tools ourselves, so each one goes through our own permission checks.
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            temperature=0.3,
        )
        self.contents = [
            types.Content(
                role="user" if m.role == "user" else "model",
                parts=[types.Part.from_text(text=m.text)],
            )
            for m in history
        ]

    def send_message(self, text: str) -> ModelTurn:
        self.contents.append(self.types.Content(role="user", parts=[self.types.Part.from_text(text=text)]))
        return self._generate()

    def send_tool_results(self, results: list[ToolResult]) -> ModelTurn:
        parts = [
            self.types.Part(
                function_response=self.types.FunctionResponse(
                    id=r.call.id, name=r.call.name, response={"result": r.output}
                )
            )
            for r in results
        ]
        self.contents.append(self.types.Content(role="user", parts=parts))
        return self._generate()

    def _generate(self) -> ModelTurn:
        response = self.client.models.generate_content(model=self.model, contents=self.contents, config=self.config)
        content = response.candidates[0].content if response.candidates else None
        if content is None or not content.parts:
            return ModelTurn()
        # Keep the model's turn exactly as returned: it can carry thought signatures
        # that Gemini expects back on the next call.
        self.contents.append(content)
        calls = [
            ToolCall(name=p.function_call.name, args=dict(p.function_call.args or {}), id=p.function_call.id)
            for p in content.parts
            if p.function_call
        ]
        text = "".join(p.text for p in content.parts if p.text and not p.thought)
        return ModelTurn(text=text.strip(), calls=calls)
