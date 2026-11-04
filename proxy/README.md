# StoryMe Gemini proxy

A Cloudflare Worker that keeps the Gemini API key off the browser. The frontend
calls this Worker; the Worker adds the key (a Worker secret) and forwards the
request to Google.

Deployed at: `https://storyme-gemini-proxy.shenjiayi692.workers.dev`

Protections: allowed origins only (`ALLOWED_ORIGINS`), only the models/methods
StoryMe uses, 200 KB request cap, 60 calls per minute per IP.

## Set the key (once)

Cloudflare dashboard → Workers & Pages → `storyme-gemini-proxy` → Settings →
Variables and Secrets → Add → type **Secret**, name `GEMINI_API_KEY`, value = your key.

Or from this folder:

```bash
npx wrangler secret put GEMINI_API_KEY
```

## Allow your site

Add the deployed site's origin (e.g. `https://storyme.example.com`) to
`ALLOWED_ORIGINS` (comma-separated) in the dashboard or `wrangler.toml`.

## Use it from the app

In `.env.local` (or the hosting build settings):

```
GEMINI_PROXY_URL="https://storyme-gemini-proxy.shenjiayi692.workers.dev"
```

With this set, `GEMINI_API_KEY` is not compiled into the bundle.

## Redeploy after editing worker.js

```bash
npx wrangler deploy
```
