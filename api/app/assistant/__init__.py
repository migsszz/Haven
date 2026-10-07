import logging
import threading
import time
from collections import defaultdict, deque

from flask import Blueprint, current_app, g, request
from pydantic import BaseModel, Field

from ..auth import optional_auth
from ..errors import ApiError
from .agent import run_agent
from .llm import LLM, Message

log = logging.getLogger(__name__)

bp = Blueprint("assistant", __name__)

RATE_LIMIT = 20  # messages
RATE_WINDOW_SECONDS = 600


class HistoryItem(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    text: str = Field(max_length=4000)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    history: list[HistoryItem] = Field(default_factory=list, max_length=20)


class RateLimiter:
    """Sliding window per user or IP. In memory, so it's per API process: fine for a
    single small server, and a shared store like Redis would replace it at scale."""

    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window = window_seconds
        self.hits: dict[str, deque] = defaultdict(deque)
        self.lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self.lock:
            hits = self.hits[key]
            while hits and now - hits[0] > self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            return True


def init_app(app) -> None:
    app.extensions["assistant_limiter"] = RateLimiter(RATE_LIMIT, RATE_WINDOW_SECONDS)
    api_key = app.config.get("GEMINI_API_KEY")
    if api_key and "assistant_llm" not in app.extensions:
        from .llm import GeminiLLM

        app.extensions["assistant_llm"] = GeminiLLM(api_key, app.config["GEMINI_MODEL"])


def _llm() -> LLM | None:
    return current_app.extensions.get("assistant_llm")


@bp.get("/status")
def status():
    return {"enabled": _llm() is not None}


@bp.post("/chat")
@optional_auth
def chat():
    llm = _llm()
    if llm is None:
        raise ApiError(503, "The assistant isn't set up on this server.")

    body = ChatIn.model_validate(request.get_json(silent=True) or {})
    key = f"user:{g.user_id}" if g.user_id else f"ip:{request.remote_addr}"
    if not current_app.extensions["assistant_limiter"].allow(key):
        raise ApiError(429, "You're sending messages quickly. Please wait a few minutes and try again.")

    history = [Message(role=h.role, text=h.text) for h in body.history]
    try:
        result = run_agent(llm, history, body.message.strip(), g.user_id)
    except Exception:
        log.exception("Assistant request failed")
        raise ApiError(502, "The assistant is unavailable right now. Please try again in a moment.")

    return {"reply": result.reply, "products": result.products, "actions": result.actions}
