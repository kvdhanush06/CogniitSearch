# CogniitSearch — AI Search & Answer Engine

**CogniitSearch** is an AI-powered search and answer platform that combines web retrieval, source crawling, citation-aware synthesis, conversational search, and streamed responses through a distributed backend architecture.

**Live:** https://cogniitsearch.allkvd.dev/

**Repository:** https://github.com/kvdhanush06/CogniitSearch

## Highlights

- Distributed retrieval pipeline coordinating multiple external services
- Queue-backed worker architecture powered by BullMQ and Redis
- Streaming AI responses using Server-Sent Events (SSE)
- Multi-layer caching with query and content TTL strategies
- Citation-aware answer generation
- Follow-up question generation and conversational search
- Session persistence and multi-turn interactions
- Fault-tolerant background processing with retry handling

## Architecture Overview

CogniitSearch is built as two independently deployable services:

### Frontend

- React 19
- Vite
- Zustand
- Tailwind CSS
- shadcn/ui

### Backend

- Node.js
- TypeScript
- Express.js
- BullMQ
- Redis
- PostgreSQL (Supabase)

The frontend communicates exclusively with the backend. Third-party integrations, authentication flows, retrieval pipelines, caching layers, and LLM orchestration are handled server-side.

## Core Workflow

User Query → Query Processing & Rewriting → Web Search & Retrieval → Content Extraction → Context Assembly → Citation Validation → LLM Response Generation → Streaming Response Delivery → Follow-up Generation

## Key Engineering Features

### Distributed Worker Architecture

Background jobs are orchestrated through BullMQ workers backed by Redis for search processing, content extraction, context preparation, follow-up generation, and cache refresh operations.

### Caching Strategy

Multi-layer Redis caching reduces redundant retrieval workloads.

- Query Cache: 1 hour TTL
- Content Cache: 24 hour TTL

### Streaming Responses

Responses are streamed incrementally using Server-Sent Events (SSE), allowing users to receive generated content as it becomes available.

### Citation-Aware Generation

Generated answers include source attribution and citation validation to improve transparency and traceability.

## Tech Stack

### Backend

- TypeScript
- Node.js
- Express.js
- Redis
- BullMQ
- PostgreSQL
- Supabase
- Groq

### Frontend

- React
- Vite
- Zustand
- Tailwind CSS
- shadcn/ui

### Infrastructure

- Docker
- Nginx
- Redis
- Linode

## Repository Structure

```text
cogniit-search/
├── backend/
├── frontend/
├── README.md
└── .env.example
```

## Local Development

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Deployment

The application uses independent frontend/backend Docker images, Redis-backed workers, a host-level Nginx reverse proxy, TLS via Let's Encrypt, and a Linode deployment.

---

## Product & Creator

CogniitSearch is a software product published by **Venkata Dhanush Kakarlamudi** under the AllKVD project portfolio.

- **Product:** https://cogniitsearch.allkvd.dev/
- **Creator:** https://allkvd.dev/
- **Portfolio:** https://portfolio.allkvd.dev/
- **GitHub:** https://github.com/kvdhanush06
- **Resume:** https://drive.google.com/file/d/1NCT6ZCa_HfxCdScqI-1Q2yA6y2c7O-qA/view
