# LeetCode → GitHub OAuth Broker

This directory contains the secure backend OAuth Broker for the LeetCode → GitHub Multi-Solution Sync Chrome Extension.

## Why this is required

GitHub OAuth authorization requires a `client_secret` to exchange an authorization code for an `access_token`.
Google Chrome extensions execute entirely on the client's machine, meaning **client secrets must never be embedded in the extension package**.

This minimal broker:
1. Receives the authorization request from the Chrome Extension.
2. Directs the user to GitHub's authorization consent screen.
3. Securely exchanges the temporary `code` for an `access_token` using `GITHUB_CLIENT_SECRET` stored in secure server environment variables.
4. Redirects the user back to the Chrome Extension redirect URL (`https://<extension-id>.chromiumapp.org/`) with the resulting access token.

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
4. Deploy using `vercel`.

### Option 2: Cloudflare Workers
1. Create a Cloudflare Worker using the logic from `index.js`.
2. Add secrets using `wrangler secret put GITHUB_CLIENT_ID` and `wrangler secret put GITHUB_CLIENT_SECRET`.
3. Set your GitHub OAuth App Callback URL to `https://<worker-name>.<account>.workers.dev/callback`.

### Option 3: Local Node.js / Docker
```bash
export GITHUB_CLIENT_ID=your_client_id
export GITHUB_CLIENT_SECRET=your_client_secret
export PORT=3000
node broker/index.js
```
