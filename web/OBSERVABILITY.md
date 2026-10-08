# Observability — log history

`fly logs` only streams a short **live** buffer. Fly.io does **not** retain log
history, so questions like "what errored last month" are unanswerable unless
logs are shipped to a durable sink. This guide sets that up.

## Why

- Diagnose intermittent production issues (e.g. the "stuck on Configuring"
  reconnect class) after the fact instead of trying to catch them live.
- Keep an audit trail of QA/autonomous run failures.

## Setup: fly-log-shipper → a durable sink

Fly's community [`fly-log-shipper`](https://github.com/superfly/fly-log-shipper)
runs a Vector-based app that subscribes to your org's logs (via NATS) and
forwards them to a sink. Pick **one** destination and provide its token.

```bash
git clone https://github.com/superfly/fly-log-shipper && cd fly-log-shipper
fly launch --no-deploy --copy-config --name widget-testing-logs --org personal

# Org access so the shipper can read logs:
fly secrets set --app widget-testing-logs \
  ACCESS_TOKEN="$(fly auth token)" ORG=personal

# Then ONE sink, e.g. Better Stack (Logtail):
fly secrets set --app widget-testing-logs LOGTAIL_TOKEN=<token>
#   …or Datadog:  DATADOG_API_KEY / DATADOG_SITE
#   …or Loki:     LOKI_URL (+ LOKI_USERNAME / LOKI_PASSWORD)
#   …or S3:       AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_BUCKET / AWS_REGION

fly deploy --app widget-testing-logs
```

The shipper forwards logs for **every** app in the org, including
`widget-testing`. Filter by `app=widget-testing` in the sink.

## Decision required

Which sink to use is a product/ops decision and needs an account + token:

- **Better Stack** — cheapest to start, good search UI. Recommended for this
  scale.
- **Datadog** — if the team already uses it.
- **S3** — cheapest cold storage, weakest query UX.

Once a sink + token is chosen, the commands above are copy-paste. Until then,
fall back to catching issues live with `fly logs --app widget-testing` (and
temporarily `fly secrets set SOCKET_DEBUG=true` for verbose per-event tracing).
