# CogniitSearch

AI-powered search platform that delivers cited answers, conversational search, and multi-source information retrieval through a distributed retrieval and streaming architecture.

**Live:** https://cogniitsearch.allkvd.dev/

## Highlights

* Distributed retrieval pipeline coordinating 5 external services
* Queue-backed worker architecture powered by BullMQ and Redis
* Streaming AI responses using Server-Sent Events (SSE)
* Multi-layer caching with query and content TTL strategies
* Citation-aware answer generation
* Follow-up question generation and conversational search
* Session persistence and multi-turn interactions
* Fault-tolerant background processing with retry handling

## Architecture Overview

CogniitSearch is built as two independently deployable services:

### Frontend

* React 19
* Vite
* Zustand
* Tailwind CSS
* shadcn/ui

### Backend

* Node.js
* TypeScript
* Express.js
* BullMQ
* Redis
* PostgreSQL (Supabase)

The frontend communicates exclusively with the backend.

All third-party integrations, authentication flows, retrieval pipelines, caching layers, and LLM orchestration are handled server-side.

## Core Workflow

User Query

↓

Query Processing & Rewriting

↓

Web Search & Retrieval

↓

Content Extraction

↓

Context Assembly

↓

Citation Validation

↓

LLM Response Generation

↓

Streaming Response Delivery

↓

Follow-up Generation

## Key Engineering Features

### Distributed Worker Architecture

Background jobs are orchestrated through BullMQ workers backed by Redis.

Responsibilities include:

* Search processing
* Content extraction
* Context preparation
* Follow-up generation
* Cache refresh operations

### Caching Strategy

Multi-layer Redis caching reduces redundant retrieval workloads.

* Query Cache: 1 hour TTL
* Content Cache: 24 hour TTL

Benefits:

* Lower latency
* Reduced external API usage
* Faster repeat queries

### Streaming Responses

Responses are streamed incrementally using Server-Sent Events (SSE), allowing users to receive generated content as it becomes available.

### Citation-Aware Generation

Generated answers include source attribution and citation validation to improve transparency and answer reliability.

## Tech Stack

### Backend

* TypeScript
* Node.js
* Express.js
* Redis
* BullMQ
* PostgreSQL
* Supabase
* Groq

### Frontend

* React
* Vite
* Zustand
* Tailwind CSS
* shadcn/ui

### Infrastructure

* Docker
* Nginx
* Redis
* Linode

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

The application is deployed using:

* Independent frontend and backend Docker images
* Redis-backed worker infrastructure
* Host-level Nginx reverse proxy
* TLS via Let's Encrypt
* Single Linode deployment
