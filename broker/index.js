/**
 * LeetCode -> GitHub Sync OAuth Broker
 * Lightweight serverless broker for secure GitHub OAuth token exchange.
 *
 * Compatible with Node.js, Vercel Serverless Functions, and Cloudflare Workers.
 * Keeps GITHUB_CLIENT_SECRET secure on the server side - never in the extension bundle.
 */

const https = require('https');
const url = require('url');

// Environment variables configured on your hosting platform
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';

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
async function handleRequest(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // CORS headers
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

    if (!GITHUB_CLIENT_ID) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Server Error: GITHUB_CLIENT_ID is not configured.');
      return;
    }

    // Embed extension redirect_uri inside state parameter so we know where to return
    const combinedState = encodeURIComponent(
      JSON.stringify({
        ext_redirect: extensionRedirect,
        nonce: stateParam || Math.random().toString(36).substring(2),
      })
    );

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['host'];
    const brokerCallbackUrl = `${protocol}://${host}/callback`;

    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=repo&redirect_uri=${encodeURIComponent(
      brokerCallbackUrl
    )}&state=${combinedState}`;

    res.writeHead(302, { Location: githubAuthUrl });
    res.end();
    return;
  }

  // 2. /callback - Handle GitHub OAuth return and exchange code for access_token
  if (pathname === '/callback' || pathname === '/api/callback') {
    const code = query.code;
    const rawState = query.state;

    let extensionRedirectUri = '';
    if (rawState) {
      try {
        const decoded = JSON.parse(decodeURIComponent(rawState));
        extensionRedirectUri = decoded.ext_redirect;
      } catch (e) {
        // State might not be JSON
      }
    }

    if (!code) {
      const errorMsg = query.error_description || query.error || 'Missing authorization code';
      if (extensionRedirectUri) {
        res.writeHead(302, {
          Location: `${extensionRedirectUri}?error=${encodeURIComponent(errorMsg)}`,
        });
        res.end();
        return;
      }
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end(`Authentication Error: ${errorMsg}`);
      return;
    }

    try {
      const tokenResponse = await exchangeCodeForToken(code);

      if (tokenResponse.error || !tokenResponse.access_token) {
        const err = tokenResponse.error_description || tokenResponse.error || 'Failed to exchange token';
        if (extensionRedirectUri) {
          res.writeHead(302, {
            Location: `${extensionRedirectUri}?error=${encodeURIComponent(err)}`,
          });
          res.end();
          return;
        }
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end(`Token Exchange Error: ${err}`);
        return;
      }

      const accessToken = tokenResponse.access_token;

      // Redirect back to Chrome extension with access token
      if (extensionRedirectUri) {
        const separator = extensionRedirectUri.includes('?') ? '&' : '?';
        const finalRedirect = `${extensionRedirectUri}${separator}access_token=${accessToken}`;
        res.writeHead(302, { Location: finalRedirect });
        res.end();
        return;
      }

      // If no redirect URI provided, return token as JSON
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ access_token: accessToken }));
    } catch (err) {
      console.error('Broker exchange error:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Internal Server Error: ${err.message}`);
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

// Export for serverless (Vercel)
module.exports = handleRequest;

// If executed directly with `node broker/index.js`
if (require.main === module) {
  const http = require('http');
  const port = process.env.PORT || 3000;
  const server = http.createServer(handleRequest);
  server.listen(port, () => {
    console.log(`LeetCode GitHub Sync OAuth Broker running at http://localhost:${port}`);
  });
}
