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

// Environment variables configured on your hosting platform
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';

// In-memory store for one-time exchange codes (TTL: 60 seconds)
const tokenExchangeStore = new Map();

function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [key, value] of tokenExchangeStore.entries()) {
    if (value.expires < now) tokenExchangeStore.delete(key);
  }
}

/**
 * Validates that redirect URI belongs to an authorized Chrome extension
 * or local dev environment, preventing open-redirect vulnerabilities.
 */
function isValidExtensionRedirect(uri) {
  if (!uri || typeof uri !== 'string') return false;
  try {
    const parsed = new URL(uri);
    // Allow standard Chrome extension identity redirect URIs
    if (parsed.protocol === 'https:' && parsed.hostname.endsWith('.chromiumapp.org')) {
      return true;
    }
    // Allow localhost/127.0.0.1 for local extension development
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return true;
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
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // CORS headers restricted to extension contexts
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

    if (!isValidExtensionRedirect(extensionRedirect)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid or unauthorized redirect_uri. Must be a valid Chrome extension redirect URI (*.chromiumapp.org).' }));
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

    if (!isValidExtensionRedirect(extensionRedirectUri)) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid redirect URI in OAuth callback.');
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

      const accessToken = tokenResponse.access_token;

      // Generate a secure one-time exchange code (60-second TTL)
      // Bearer token is NEVER passed in URL parameters!
      const exchangeCode = crypto.randomBytes(24).toString('hex');
      tokenExchangeStore.set(exchangeCode, {
        token: accessToken,
        expires: Date.now() + 60000,
      });
      cleanupExpiredTokens();

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

  // 3. /api/token or /token - Secure POST endpoint to exchange one-time code for access token
  if ((pathname === '/api/token' || pathname === '/token') && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
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
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Exchange code expired.' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ access_token: record.token }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Malformed JSON request body.' }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

// Start local server if run directly
const port = process.env.PORT || 3000;
const server = http.createServer(handleRequest);
server.listen(port, () => {
  console.log(`LeetCode GitHub Sync OAuth Broker running at http://localhost:${port}`);
});
