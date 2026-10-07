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
    const state = Math.random().toString(36).substring(2);

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
            const token = this.extractTokenFromUrl(redirectResultUrl);
            if (!token) {
              let errorParam = 'No access token received from GitHub authorization.';
              try {
                const urlObj = new URL(redirectResultUrl);
                errorParam = urlObj.searchParams.get('error') || errorParam;
              } catch {
                // Ignore url parse error
              }
              resolve({ success: false, error: errorParam });
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
