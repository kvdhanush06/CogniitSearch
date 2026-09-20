# Security Policy

## Scope

CogniitSearch is an AI-powered retrieval and answer platform. Security-sensitive areas include authentication, conversation ownership, streamed responses, external retrieval services, Redis-backed jobs, and Supabase data access.

## Reporting a Vulnerability

Please do not disclose exploitable vulnerabilities in public issues. Report security concerns privately to the repository owner through GitHub or the contact information published on https://allkvd.dev/.

Include the affected component, reproduction steps, impact, and any relevant logs or proof of concept that can be shared safely.

## Security Practices

- Authentication-derived identity is preferred over client-supplied identity headers.
- Conversation and message operations enforce user ownership.
- Request payloads and identifiers are runtime-validated.
- Secrets are supplied through environment configuration rather than committed credentials.
- External-service failures are returned through controlled application errors rather than raw exception disclosure.
- Redis-backed rate limiting is designed to avoid silently failing open for expensive AI operations.
- Supabase data access includes database-level row-security controls where applicable.

## Secret Handling

Never commit API keys, access tokens, database credentials, JWT secrets, or production environment files. Use `.env.example` files only for placeholders.
