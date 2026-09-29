class ApiError(Exception):
    """An error with a message that is safe to show to the client.

    `extra` is merged into the JSON body, e.g. per-item problems at checkout.
    """

    def __init__(self, status: int, message: str, extra: dict | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.extra = extra or {}
