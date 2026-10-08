/**
 * LeetCode -> GitHub Sync OAuth Broker
 * Lightweight serverless broker for secure GitHub OAuth token exchange.
 *
 * Compatible with Node.js, Vercel Serverless Functions, and Cloudflare Workers.
 * Keeps GITHUB_CLIENT_SECRET secure on the server side - never in the extension bundle.
 */

import https from 'node:https';
import http from 'node:http';
import url from 'node:url';
import crypto from 'node:crypto';
<<<<<<< HEAD
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
=======
>>>>>>> 71026eab6dc010bb78586627d22b26f34d0fd463

// Environment variables configured on your hosting platform
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';

<<<<<<< HEAD
// Shared store directory for serverless-safe atomic ticket redemption tracking
function getRedemptionDir() {
  const dir = process.env.TICKET_STORE_DIR || path.join(os.tmpdir(), 'leet-vault-tickets');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // Directory might already exist
  }
  return dir;
}

/**
 * Returns list of explicitly authorized Chrome extension IDs.
 */
function getAllowedExtensionIds() {
  return (process.env.ALLOWED_EXTENSION_IDS || process.env.ALLOWED_EXTENSION_ID || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Cleans up expired redemption locks older than 2 minutes (TTL is 60s).
 */
function cleanupExpiredRedemptions() {
  try {
    const dir = getRedemptionDir();
    const files = fs.readdirSync(dir);
    const now = Date.now();
    for (const file of files) {
      if (!file.endsWith('.lock')) continue;
      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > 120000) {
          fs.unlinkSync(fullPath);
        }
      } catch {
        // Ignore concurrently unlinked files
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}


/**
 * Serverless-safe shared redemption state mechanism.
 * Atomically marks a ticket as consumed. Prevents replay attacks and race conditions.
 *
 * 1. Uses distributed Vercel KV / Upstash Redis REST API if configured via environment.
 * 2. Uses atomic OS-level filesystem locks (O_CREAT | O_EXCL via fs.openSync flag 'wx')
 *    which guarantees mutual exclusion across concurrent threads and serverless processes.
 *
 * Never logs credentials, tickets, or secrets.
 */
async function consumeTicket(ticketId, expiresAt) {
  if (!ticketId || typeof ticketId !== 'string') return false;

  // 1. Distributed KV / Redis REST API if configured in environment
  const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (kvUrl && kvToken) {
    try {
      const ttlSec = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
      const res = await fetch(`${kvUrl}/set/ticket:${encodeURIComponent(ticketId)}/1?nx=true&ex=${ttlSec}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${kvToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        // Redis returns { result: "OK" } on new key, or { result: null } if already exists
        return data.result === 'OK';
      }
    } catch {
      // Fallback to atomic file lock
    }
  }

  // 2. Atomic OS-level file reservation
  cleanupExpiredRedemptions();
  const lockPath = path.join(getRedemptionDir(), `${ticketId}.lock`);
  try {
    const fd = fs.openSync(lockPath, 'wx');
    try {
      fs.writeFileSync(fd, JSON.stringify({ exp: expiresAt }), 'utf8');
    } finally {
      fs.closeSync(fd);
    }
    return true; // Successfully acquired atomically
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      return false; // Already redeemed!
    }
    return false;
  }
}

/**
 * Serverless stateless exchange ticket encryption and decryption helpers.
 * Eliminates in-memory storage so the broker works seamlessly across all Vercel/lambda instances.
 */
function getSecretKey() {
  const secret = process.env.GITHUB_CLIENT_SECRET || GITHUB_CLIENT_SECRET;
  if (!secret) {
    throw new Error('GITHUB_CLIENT_SECRET is not configured on broker');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptTokenTicket(payload) {
  const key = getSecretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ticketPayload = {
    ...payload,
    jti: payload.jti || crypto.randomBytes(16).toString('hex'),
  };
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(ticketPayload), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${authTag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

function decryptTokenTicket(ticket) {
  if (!ticket || typeof ticket !== 'string') return null;
  const parts = ticket.split('.');
  if (parts.length !== 3) return null;

  try {
    const key = getSecretKey();
    const iv = Buffer.from(parts[0], 'base64url');
    const authTag = Buffer.from(parts[1], 'base64url');
    const ciphertext = Buffer.from(parts[2], 'base64url');

    if (iv.length !== 12 || authTag.length !== 16) return null;

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    const parsed = JSON.parse(decrypted.toString('utf8'));
    if (!parsed || !parsed.token || !parsed.exp) return null;
    return parsed;
  } catch {
    return null;
=======
// In-memory store for one-time exchange codes (TTL: 60 seconds)
const tokenExchangeStore = new Map();

function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [key, value] of tokenExchangeStore.entries()) {
    if (value.expires < now) tokenExchangeStore.delete(key);
>>>>>>> 71026eab6dc010bb78586627d22b26f34d0fd463
  }
}

/**
 * Validates that redirect URI belongs to an authorized Chrome extension
 * or local dev environment, preventing open-redirect vulnerabilities.
<<<<<<< HEAD
 * In production, ALLOWED_EXTENSION_IDS is MANDATORY and fails closed if missing.
=======
>>>>>>> 71026eab6dc010bb78586627d22b26f34d0fd463
 */
function isValidExtensionRedirect(uri) {
  if (!uri || typeof uri !== 'string') return false;
  try {
    const parsed = new URL(uri);
<<<<<<< HEAD
    // Allow localhost/127.0.0.1 for local extension development only in non-production
    if (process.env.NODE_ENV !== 'production' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
      return true;
    }
    // Allow standard Chrome extension identity redirect URIs (*.chromiumapp.org)
    if (parsed.protocol === 'https:' && parsed.hostname.endsWith('.chromiumapp.org')) {
      const extId = parsed.hostname.replace('.chromiumapp.org', '').toLowerCase();
      const allowed = getAllowedExtensionIds();

      // In production, ALLOWED_EXTENSION_IDS is mandatory. Fail closed if missing or empty.
      if (process.env.NODE_ENV === 'production') {
        if (allowed.length === 0) {
          return false;
        }
        return allowed.includes(extId);
      }

      // In non-production development:
      if (allowed.length > 0) {
        return allowed.includes(extId);
      }
      return /^[a-z]{32}$/.test(extId);
=======
    // Allow standard Chrome extension identity redirect URIs
    if (parsed.protocol === 'https:' && parsed.hostname.endsWith('.chromiumapp.org')) {
      return true;
    }
    // Allow localhost/127.0.0.1 for local extension development
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return true;
>>>>>>> 71026eab6dc010bb78586627d22b26f34d0fd463
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Exchanges authorization code with GitHub for an access token
 */
function exchangeCodeForToken(code) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code: code,
    });

    const options = {
      hostname: 'github.com',
      port: 443,
      path: '/login/oauth/access_token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'LeetCode-GitHub-Sync-Broker',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse GitHub token response: ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Main HTTP request handler (works for Node http.createServer, Express, or Vercel handler)
 */
export default async function handleRequest(req, res) {
<<<<<<< HEAD
  const reqHost = req.headers['host'] || 'localhost';
  const parsedUrl = new URL(req.url, `http://${reqHost}`);
=======
  const parsedUrl = url.parse(req.url, true);
>>>>>>> 71026eab6dc010bb78586627d22b26f34d0fd463
  const pathname = parsedUrl.pathname;
  const query = Object.fromEntries(parsedUrl.searchParams.entries());

<<<<<<< HEAD
  // CORS headers restricted strictly to authorized extension origins or dev localhost
  const origin = req.headers['origin'] || '';
  let isAllowedOrigin = false;
  if (origin) {
    try {
      const parsedOrigin = new URL(origin);
      if (parsedOrigin.protocol === 'chrome-extension:') {
        const extId = parsedOrigin.hostname.toLowerCase();
        const allowed = getAllowedExtensionIds();
        if (process.env.NODE_ENV === 'production') {
          if (allowed.length > 0 && allowed.includes(extId)) {
            isAllowedOrigin = true;
          }
        } else {
          if (allowed.length === 0 || allowed.includes(extId)) {
            isAllowedOrigin = true;
          }
        }
      } else if (process.env.NODE_ENV !== 'production' && (parsedOrigin.hostname === 'localhost' || parsedOrigin.hostname === '127.0.0.1')) {
        isAllowedOrigin = true;
      }
    } catch {
      isAllowedOrigin = false;
    }
  }

  if (isAllowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
=======
  // CORS headers restricted to extension contexts
  res.setHeader('Access-Control-Allow-Origin', '*');
>>>>>>> 71026eab6dc010bb78586627d22b26f34d0fd463
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (pathname === '/' || pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'LeetCode-GitHub-OAuth-Broker' }));
    return;
  }

  // 1. /login - Redirect to GitHub OAuth Authorization
  if (pathname === '/login' || pathname === '/api/login') {
    const extensionRedirect = query.redirect_uri || '';
    const stateParam = query.state || '';

<<<<<<< HEAD
    if (process.env.NODE_ENV === 'production' && getAllowedExtensionIds().length === 0) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server configuration error: ALLOWED_EXTENSION_IDS is required in production.' }));
      return;
    }

    if (!isValidExtensionRedirect(extensionRedirect)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid or unauthorized redirect_uri. Must match an authorized Chrome extension ID.' }));
=======
    if (!isValidExtensionRedirect(extensionRedirect)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid or unauthorized redirect_uri. Must be a valid Chrome extension redirect URI (*.chromiumapp.org).' }));
>>>>>>> 71026eab6dc010bb78586627d22b26f34d0fd463
      return;
    }

    if (!GITHUB_CLIENT_ID) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Server Error: GITHUB_CLIENT_ID is not configured.');
      return;
    }

    // Embed extension redirect_uri and CSRF nonce inside state parameter
    const combinedState = encodeURIComponent(
      JSON.stringify({
        ext_redirect: extensionRedirect,
        nonce: stateParam || crypto.randomBytes(16).toString('hex'),
      })
    );

    const host = req.headers['host'] || 'localhost:3000';
    const protocol = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
    const brokerCallbackUrl = `${protocol}://${host}/callback`;

    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=repo&redirect_uri=${encodeURIComponent(
      brokerCallbackUrl
    )}&state=${combinedState}`;

    res.writeHead(302, { Location: githubAuthUrl });
    res.end();
    return;
  }

  // 2. /callback - Handle GitHub OAuth return and generate one-time exchange code
  if (pathname === '/callback' || pathname === '/api/callback') {
    const code = query.code;
    const rawState = query.state;

    let extensionRedirectUri = '';
    let stateNonce = '';
    if (rawState) {
      try {
        const decoded = JSON.parse(decodeURIComponent(rawState));
        extensionRedirectUri = decoded.ext_redirect;
        stateNonce = decoded.nonce || '';
      } catch (e) {
        // State might not be JSON
      }
    }

<<<<<<< HEAD
    if (process.env.NODE_ENV === 'production' && getAllowedExtensionIds().length === 0) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Server configuration error: ALLOWED_EXTENSION_IDS is required in production.');
      return;
    }

    if (!isValidExtensionRedirect(extensionRedirectUri)) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid or unauthorized redirect URI in OAuth callback.');
=======
    if (!isValidExtensionRedirect(extensionRedirectUri)) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid redirect URI in OAuth callback.');
>>>>>>> 71026eab6dc010bb78586627d22b26f34d0fd463
      return;
    }

    if (!code) {
      const errorMsg = query.error_description || query.error || 'Missing authorization code';
      const sep = extensionRedirectUri.includes('?') ? '&' : '?';
      res.writeHead(302, {
        Location: `${extensionRedirectUri}${sep}error=${encodeURIComponent(errorMsg)}`,
      });
      res.end();
      return;
    }

    try {
      const tokenResponse = await exchangeCodeForToken(code);

      if (tokenResponse.error || !tokenResponse.access_token) {
        const err = tokenResponse.error_description || tokenResponse.error || 'Failed to exchange token';
        const sep = extensionRedirectUri.includes('?') ? '&' : '?';
        res.writeHead(302, {
          Location: `${extensionRedirectUri}${sep}error=${encodeURIComponent(err)}`,
        });
        res.end();
        return;
      }
<<<<<<< HEAD

      // Generate a stateless, tamper-proof AES-256-GCM encrypted exchange ticket (60-second TTL)
      // Serverless-safe: works across independent lambda instances without in-memory maps or external database.
      // Bearer token is NEVER passed in plain text in URL parameters!
      const exchangeCode = encryptTokenTicket({
        token: tokenResponse.access_token,
        exp: Date.now() + 60000,
        ext: extensionRedirectUri,
      });

=======

      const accessToken = tokenResponse.access_token;

      // Generate a secure one-time exchange code (60-second TTL)
      // Bearer token is NEVER passed in URL parameters!
      const exchangeCode = crypto.randomBytes(24).toString('hex');
      tokenExchangeStore.set(exchangeCode, {
        token: accessToken,
        expires: Date.now() + 60000,
      });
      cleanupExpiredTokens();

>>>>>>> 71026eab6dc010bb78586627d22b26f34d0fd463
      const separator = extensionRedirectUri.includes('?') ? '&' : '?';
      const statePart = stateNonce ? `&state=${encodeURIComponent(stateNonce)}` : '';
      const finalRedirect = `${extensionRedirectUri}${separator}code=${exchangeCode}${statePart}`;

      res.writeHead(302, { Location: finalRedirect });
      res.end();
    } catch (err) {
      console.error('Broker exchange error:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Internal Server Error: ${err.message}`);
    }
    return;
  }

<<<<<<< HEAD
  // 3. /api/token or /token - Secure POST endpoint to exchange one-time ticket for access token
=======
  // 3. /api/token or /token - Secure POST endpoint to exchange one-time code for access token
>>>>>>> 71026eab6dc010bb78586627d22b26f34d0fd463
  if ((pathname === '/api/token' || pathname === '/token') && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
<<<<<<< HEAD
    req.on('end', async () => {
      try {
        const { code } = JSON.parse(body || '{}');
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing exchange code.' }));
          return;
        }

        const ticketData = decryptTokenTicket(code);
        if (!ticketData || !ticketData.token || !ticketData.exp) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid or corrupted exchange code.' }));
          return;
        }

        if (ticketData.exp < Date.now()) {
=======
    req.on('end', () => {
      try {
        const { code } = JSON.parse(body || '{}');
        if (!code || !tokenExchangeStore.has(code)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid, missing, or expired exchange code.' }));
          return;
        }

        const record = tokenExchangeStore.get(code);
        tokenExchangeStore.delete(code); // One-time use only

        if (record.expires < Date.now()) {
>>>>>>> 71026eab6dc010bb78586627d22b26f34d0fd463
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Exchange code expired.' }));
          return;
        }

<<<<<<< HEAD
        // Atomically mark ticket as consumed to prevent replay attacks and race conditions
        const ticketId = ticketData.jti || crypto.createHash('sha256').update(code).digest('hex');
        const consumed = await consumeTicket(ticketId, ticketData.exp);

        if (!consumed) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Exchange code already used or invalid.' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ access_token: ticketData.token }));
      } catch {
=======
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ access_token: record.token }));
      } catch (err) {
>>>>>>> 71026eab6dc010bb78586627d22b26f34d0fd463
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Malformed JSON request body.' }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

<<<<<<< HEAD
export {
  handleRequest,
  isValidExtensionRedirect,
  getAllowedExtensionIds,
  encryptTokenTicket,
  decryptTokenTicket,
  consumeTicket,
};

// Start local server if run directly (not during tests or serverless imports)
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST && (!process.env.VERCEL || process.env.VERCEL !== '1')) {
  const isDirectRun = process.argv[1] && (process.argv[1].endsWith('broker/index.js') || process.argv[1].endsWith('broker\\index.js'));
  if (isDirectRun || process.env.PORT) {
    const port = process.env.PORT || 3000;
    const server = http.createServer(handleRequest);
    server.listen(port, () => {
      console.log(`Leet-Vault OAuth Broker running at http://localhost:${port}`);
    });
  }
}

=======
// Start local server if run directly
const port = process.env.PORT || 3000;
const server = http.createServer(handleRequest);
server.listen(port, () => {
  console.log(`LeetCode GitHub Sync OAuth Broker running at http://localhost:${port}`);
});
>>>>>>> 71026eab6dc010bb78586627d22b26f34d0fd463
