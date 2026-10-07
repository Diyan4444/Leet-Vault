import { MESSAGES } from '../shared/constants';
import { StorageService } from '../shared/storage';
import { GitHubAuthService, GitHubRepositoriesService } from '../github/repositories';
import { GitHubOAuthClient } from '../github/auth';
import { SyncManager } from '../sync/sync-manager';
import { DuplicateDetector } from '../sync/duplicate-detector';
import { SyncRequest } from '../shared/types';

// Handle Extension Lifecycle
if (typeof chrome !== 'undefined' && chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('[LeetCode GitHub Sync] Extension installed/updated:', details.reason);
    const settings = await StorageService.getSettings();
    await StorageService.saveSettings(settings);

    if (chrome.alarms) {
      chrome.alarms.create('AUTO_RETRY_PENDING_QUEUE', {
        periodInMinutes: 5,
      });
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onStartup) {
  chrome.runtime.onStartup.addListener(async () => {
    if (chrome.alarms) {
      chrome.alarms.create('AUTO_RETRY_PENDING_QUEUE', {
        periodInMinutes: 5,
      });
    }
    try {
      await SyncManager.processPendingQueueAutoRetry(5);
    } catch (err) {
      console.warn('[Service Worker] Startup auto-retry error:', err);
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.alarms) {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'AUTO_RETRY_PENDING_QUEUE') {
      try {
        const result = await SyncManager.processPendingQueueAutoRetry(5);
        if (result.processed > 0) {
          console.log('[Service Worker] Auto-retry completed:', result);
        }
      } catch (err) {
        console.warn('[Service Worker] Auto-retry alarm error:', err);
      }
    }
  });
}

export function validatePayload(type: string, payload: any): string | null {
  const isParameterless =
    type === MESSAGES.START_OAUTH_FLOW ||
    type === MESSAGES.GET_SETTINGS ||
    type === MESSAGES.OPEN_OPTIONS_PAGE ||
    type === 'OPEN_OPTIONS_PAGE' ||
    type === MESSAGES.GET_STATUS ||
    type === MESSAGES.FETCH_REPOSITORIES ||
    type === MESSAGES.DISCONNECT_GITHUB ||
    type === MESSAGES.GET_PENDING_QUEUE;

  if (!payload && !isParameterless) {
    return 'Missing message payload';
  }
  switch (type) {
    case MESSAGES.GET_DIRECTORY_STATE:
      if (!payload || typeof payload.problemId !== 'string' || typeof payload.problemSlug !== 'string') {
        return 'Invalid payload for GET_DIRECTORY_STATE: problemId and problemSlug must be strings';
      }
      break;
    case MESSAGES.CHECK_DUPLICATE_CODE:
      if (!payload || typeof payload.code !== 'string' || !Array.isArray(payload.files)) {
        return 'Invalid payload for CHECK_DUPLICATE_CODE: code must be string and files must be an array';
      }
      break;
    case MESSAGES.SYNC_SOLUTION:
      if (!payload?.submission?.code || !payload?.submission?.problem?.id || !payload?.submission?.language) {
        return 'Invalid payload for SYNC_SOLUTION: submission with code, problem.id, and language required';
      }
      break;
    case MESSAGES.FETCH_BRANCHES:
    case MESSAGES.VERIFY_AND_LINK_REPOSITORY:
      if (!payload || typeof payload.owner !== 'string' || typeof payload.repo !== 'string') {
        return `Invalid payload for ${type}: owner and repo must be strings`;
      }
      break;
    case MESSAGES.RETRY_QUEUE_ITEM:
    case MESSAGES.CLEAR_QUEUE_ITEM:
      if (!payload || typeof payload.id !== 'string') {
        return `Invalid payload for ${type}: id must be a string`;
      }
      break;
    case MESSAGES.VALIDATE_GITHUB_TOKEN:
      if (!payload || typeof payload.token !== 'string') {
        return 'Invalid payload for VALIDATE_GITHUB_TOKEN: token must be a string';
      }
      break;
    case MESSAGES.SAVE_SETTINGS:
      if (!payload) {
        return 'Invalid payload for SAVE_SETTINGS: settings payload required';
      }
      break;
  }
  return null;
}

// Centralized message dispatcher in Service Worker
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Use async self-invoking function and return true to keep message channel alive
  (async () => {
    try {
      const validationError = validatePayload(message.type, message.payload);
      if (validationError) {
        sendResponse({ error: validationError });
        return;
      }

      switch (message.type) {
        case MESSAGES.OPEN_OPTIONS_PAGE:
        case 'OPEN_OPTIONS_PAGE': {
          if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
          }
          sendResponse({ success: true });
          break;
        }

        case MESSAGES.GET_SETTINGS: {
          const settings = await StorageService.getSettings();
          sendResponse({ settings });
          break;
        }

        case MESSAGES.SAVE_SETTINGS: {
          const updated = await StorageService.saveSettings(message.payload?.settings || message.payload || {});
          sendResponse({ success: true, settings: updated });
          break;
        }

        case MESSAGES.GET_DIRECTORY_STATE: {
          const { problemId, problemSlug } = message.payload;
          const state = await SyncManager.getProblemDirectoryState(problemId, problemSlug);
          sendResponse({ state });
          break;
        }

        case MESSAGES.CHECK_DUPLICATE_CODE: {
          const { code, files } = message.payload;
          const settings = await StorageService.getSettings();
          const dupResult = await DuplicateDetector.checkDuplicateCode(
            code,
            files,
            settings.githubToken || '',
            settings.repoConfig.owner,
            settings.repoConfig.repo,
            settings.repoConfig.branch
          );
          sendResponse({ dupResult });
          break;
        }

        case MESSAGES.SYNC_SOLUTION: {
          const request: SyncRequest = message.payload;
          const result = await SyncManager.syncSolution(request);
          sendResponse({ result });
          break;
        }

        case MESSAGES.START_OAUTH_FLOW: {
          const brokerUrl = message.payload?.brokerUrl;
          const authResult = await GitHubOAuthClient.startOAuthFlow(brokerUrl);
          sendResponse(authResult);
          break;
        }

        case MESSAGES.VALIDATE_GITHUB_TOKEN: {
          const { token } = message.payload;
          const user = await GitHubAuthService.validateAndGetUser(token);
          await StorageService.saveGitHubUser(user);
          await StorageService.saveSettings({ githubToken: token });
          sendResponse({ success: true, user });
          break;
        }

        case MESSAGES.FETCH_REPOSITORIES: {
          const settings = await StorageService.getSettings();
          if (!settings.githubToken) {
            sendResponse({ repos: [] });
            return;
          }
          const repos = await GitHubRepositoriesService.listRepositories(settings.githubToken);
          sendResponse({ repos });
          break;
        }

        case MESSAGES.FETCH_BRANCHES: {
          const { owner, repo } = message.payload;
          const settings = await StorageService.getSettings();
          if (!settings.githubToken) {
            sendResponse({ branches: [] });
            return;
          }
          const branches = await GitHubRepositoriesService.listBranches(
            settings.githubToken,
            owner,
            repo
          );
          sendResponse({ branches });
          break;
        }

        case MESSAGES.VERIFY_AND_LINK_REPOSITORY: {
          const { owner, repo, branch, rootFolder } = message.payload;
          const settings = await StorageService.getSettings();
          const user = await StorageService.getGitHubUser();

          if (!settings.githubToken) {
            sendResponse({
              success: false,
              error: 'GitHub account not authenticated. Please connect your GitHub account first.',
            });
            return;
          }

          // Authoritative verification using GitHub authenticated API
          const verification = await GitHubRepositoriesService.verifyRepoWriteAccess(
            settings.githubToken,
            owner,
            repo,
            {
              ownerOnly: settings.ownerOnlyMode,
              currentUsername: user?.login,
            }
          );

          if (!verification.hasWriteAccess) {
            // Invalidate any existing verification
            await StorageService.saveSettings({
              repoConfig: {
                ...settings.repoConfig,
                verified: false,
              },
            });
            sendResponse({
              success: false,
              error: verification.error || 'Repository access denied. Write permission required.',
            });
            return;
          }

          // Verified with write permissions! Save authoritative repository state
          const verifiedBranch = branch || verification.repoItem?.default_branch || 'main';
          const updatedSettings = await StorageService.saveSettings({
            repoConfig: {
              owner,
              repo,
              branch: verifiedBranch,
              rootFolder: rootFolder || '',
              verified: true,
              verifiedAt: Date.now(),
            },
          });

          sendResponse({
            success: true,
            isOwner: verification.isOwner,
            repoItem: verification.repoItem,
            settings: updatedSettings,
          });
          break;
        }

        case MESSAGES.DISCONNECT_GITHUB: {
          // Clear authenticated user, token, and linked repository
          await StorageService.saveGitHubUser(null);
          await StorageService.saveSettings({
            githubToken: undefined,
            repoConfig: {
              owner: '',
              repo: '',
              branch: 'main',
              rootFolder: '',
              verified: false,
              verifiedAt: undefined,
            },
          });
          sendResponse({ success: true });
          break;
        }

        case MESSAGES.GET_STATUS: {
          const { connection, settings, user, pendingQueue, recentSolutions } =
            await StorageService.getAuthoritativeStatus();

          sendResponse({
            isConnected: connection.connected,
            isRepoVerified: connection.repositoryVerified,
            user,
            settings,
            connectionState: connection,
            recentSolutions: recentSolutions.slice(0, 5),
            pendingQueue,
          });
          break;
        }

        case MESSAGES.GET_PENDING_QUEUE: {
          const queue = await StorageService.getPendingQueue();
          sendResponse({ queue });
          break;
        }

        case MESSAGES.RETRY_QUEUE_ITEM: {
          const { id } = message.payload;
          const result = await SyncManager.retryPendingItem(id);
          sendResponse({ result });
          break;
        }

        case MESSAGES.CLEAR_QUEUE_ITEM: {
          const { id } = message.payload;
          await StorageService.removePendingItem(id);
          sendResponse({ success: true });
          break;
        }

        default:
          sendResponse({ error: `Unknown message type: ${message.type}` });
      }
    } catch (err: unknown) {
      console.error('[Service Worker] Error handling message:', message.type, err);
      sendResponse({ error: (err as Error).message });
    }
  })();

  return true; // Keep message channel open for async response
  });
}
