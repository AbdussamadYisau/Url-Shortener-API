# Shortly · URL Shortener

An Express 5 + MongoDB URL shortener with a responsive, accessible web frontend. Updated for 2026 with Node.js 22+, Mongoose 9, cryptographic short codes, HTTP(S) validation, security headers, request limits, and integration tests.

## Run locally

```sh
npm ci
cp .env.example .env
npm run dev
```

Open http://localhost:8080. The example environment uses **temporary in-memory storage**: links disappear on restart. Browser history remembers up to 20 links on that browser, but does not make temporary links persistent. Use `npm run start:demo` for a quick preview without an environment file.

For persistent links, remove `STORAGE=memory` and set `DB_CONNECTION` to your MongoDB connection string. Existing `databases` collection records and short codes are retained. Back up your database before upgrading; resolve any duplicate `urlCode` values before enabling the unique index. Production explicitly rejects memory storage.

## Frontend

- Shorten links, open the result, and copy to clipboard (clipboard requires localhost or HTTPS).
- Recent links saved on this browser, with individual copy actions and clear history.
- Responsive layout, keyboard focus states, live status and error messages.
- Frontend and API share an origin; no separate frontend build is required.

## API

`POST /api/url/shorten` with JSON:

```json
{ "longUrl": "https://example.com/a/long/path" }
```

Returns the existing API fields: `longUrl`, `shortUrl`, `urlCode`, and `date`. Repeated normalized URLs reuse an existing record. Only HTTP/HTTPS destinations without embedded credentials are accepted. Invalid input returns 400; creation is limited to 30 requests per minute per IP (429). The default limiter is per server process; use a shared limiter store for multi-instance deployments.

`GET /:code` redirects with HTTP 302, or returns 404 for unknown links. `GET /api/health` reports storage mode. Links are public bearer links: anyone with a short link can open its destination. There is no public history-listing endpoint.

## Environment

| Variable | Purpose |
| --- | --- |
| `PORT` | Local port, default 8080 |
| `BASE_URL` | Public origin used in short links; set your deployed HTTPS domain in production |
| `DB_CONNECTION` | MongoDB connection string (or use `MONGODB_URI` from the Atlas integration) |
| `STORAGE` | Set to `memory` only for local development |
| `NODE_ENV` | Set to `production` for production |
| `TRUST_PROXY` | Set to `1` only when behind exactly one trusted reverse proxy |

Legacy `host` is supported as a fallback for `BASE_URL`. Short URL origins come from configuration, not untrusted request headers.

## Vercel

Import the repository as a Node.js project. `vercel.json` routes requests through the exported handler and includes the frontend assets. Add MongoDB Atlas through the Vercel Marketplace, or use an existing cluster. Configure `DB_CONNECTION` (or the integration’s `MONGODB_URI`), `BASE_URL`, `NODE_ENV=production`, and `TRUST_PROXY=1`; leave `STORAGE` unset. MongoDB must accept connections from the deployment. Database connections are reused within warm function instances. The Vercel path is prepared but needs verification with your deployment and database credentials.

## Verification

```sh
npm test
npm audit
```

Tests cover the frontend response, HTTP(S) validation, duplicate reuse, generated links, redirects, missing links, malformed JSON, and rate limiting using isolated memory storage. Live MongoDB and hosted deployment require separate environment verification.
