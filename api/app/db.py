from contextlib import contextmanager
from typing import Iterator

from flask import Flask, current_app
from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


def init_app(app: Flask) -> None:
    app.extensions["db_pool"] = ConnectionPool(
        app.config["DATABASE_URL"],
        min_size=1,
        max_size=10,
        kwargs={"row_factory": dict_row},
        open=True,
    )


@contextmanager
def connection() -> Iterator[Connection]:
    """A pooled connection that commits when the block exits cleanly and rolls back on error."""
    pool: ConnectionPool = current_app.extensions["db_pool"]
    with pool.connection() as conn:
        yield conn
