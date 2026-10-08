# Leet-Vault OAuth Broker

This directory contains the secure backend OAuth Broker for the Leet-Vault Chrome Extension.

## Why this is required

GitHub OAuth authorization requires a `client_secret` to exchange an authorization code for an `access_token`.
Google Chrome extensions execute entirely on the client's machine, meaning **client secrets must never be embedded in the extension package**.

This minimal broker:
1. Receives the authorization request from the Chrome Extension.
2. Directs the user to GitHub's authorization consent screen.
3. Securely exchanges the temporary GitHub code for an `access_token` using `GITHUB_CLIENT_SECRET` stored in secure server environment variables.
4. Issues a stateless, tamper-proof AES-256-GCM encrypted one-time exchange ticket (60-second TTL) back to the authorized Chrome Extension redirect URL (`https://<extension-id>.chromiumapp.org/`).
5. Verifies the ticket on `POST /api/token` and returns the access token. Fully stateless and serverless-safe across all Vercel/lambda instances without in-memory maps or external database.

---

## Environment Variables

- `GITHUB_CLIENT_ID`: Your GitHub OAuth App Client ID (Required)
- `GITHUB_CLIENT_SECRET`: Your GitHub OAuth App Client Secret (Required)
- `ALLOWED_EXTENSION_IDS`: Optional comma-separated list of authorized Chrome extension IDs (e.g. `abcdefghijklmnopqrstuvwxyzabcdef`). In production, only listed extension IDs or valid 32-character extension IDs are allowed.
- `NODE_ENV`: Set to `production` in production environments (disables localhost redirect/CORS allowances).

---

## Deployment Options

### Option 1: Vercel (1-Click or CLI)
1. In your GitHub account, go to **Settings → Developer Settings → OAuth Apps → New OAuth App**.
2. Set:
   - **Homepage URL**: `https://your-broker-deployment.vercel.app`
   - **Authorization callback URL**: `https://your-broker-deployment.vercel.app/callback`
3. Set Environment Variables in your Vercel Project Settings:
   - `GITHUB_CLIENT_ID`: Your GitHub OAuth App Client ID
   - `GITHUB_CLIENT_SECRET`: Your GitHub OAuth App Client Secret
   - `ALLOWED_EXTENSION_IDS`: Your extension ID(s)
4. Deploy using `vercel`.

### Option 2: Cloudflare Workers
1. Create a Cloudflare Worker using the logic from `index.js`.
2. Add secrets using `wrangler secret put GITHUB_CLIENT_ID` and `wrangler secret put GITHUB_CLIENT_SECRET`.
3. Set your GitHub OAuth App Callback URL to `https://<worker-name>.<account>.workers.dev/callback`.

### Option 3: Local Node.js / Docker
```bash
export GITHUB_CLIENT_ID=your_client_id
export GITHUB_CLIENT_SECRET=your_client_secret
export ALLOWED_EXTENSION_IDS=your_extension_id
export PORT=3000
node broker/index.js
```
