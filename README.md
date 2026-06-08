# CogniitSearch

An AI-powered answer engine that delivers comprehensive, cited answers to complex questions — inspired by Perplexity. CogniitSearch searches the web, crawls relevant sources, and synthesizes information using large language models to provide accurate, real-time answers with source attribution.

> **Project layout:** Two independently deployable services — a TypeScript/Express backend and a React/Vite frontend — each shipped as its own Docker image. A host-level nginx on the Linode box terminates TLS and reverse-proxies to both. The frontend never talks to any external service directly; **all third-party calls (Supabase, Groq, Tinyfish, Google) flow through the backend**.

---

## Tech Stack

### Backend (`backend/`)

- **Runtime:** Node.js 20 (TypeScript, ESM, `NodeNext`)
- **HTTP:** Express 4 + Helmet + CORS + Pino
- **Validation:** Zod (request schemas in `controllers/validators/`)
- **Queue:** BullMQ (Redis 7 broker)
- **DB / Auth:** Supabase (Postgres + Auth via service-role key on backend only)
- **LLM:** Groq (OpenAI-compatible Chat Completions + streaming)
- **Search / Crawl:** Tinyfish
- **Real-time:** SSE (Server-Sent Events); Socket.IO available for future use
- **Auth flow:** Backend-mediated Google OAuth via Supabase → httpOnly session cookie

### Frontend (`frontend/`)

- **Framework:** React 19 + React Router 7
- **Build:** Vite 6
- **State:** Zustand
- **UI:** Tailwind CSS 3 + shadcn/ui primitives (Radix UI under the hood)
- **HTTP:** Axios for JSON, raw `fetch` + ReadableStream for SSE
- **Icons:** Inline SVGs (`src/components/icons/`)

### Infrastructure

- **Containerization:** Two Dockerfiles (one per service), no docker-compose at the root
- **Reverse proxy:** Host-level nginx on the Linode box (TLS via Let's Encrypt)
- **Cache / Queue:** Redis 7 (BullMQ broker; the host runs a local Redis container)
- **Hosting:** Single Linode instance, name.com domain → Linode IP

---

## Architecture

```
                       ┌──────────────────────────┐
   Browser (React) ───►│  Host nginx (TLS, :80/443)│
   SSE stream ◄──────┤                            │
                       └──────┬─────────────┬────┘
                              │             │
                  /api/*      │             │   /*
                              ▼             ▼
                  ┌──────────────────┐  ┌──────────────────┐
                  │  backend :4000   │  │ frontend :8080   │
                  │  Express + SSE   │  │ nginx serving    │
                  │  + BullMQ workers│  │  static dist/    │
                  └────────┬─────────┘  └──────────────────┘
                           │
        ┌────────┬─────────┼──────────┬──────────────┐
        ▼        ▼         ▼          ▼              ▼
   Supabase  Groq LLM   Tinyfish   Redis 7      Google OAuth
   (DB+auth) (stream) (search/    (BullMQ)      (via Supabase
                       crawl)                   redirect)
```

**Key invariants**

- The frontend only ever talks to the backend over `/api/*` and `/socket.io`.
- The backend owns **all** secrets: `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `TINYFISH_API_KEY`, Google OAuth client secret, session cookie signing key.
- The frontend sees only public values: the backend's base URL and the public anon key (the latter is currently unused).
- Sessions are httpOnly, `SameSite=Lax` cookies issued by the backend after a Supabase OAuth callback exchange.

---

## Repository layout

```
cogniit-search/
├── README.md             # This file
├── .gitignore
├── .env.example          # Cross-project template (backend vars)
│
├── backend/              # Node 20 / Express / TypeScript API
│   ├── src/              #   controllers, services, workers, integrations
│   ├── Dockerfile        #   node:20-alpine, two processes (api + workers)
│   ├── .env.example
│   └── package.json
│
└── frontend/             # React 19 / Vite / shadcn
    ├── src/              #   pages, components, hooks, store, api
    ├── Dockerfile        #   multi-stage: node:20 build → nginx:alpine serve
    ├── .env.example
    └── package.json
```

The two services are deployed independently — there is **no `docker-compose.yml` at the root**. To run the full stack on the Linode box, see [Deployment](#deployment).

---

## Local development (no Docker)

```bash
# 1. Backend
cd backend
cp .env.example .env       # fill in API keys (see backend/.env.example for hints)
npm install
npm run dev                # http://localhost:4000

# 2. Frontend (in another terminal)
cd frontend
cp .env.example .env       # set VITE_API_URL=http://localhost:4000
npm install
npm run dev                # http://localhost:5173
```

The Vite dev server proxies `/api` to `http://localhost:4000`. Run a local Redis (e.g. `docker run -p 6379:6379 redis:7-alpine`) for BullMQ — the API works synchronously without it, but workers need it.

---

## Deployment

This project deploys to a single Linode instance via two independent Docker images, fronted by a host-level nginx that handles TLS.

```bash
# On the Linode box
git clone <repo> /opt/cogniit && cd /opt/cogniit
cp backend/.env.example backend/.env  &&  $EDITOR backend/.env
cp frontend/.env.example frontend/.env &&  $EDITOR frontend/.env

docker build -t cogniit-backend  ./backend
docker build -t cogniit-frontend ./frontend
docker run -d --name cogniit-redis   -p 127.0.0.1:6379:6379 redis:7-alpine
docker run -d --name cogniit-backend --restart=unless-stopped \
   --env-file=backend/.env --link cogniit-redis:redis -p 127.0.0.1:4000:4000 cogniit-backend
docker run -d --name cogniit-frontend --restart=unless-stopped -p 127.0.0.1:8080:80 cogniit-frontend
# Host nginx terminates TLS and reverse-proxies to 4000/8080.
```
