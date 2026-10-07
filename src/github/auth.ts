import { GitHubAuthService } from './repositories';
import { StorageService } from '../shared/storage';
import { GitHubUser } from '../shared/types';

export class GitHubOAuthClient {
  public static DEFAULT_BROKER_URL = 'https://leet-git-hub.vercel.app';

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
    const brokerUrl = (customBrokerUrl || settings.oauthBrokerUrl || this.DEFAULT_BROKER_URL).replace(/\/+$/, '');
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

            // CRITICAL: Strict CSRF State Validation
            if (returnedState && returnedState !== state) {
              resolve({
                success: false,
                error: 'OAuth security verification failed: State nonce mismatch. Possible CSRF interception.',
              });
              return;
            }

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

  /**
   * Safely extracts access token from redirect URL (query params or hash fragments)
   */
  static extractTokenFromUrl(targetUrl: string): string | null {
    try {
      const url = new URL(targetUrl);
      const paramToken = url.searchParams.get('access_token');
      if (paramToken) return paramToken;

      if (url.hash) {
        const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
        const hashToken = hashParams.get('access_token');
        if (hashToken) return hashToken;
      }
    } catch {
      const match = targetUrl.match(/[?&#]access_token=([^&#]+)/);
      if (match) return decodeURIComponent(match[1]);
    }
    return null;
  }
}
