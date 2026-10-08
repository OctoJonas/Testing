# Octonomy AI Testing Framework

Tools for systematically testing and evaluating Octonomy chatbot widgets:
manual chat, bulk Q&A evaluation, and autonomous multi-turn testing, with
AI-powered scoring.

> Part of the [Quickstep-AI/ml-research](https://github.com/Quickstep-AI/ml-research)
> monorepo, in the `testing/` directory.

## What's here

| Path          | What it is                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------- |
| [`web/`](web/)         | **The app.** A single Next.js 16 process serving the React UI, REST routes, and a Socket.IO server. This is what's deployed to Fly.io (`widget-testing`). Start here. |
| [`cli/`](cli/)         | `octo` — a command-line tool for TDD-style agent testing (send / batch / eval / chat).         |
| [`backend/`](backend/) | Python: the standalone `octonomy_client` library (used by the CLI and the MCP server), the `mcp_server` (Octonomy testing exposed over MCP), and the shared `services`/`models` they depend on. |
| [`tests/`](tests/)     | pytest suite for the Python `octonomy_client` library.                                          |
| [`docs/`](docs/)       | Architecture, client library, widget protocol, and PRD docs.                                   |

> **History:** this used to be a two-app stack (Flask backend + Vite SPA on
> ports 5000/5173). Both were consolidated into [`web/`](web/); the old
> `frontend/`, the Flask app, and the two-app deploy scripts have been removed.
> The Python `octonomy_client` lib survives because the CLI, the pytest suite,
> and the MCP server still depend on it.

## The web app

See [`web/README.md`](web/README.md) for setup, scripts, architecture, and the
session-identity / reconnection model.

```bash
cd web
pnpm install
cp .env.example .env   # set ANTHROPIC_API_KEY at minimum
pnpm dev               # http://127.0.0.1:3000
```

Three testing modes:

- **Chat** — interactive manual testing of a widget.
- **TestPilot (Q&A)** — upload an Excel file of `Frage`/`Antwort` pairs; each
  question runs in a fresh, isolated conversation and is scored against the
  expected answer by Claude.
- **Autonomous** — a Claude-driven tester drives a multi-turn conversation from
  a prompt, optionally evaluating each turn.

## The octo CLI

```bash
octo send "Hello, how can you help?" --agent my_agent
octo eval qa.xlsx --agent my_agent --ci
octo chat --agent my_agent
```

See [`cli/README.md`](cli/README.md).

## Python tests

```bash
cd tests
python3 -m venv .venv
.venv/bin/pip install pytest pytest-mock pytest-cov pytest-timeout responses pyyaml requests python-socketio
.venv/bin/python -m pytest client_tests --ignore=client_tests/e2e -v
```

## Documentation

- [`web/README.md`](web/README.md) — the deployed app
- [`docs/OCTONOMY_CLIENT.md`](docs/OCTONOMY_CLIENT.md) — Python client library
- [`docs/TECHNICAL.md`](docs/TECHNICAL.md) — architecture
- [`docs/WIDGET_PROTOCOL.md`](docs/WIDGET_PROTOCOL.md) — widget communication protocol
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contribution guidelines
