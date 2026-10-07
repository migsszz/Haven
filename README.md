# Haven

A full-stack online store: browse and search a catalog, keep a cart, check out, and track orders, with an admin area for managing products and fulfilling orders. Built with **Angular**, **Flask**, and **PostgreSQL**, packaged with **Docker**, and deployed to **AWS** through **GitHub Actions**.

Payments are simulated. It's a demo store, so no card details are collected.

## Features

**Shoppers**
- Catalog with search, category filters, sorting, and pagination. Filters live in the URL, so results can be shared and survive a refresh.
- Product pages with live stock ("Only 3 left", "Sold out").
- Cart that persists across visits and never lets a line exceed available stock.
- Checkout that re-checks stock and prices on the server. If something sold out in the meantime, the cart is corrected and the shopper is told exactly what changed.
- Order history, with self-service cancellation until an order ships.

**Shopping assistant (AI agent)**
- A chat panel ("Ask Haven") that finds products from a plain-language request, compares them, reads and edits the cart, and checks on or offers to cancel the shopper's orders.
- Built on OpenAI (`gpt-6-luna` by default) with tool calling. Optional: without `OPENAI_API_KEY` the panel stays hidden.

**Admins**
- Create, edit, reprice, restock, and hide products, with photo upload (JPEG, PNG, or WebP up to 5 MB).
- Move orders through `placed → shipped → delivered`, or cancel them (which puts the stock back).

## Architecture

```mermaid
flowchart LR
    B[Browser<br/>Angular SPA] -->|HTTPS| N[nginx<br/>web container]
    N -->|/api/*| F[Flask + gunicorn<br/>api container]
    F --> P[(PostgreSQL<br/>db container)]
    GH[GitHub Actions] -->|push images| ECR[Amazon ECR]
    GH -->|ssh: pull + restart| EC2[EC2 host running<br/>docker compose]
    ECR --> EC2
```

The browser only talks to one origin: nginx serves the Angular build and forwards `/api/*` to Flask, so there's no CORS configuration and the API isn't exposed directly.

| Layer | Stack |
| --- | --- |
| Frontend | Angular 21 (standalone components, signals, `httpResource`), Tailwind CSS 4, DaisyUI 5, Vitest |
| Backend | Flask 3, psycopg 3 with a connection pool, Pydantic validation, JWT auth, gunicorn, pytest |
| AI | OpenAI (`openai`, Chat Completions) with function calling |
| Database | PostgreSQL 17, plain SQL schema |
| Delivery | Docker, docker compose, GitHub Actions, Amazon ECR, EC2 |

## Design decisions

- **Checkout is one transaction.** The order, its line items, and the stock decrements are written together, or not at all. Product rows are locked with `SELECT … FOR UPDATE` in id order, so two shoppers can't both buy the last unit and concurrent checkouts can't deadlock.
- **The server owns prices.** The client sends only product ids and quantities. Totals are computed from the database, so a tampered cart can't change what's charged.
- **Order lines snapshot name and price.** Renaming or repricing a product later doesn't rewrite order history.
- **Integer cents everywhere.** No floating-point money.
- **Constraints in the database, not just the code.** `CHECK (stock >= 0)`, `CHECK (quantity > 0)`, and an enum for order status back up the application checks.
- **Order status is a small state machine.** Allowed transitions are listed in one place (`TRANSITIONS` in [api/app/orders.py](api/app/orders.py)), and invalid moves return `409`.
- **Photos are re-encoded, not stored as sent.** An upload is decoded, rotated upright, shrunk to 1600 px, and saved as WebP under a random name ([api/app/uploads.py](api/app/uploads.py)). That means the type is what the bytes really are (no SVG or script renamed to `.png`), camera metadata such as GPS is dropped, and a new photo gets a new URL, so the old ones can be cached forever. Files live on a Docker volume that nginx serves directly. Only admins can upload, and deleting only ever touches files the app created.
- **Safe dynamic SQL.** Sort keys are whitelisted, and every value is a bound parameter.

### The assistant

[api/app/assistant/](api/app/assistant/) runs a tool-calling loop: send the shopper's message to the model, run whatever tools it asks for, send back the results, and repeat until it answers (at most 6 rounds). Model calls time out after 60 seconds, and gunicorn and nginx allow 120 for the whole request.

- **Tools run as the shopper.** Each tool reuses the same queries as the regular endpoints, with the caller's identity from their JWT, so the assistant can't see another customer's orders or anything a guest couldn't. Guests can search. Order tools ask them to sign in.
- **The model never changes anything by itself.** "Add to cart" comes back to the browser as an action, since the cart lives there. Cancelling only proposes: the shopper gets a confirm button that calls the normal cancel endpoint.
- **The cart is sent with each message.** It lives in the browser, so the browser includes it and the `get_cart` tool prices it from the database and flags lines that checkout would reject (sold out, or more than is in stock). `add_to_cart` counts what's already in the cart against stock, and cart edits go back to the browser as the new quantity, so applying one twice is harmless.
- **Product text is treated as data.** Admins can edit descriptions, so the system prompt says tool results never contain instructions. Tools return only the fields the model needs.
- **Failures stay contained.** A tool that errors returns the error to the model rather than failing the request. A model outage is a clean `502`. Requests are rate-limited per user or IP.
- **Provider-agnostic loop.** The loop only knows `ModelTurn` and `ToolCall` ([llm.py](api/app/assistant/llm.py)). OpenAI sits behind a small adapter, and the tests drive the loop with a scripted fake model, so they run offline.

## Project layout

```
api/                Flask API
  app/              auth, products, orders, db pool, error handling
  db/               01_schema.sql, 02_seed.sql (run by the Postgres container on first start)
  tests/            pytest suite against a real Postgres
web/                Angular app
  src/app/core/     services (auth, cart, api), interceptor, guards, models
  src/app/pages/    catalog, product, cart, checkout, orders, auth, admin
  nginx.conf        static hosting + /api proxy
docker-compose.yml  db + api + web
.github/workflows/  CI (tests, build) and CD (ECR + EC2)
```

## Running locally

### With Docker

```bash
cp .env.example .env        # then set JWT_SECRET (instructions inside)
docker compose up --build
docker compose exec api flask --app wsgi create-admin you@example.com a-strong-password
```

Open http://localhost:8080.

### Without Docker (for development)

You need Python 3.10+, Node 22.12+, and a Postgres with the schema loaded. The easiest way is `docker compose up db`.

```bash
# API, on http://localhost:5000
cd api
pip install -r requirements-dev.txt
export DATABASE_URL=postgresql://haven:haven@localhost:5432/haven
export JWT_SECRET=$(python -c "import secrets; print(secrets.token_urlsafe(48))")
flask --app wsgi create-admin you@example.com a-strong-password
flask --app wsgi run --port 5000

# Web, on http://localhost:4200 (proxies /api to :5000)
cd web
npm install
npm start
```

## Tests

```bash
cd api && pytest          # uses TEST_DATABASE_URL, or starts a throwaway Postgres if `pgserver` is installed
cd web && npx ng test --watch=false
```

The API tests cover the checkout transaction (server-side pricing, merged duplicate lines, all-or-nothing rollback on insufficient stock), cancellation restocking, order status transitions, access control between shoppers and admins, and admin product management.

> [!WARNING]
> The test suite drops and recreates the `public` schema of the database it's pointed at. Never point `TEST_DATABASE_URL` at a database you care about.

## Deploying to AWS

CI runs the tests on every push and pull request. On pushes to `main`, once the variables below are set, it also builds both images, pushes them to ECR, and restarts the stack on an EC2 instance.

One-time setup:

1. **ECR:** create two repositories, `haven-api` and `haven-web`.
2. **EC2:** launch a small Amazon Linux instance (t3.small is plenty) and install Docker with the compose plugin. Open port 80 (or `HTTP_PORT`) in its security group. Attach an instance role with `AmazonEC2ContainerRegistryReadOnly`. In `~/haven/.env` on the instance, set `JWT_SECRET`, `POSTGRES_PASSWORD`, `HTTP_PORT=80`, and optionally `OPENAI_API_KEY`.
3. **GitHub → AWS auth:** add GitHub as an OIDC identity provider in IAM, and create a role that GitHub Actions can assume for this repository, with permission to push to the two ECR repositories.
4. **GitHub settings:** add the variable `AWS_REGION`, and the secrets `AWS_DEPLOY_ROLE_ARN`, `EC2_HOST`, `EC2_USER`, and `EC2_SSH_KEY`.
5. Push to `main`. After the first deploy, create an admin with `docker compose exec api flask --app wsgi create-admin …` on the instance.

> [!NOTE]
> Set an AWS billing alert. A single small EC2 instance costs a few dollars a month. Stop it when you're not using it.

Photos are stored on the `uploads` Docker volume, next to the database volume, so back both up (or move to S3) before relying on them.

Possible next steps: RDS instead of the Postgres container, S3 + CloudFront for product images, HTTPS with a load balancer or Caddy, and ECS Fargate instead of a single instance.
