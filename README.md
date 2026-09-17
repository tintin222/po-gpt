# PO-GPT — Enterprise Internal AI Chat Platform

An internal, self-hosted "ChatGPT for your company": a Claude Projects-style chat workspace with
multi-provider LLM support, centralized API-key management, per-user token budgets, usage
analytics, and a built-in RAG knowledge base — all behind a company login.

## Features

**For everyone**
- 💬 Streaming chat with Markdown rendering and a model dropdown (choose any model your admins enable)
- 🖼 **Artifacts** — when the assistant produces an interactive HTML page, chart, or SVG, it appears
  as a card that opens in a live sandboxed preview panel (with code view, copy, and download)
- 📎 **File deliverables** — ask for a report, deck, or dataset and the assistant generates real
  downloadable **Word (.docx)**, **PowerPoint (.pptx)**, and **Excel (.xlsx)** files via structured
  tools (professionally styled: headings, tables, title slides, speaker notes, typed cells)
- 🗂 **Projects** — group chats with shared **Instructions**, **Memory**, and a **Knowledge** base
  (upload PDF / DOCX / TXT / MD / CSV / code files; chats automatically retrieve relevant excerpts)
- 🕘 Full chat history per user, rename/delete chats, per-chat model persistence
- 📊 Personal usage page: monthly tokens vs. budget, per-model breakdown

**For administrators**
- 🔌 **Providers & models**: connect **Anthropic**, **OpenAI**, **Google Gemini**, or **Local**
  (any OpenAI-compatible endpoint: Ollama, vLLM, LM Studio, LiteLLM). API keys are encrypted at
  rest with AES-256-GCM and never leave the server
- 🎛 Enable/disable models per provider, set the org-wide default model, attach per-MTok pricing
  for cost estimation, add an embedding model to power semantic RAG
- 👥 User management: create accounts, roles (Admin/Member), deactivate, reset passwords
- 🚦 **Usage governance**: global default monthly token budget + per-user overrides; requests are
  blocked with a clear message when a budget is exhausted (0 = unlimited)
- 📈 Usage analytics: org totals, per-user and per-model consumption with estimated spend,
  month-by-month

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| App framework | **Next.js 15** (App Router, React 19, TypeScript) | One deployable unit for UI + API, streaming-first, first-class on Railway |
| UI | **Tailwind CSS v4** + Radix primitives + Lucide icons (shadcn-style components) | Professional, accessible, fast to evolve |
| LLM layer | **Vercel AI SDK v5** (`ai` + provider packages) | One streaming interface over Anthropic / OpenAI / Gemini / OpenAI-compatible local models |
| Auth | **Auth.js (NextAuth v5)** credentials + JWT sessions | Role-aware middleware, no third-party IdP required (SSO can be added later) |
| Database | **PostgreSQL + Prisma** | Users, chats, projects, providers, usage ledger |
| RAG | **pgvector** in the same Postgres (HNSW, cosine) with automatic **full-text-search fallback** | No extra vector-DB service to run; degrades gracefully if pgvector or an embedding model is unavailable |
| Secrets | AES-256-GCM via `APP_ENCRYPTION_KEY` | Provider API keys are never stored in plaintext |
| Hosting | **Railway** (Nixpacks, `railway.json` included) | Long-running Node server — no serverless timeout issues for streaming/uploads |

## Architecture notes

- **Chat flow**: the client sends only the newest message; the server loads history from Postgres,
  runs quota checks, resolves the model (user selection → chat default → org default), injects the
  project system prompt + retrieved knowledge, streams the response, then persists the assistant
  message and a `UsageRecord` (tokens + estimated cost) in one place.
- **RAG ingestion**: upload → text extraction (`pdf-parse`, `mammoth`) → paragraph-aware chunking
  (~1500 chars, 200 overlap) → embeddings (OpenAI `text-embedding-3-small`, Gemini
  `gemini-embedding-001`, or a local model; normalized to 1536 dims) → pgvector.
  If no embedding model is configured (e.g. Anthropic-only) or pgvector is missing, retrieval
  falls back to Postgres full-text search — knowledge files keep working either way. Document
  badges show which mode is active (`semantic` vs `keyword`).
- **File generation**: the model calls `createDocument` / `createPresentation` /
  `createSpreadsheet` tools (AI SDK multi-step tool calling); the server renders files
  **deterministically** with `docx`, `pptxgenjs`, and `exceljs` — no model-written code is ever
  executed. Files are stored in Postgres (`GeneratedFile`) and served through an authenticated
  download route, shown as download cards in the chat. Per-model "files" toggle in the admin
  console — turn it off for local models without tool-calling support.
- **Quotas**: `UsageRecord` rows are bucketed by `YYYY-MM`. Effective limit = user override ??
  global default; `0` means unlimited. Enforcement happens before each model call.
- **Startup** (`instrumentation.ts` → `src/lib/bootstrap.ts`): best-effort
  `CREATE EXTENSION vector` + embedding column/index, `AppSettings` seed, and optional first-admin
  creation from `ADMIN_EMAIL`/`ADMIN_PASSWORD`. Migrations run via `prisma migrate deploy` in the
  start command.

## Deploy on Railway

1. **Create a project** at railway.app → *Deploy from GitHub repo* → select this repository.
   Railway reads `railway.json` (build `npm run build`, start `npm run start`, healthcheck
   `/api/health`).
2. **Add PostgreSQL**: *Create → Database → PostgreSQL*. Railway's Postgres image ships with
   pgvector; the app enables the extension automatically at boot (and falls back to full-text
   search if it can't).
3. **Set service variables** on the app service:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference the DB service) |
   | `AUTH_SECRET` | `openssl rand -base64 32` |
   | `APP_ENCRYPTION_KEY` | `openssl rand -hex 32` (encrypts provider API keys) |
   | `AUTH_TRUST_HOST` | `true` |
   | `NEXT_PUBLIC_APP_NAME` | your platform name (optional, default `PO-GPT`) |
   | `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | optional — auto-creates the first admin on boot |

4. **Deploy**, then open the app URL:
   - If you set `ADMIN_EMAIL`/`ADMIN_PASSWORD`, sign in with those credentials.
   - Otherwise the first visit redirects to **/setup** to create the admin account
     (one-time; disabled as soon as any user exists).
5. **Configure the platform** (as admin):
   1. *Admin → Models & providers* → **Add provider** (e.g. Anthropic + API key) → **Add model**
      (one-click suggestions with pricing prefilled, or any custom model ID).
   2. Add an **embedding model** (OpenAI or Gemini) to enable semantic search for project knowledge.
   3. *Admin → Users* → create accounts for your team and set token budgets.
   4. *Admin → Overview* → set the global default monthly token budget.

### Local development

```bash
cp .env.example .env        # fill in DATABASE_URL, AUTH_SECRET, APP_ENCRYPTION_KEY
npm install
npx prisma migrate deploy   # or: npx prisma migrate dev
npm run dev
```

Postgres via Docker: `docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 pgvector/pgvector:pg16`

## Security model

- Passwords hashed with bcrypt (cost 12); JWT sessions in httpOnly cookies; middleware guards all
  pages, every API route re-checks the session and role against the database.
- Provider API keys encrypted with AES-256-GCM; only the last 4 characters are ever displayed.
- All chat/project/document access is scoped to the owning user; admin endpoints require the
  `ADMIN` role.
- Usage records are written server-side from provider-reported token counts — clients can't
  falsify consumption.

## Roadmap ideas

- SSO (Okta / Entra ID / Google Workspace) via Auth.js providers
- Org-shared projects and role-based project permissions
- Image/file attachments in chat messages
- PDF export and editing of uploaded Office files
- Scheduled/recurring project tasks and automatic project memory distillation
- Response regeneration and message editing
- Export chats; retention policies; audit log
