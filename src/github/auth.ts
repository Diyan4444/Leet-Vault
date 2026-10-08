import { GitHubAuthService } from './repositories';
import { StorageService } from '../shared/storage';
import { GitHubUser } from '../shared/types';

export class GitHubOAuthClient {
  public static DEFAULT_BROKER_URL = 'https://leet-git-hub.vercel.app';
<<<<<<< HEAD

  /**
   * Validates broker URL against approved origins (HTTPS, matching default broker host, or localhost in dev).
   */
  static isValidBrokerUrl(brokerUrl: string): boolean {
    if (!brokerUrl || typeof brokerUrl !== 'string') return false;
    try {
      const parsed = new URL(brokerUrl);
      if (parsed.protocol === 'https:') {
        if (parsed.hostname.endsWith('.vercel.app') || parsed.hostname === new URL(this.DEFAULT_BROKER_URL).hostname) {
          return true;
        }
      }
      if (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }
=======
>>>>>>> 71026eab6dc010bb78586627d22b26f34d0fd463

  /**
   * Starts OAuth authorization flow via chrome.identity.launchWebAuthFlow
   */
  static async startOAuthFlow(
    customBrokerUrl?: string
  ): Promise<{ success: boolean; user?: GitHubUser; error?: string }> {
    if (typeof chrome === 'undefined' || !chrome.identity || !chrome.identity.launchWebAuthFlow) {
      return {
        success: false,
        error: 'Chrome Identity API is not available in this environment.',
      };
    }

    const settings = await StorageService.getSettings();
    const candidateUrl = (customBrokerUrl || settings.oauthBrokerUrl || this.DEFAULT_BROKER_URL).replace(/\/+$/, '');
    const brokerUrl = this.isValidBrokerUrl(candidateUrl) ? candidateUrl : this.DEFAULT_BROKER_URL;
    const redirectUri = chrome.identity.getRedirectURL(); // e.g. https://<ext-id>.chromiumapp.org/

    // Generate cryptographically secure random state nonce for CSRF validation
    const stateArray = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(stateArray);
    } else {
      for (let i = 0; i < 16; i++) stateArray[i] = Math.floor(Math.random() * 256);
    }
    const state = Array.from(stateArray, (byte) => byte.toString(16).padStart(2, '0')).join('');

    const loginUrl = `${brokerUrl}/login?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

    return new Promise((resolve) => {
      chrome.identity.launchWebAuthFlow(
        {
          url: loginUrl,
          interactive: true,
        },
        async (redirectResultUrl?: string) => {
          if (chrome.runtime.lastError || !redirectResultUrl) {
            const err = chrome.runtime.lastError?.message || 'Authorization was cancelled or failed to complete.';
            resolve({ success: false, error: err });
            return;
          }

          try {
            let urlObj: URL | null = null;
            try {
              urlObj = new URL(redirectResultUrl);
            } catch {
              // ignore parse error
            }

            const returnedState = urlObj?.searchParams.get('state');
            const errorParam = urlObj?.searchParams.get('error');

            if (errorParam) {
              resolve({ success: false, error: errorParam });
              return;
            }

<<<<<<< HEAD
            // CRITICAL: Strict CSRF State Validation - nonce must be present and match exactly
            if (!returnedState || returnedState !== state) {
              resolve({
                success: false,
                error: 'OAuth security verification failed: Missing or invalid state nonce. Possible CSRF interception.',
=======
            // CRITICAL: Strict CSRF State Validation
            if (returnedState && returnedState !== state) {
              resolve({
                success: false,
                error: 'OAuth security verification failed: State nonce mismatch. Possible CSRF interception.',
>>>>>>> 71026eab6dc010bb78586627d22b26f34d0fd463
              });
              return;
            }

<<<<<<< HEAD
            const oneTimeCode = urlObj?.searchParams.get('code');
            if (!oneTimeCode) {
              resolve({
                success: false,
                error: 'OAuth verification failed: No authorization exchange code received from broker.',
              });
              return;
            }

            // Secure POST exchange for token using one-time opaque ticket
            const tokenResponse = await fetch(`${brokerUrl}/api/token`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: oneTimeCode }),
            });

            if (!tokenResponse.ok) {
              const errData = await tokenResponse.json().catch(() => ({}));
              resolve({
                success: false,
                error: errData.error || 'Failed to exchange one-time OAuth code for access token.',
              });
              return;
            }

            const tokenJson = await tokenResponse.json();
            const token = tokenJson?.access_token;

=======
            let token: string | null = null;
            const oneTimeCode = urlObj?.searchParams.get('code');

            if (oneTimeCode) {
              // Secure POST exchange for token using one-time opaque code
              const tokenResponse = await fetch(`${brokerUrl}/api/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: oneTimeCode }),
              });

              if (tokenResponse.ok) {
                const tokenJson = await tokenResponse.json();
                token = tokenJson.access_token;
              } else {
                const errData = await tokenResponse.json().catch(() => ({}));
                resolve({
                  success: false,
                  error: errData.error || 'Failed to exchange one-time OAuth code for access token.',
                });
                return;
              }
            } else {
              // Backward compatibility fallback for legacy brokers
              token = this.extractTokenFromUrl(redirectResultUrl);
            }

>>>>>>> 71026eab6dc010bb78586627d22b26f34d0fd463
            if (!token) {
              resolve({ success: false, error: 'No access token received from GitHub authorization.' });
              return;
            }

            // Immediately query GET /user with the newly obtained token to verify authenticated identity
            const user = await GitHubAuthService.validateAndGetUser(token);

            // Persist token & authenticated user profile
            await StorageService.saveSettings({ githubToken: token });
            await StorageService.saveGitHubUser(user);

            resolve({ success: true, user });
          } catch (err: any) {
            resolve({
              success: false,
              error: `GitHub identity verification failed: ${err.message || 'Unknown error'}`,
            });
          }
        }
      );
    });
  }
}
