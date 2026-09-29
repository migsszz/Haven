-- Haven schema. Runs automatically on first start of the Postgres container
-- (mounted into /docker-entrypoint-initdb.d), and is applied by the test suite.

CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    is_admin      BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
    id   SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
);

CREATE TABLE products (
    id          SERIAL PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category_id INT NOT NULL REFERENCES categories (id),
    price_cents INT NOT NULL CHECK (price_cents >= 0),
    stock       INT NOT NULL CHECK (stock >= 0),
    image_url   TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX products_category_idx ON products (category_id) WHERE is_active;

CREATE TYPE order_status AS ENUM ('placed', 'shipped', 'delivered', 'cancelled');

CREATE TABLE orders (
    id               SERIAL PRIMARY KEY,
    user_id          INT NOT NULL REFERENCES users (id),
    status           order_status NOT NULL DEFAULT 'placed',
    total_cents      INT NOT NULL CHECK (total_cents >= 0),
    shipping_name    TEXT NOT NULL,
    shipping_address TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX orders_user_idx ON orders (user_id, created_at DESC);

-- Name and price are copied onto each line so past orders stay accurate
-- after a product is renamed or repriced.
CREATE TABLE order_items (
    id               SERIAL PRIMARY KEY,
    order_id         INT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    product_id       INT NOT NULL REFERENCES products (id),
    product_name     TEXT NOT NULL,
    unit_price_cents INT NOT NULL CHECK (unit_price_cents >= 0),
    quantity         INT NOT NULL CHECK (quantity > 0)
);

CREATE INDEX order_items_order_idx ON order_items (order_id);
