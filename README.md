# Shortly

A URL shortener with Google sign-in, private link history, and configurable expiry. Built with React, Tailwind CSS, Express 5, and MongoDB Atlas.

[Live app](https://url-shortener-api-beta.vercel.app/)

## How it works

![Sign in with Google, create and share short links, keep account history private, and configure link expiry.](assets/how-it-works.svg)

History is private to your account. Anyone with a short link can open its destination. Existing anonymous links remain accessible but aren't assigned to an account.

## Local setup

Requires Node.js 22+ and Google OAuth credentials.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open [localhost:8080](http://localhost:8080). The example uses temporary memory storage; remove `STORAGE=memory` and set `MONGODB_URI` for persistence. Run `npm run dev:frontend` in another terminal to watch React/Tailwind edits.

## Deploy to Vercel

Import this repo, use `npm run build`, and connect MongoDB Atlas. Configure a Google OAuth **Web application** with this authorized redirect URI:

```text
https://YOUR_DOMAIN/api/auth/google/callback
```

For local development, also authorize `http://localhost:8080/api/auth/google/callback`. Add test users while the Google app is in Testing, or publish it for your intended audience.

Set these server-side environment variables, then redeploy:

| Variable | Value |
| --- | --- |
| `BASE_URL` | Public HTTPS origin, without a trailing slash |
| `MONGODB_URI` | Atlas connection string |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `1` behind Vercel's proxy |
| `LINK_RETENTION_DAYS` | `0` keeps links indefinitely; e.g. `30` expires them after 30 days |
| `SESSION_MAX_AGE_DAYS` | Session lifetime, default `7` (1–90) |
| `CRON_SECRET` | Random secret, at least 32 characters, for scheduled cleanup |

Leave `STORAGE` unset in production. Legacy `DB_CONNECTION` takes precedence over `MONGODB_URI`.

**Retention applies to existing links too.** Expired links return 404; daily cron (03:00 UTC) and create/list requests delete expired records permanently. Changing retention cannot recover deleted links. Malformed legacy dates are preserved for manual inspection.

## API & checks

| Endpoint | Behavior |
| --- | --- |
| `GET /api/auth/google` | Start Google sign-in |
| `GET /api/auth/me` | Current account and configuration status |
| `POST /api/auth/logout` | Sign out |
| `POST /api/url/shorten` | Shorten `{ "longUrl": "https://example.com" }`; sign-in required |
| `GET /api/links` | Your latest 100 active links |
| `GET /:code` | Public redirect; 404 if missing or expired |
| `GET /api/health` | Storage status |

POST requests require a matching `Origin`; authenticated routes use session cookies. Creation is limited to 30 requests/minute/IP per server instance.

```sh
npm test
npm audit
```

Tests use memory storage and a mock Google provider. Verify real Google login, MongoDB, and cron after deployment.
