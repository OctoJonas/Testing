# Octonomy Testing Suite — Next.js

Single-process consolidation of the Flask + Vite testing framework.
One Next.js 16 app hosts the React UI, REST routes (App Router), and a
Socket.IO server (custom Node entrypoint). One container, one port.

## Stack

- **Next.js 16** with the App Router
- **Custom Node server** ([server.ts](server.ts)) running Next.js + Socket.IO
  on the same HTTP listener
- **TypeScript everywhere**, no Python runtime
- **Anthropic SDK** for evaluation, with prompt caching + tool-use
- **OpenAI SDK** as a fallback evaluator
- **socket.io-client** to talk to the Octonomy widget API
- **exceljs** for Excel I/O, **pdfkit** for PDF generation
- **zod** for inbound payload validation
- **vitest** for unit tests

## Layout

```
testing/web/
├── server.ts                   # Custom Node server (Next.js + Socket.IO)
├── app/
│   ├── layout.tsx · page.tsx · globals.css
│   └── api/                    # REST endpoints (/api/health, /api/upload-excel, /api/export/...)
├── components/                 # React UI (chat / settings / testpilot / autonomous / docs)
├── hooks/                      # useChatSocket / useTestPilotSocket / useAutonomousSocket
├── contexts/                   # ToastProvider + useToast (split for fast-refresh)
├── services/                   # Browser-side socket + localStorage config manager
├── lib/                        # Server-side logic — TypeScript port of testing/backend
│   ├── octonomy/               # Octonomy SDK (auth · conversation · socket-client · client)
│   ├── agents/                 # QATestingAgent + AutonomousTester (Anthropic + OpenAI)
│   ├── socket/                 # Socket.IO event handler families
│   ├── schemas/                # zod schemas for inbound payloads
│   ├── exports/                # PDF + Excel generators
│   ├── utils/                  # retry / atomic-io / safe-logging / rate-limit
│   ├── connection-pool.ts      # Per-session, per-context pool with idle sweeper
│   └── types.ts
└── tests/                      # vitest specs
```

## Setup

```bash
cd testing/web
pnpm install
cp .env.example .env
# Edit .env — at minimum set ANTHROPIC_API_KEY for evaluation features.
pnpm dev
```

The custom server boots on http://127.0.0.1:3000. Both REST endpoints (e.g.
`GET /api/health`) and the Socket.IO endpoint (`/socket.io/`) are served on
the same port.

## Scripts

| Script           | What it does                                          |
| ---------------- | ----------------------------------------------------- |
| `pnpm dev`       | `tsx watch server.ts` — server + Next.js HMR on :3000 |
| `pnpm build`     | `next build`                                          |
| `pnpm start`     | `node --experimental-strip-types server.ts`           |
| `pnpm typecheck` | `tsc --noEmit`                                        |
| `pnpm lint`      | `eslint`                                              |
| `pnpm test`      | `vitest run`                                          |

## Architecture notes

- **Custom server vs `output: "standalone"`** — Next.js's standalone output
  doesn't trace `server.ts`, so we ship the full build and run the file
  directly. Node 22+ strips TypeScript syntax via
  `--experimental-strip-types`.
- **No Vercel deploys** — Vercel does not host long-lived WebSocket
  connections. Fly.io / any Node host works.
- **Single worker per machine** — the connection pool, rate-limit buckets,
  and per-session abort controllers live in process memory. To scale
  horizontally, move that state to Redis.
- **API key in the backend only** — the frontend never sees
  `ANTHROPIC_API_KEY`. Set it in the server environment (Fly secret, .env,
  etc.) and the test agents pick it up automatically. Claude Sonnet 4 is
  hardcoded as the evaluator.
- **Socket.IO + Next.js HMR** — the custom server delegates to
  `next.getRequestHandler()`, so React component HMR works as usual; the
  Socket.IO server is reattached on `tsx watch` reload.

## Session identity & reconnection

All per-session server state (connection pool, chat history, QA/autonomous run
state, rate-limit buckets) is keyed by a **stable per-tab session id** the
browser sends in the Socket.IO handshake auth — not the ephemeral `socket.id`,
which changes on every reconnect. Each socket joins a room named after that id,
so `io.to(sid)` keeps reaching the live socket across reconnects.

On disconnect the session is **not** torn down immediately: it survives a grace
window (`SESSION_GRACE_SECONDS`, default 90s). If the same tab reconnects within
it, teardown is cancelled and any in-flight run keeps streaming to the new
socket. The browser also replays its widget config on reconnect. See
[lib/socket/session.ts](lib/socket/session.ts).

## Deployment (Fly.io)

One Fly app, `widget-testing`, **one machine** (the in-process pool / rate
limiters / abort controllers don't survive a second machine without Redis — see
the "Single worker per machine" note above). Config lives in [fly.toml](fly.toml);
`ANTHROPIC_API_KEY` and `APP_PIN` are set via `fly secrets`.

```bash
fly deploy --app widget-testing
fly logs   --app widget-testing
```
