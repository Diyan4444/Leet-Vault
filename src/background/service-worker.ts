import { MESSAGES } from '../shared/constants';
import { StorageService } from '../shared/storage';
import { GitHubAuthService, GitHubRepositoriesService } from '../github/repositories';
import { GitHubOAuthClient } from '../github/auth';
import { SyncManager } from '../sync/sync-manager';
import { DuplicateDetector } from '../sync/duplicate-detector';
import { SyncRequest } from '../shared/types';

// Handle Extension Lifecycle
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[LeetCode GitHub Sync] Extension installed/updated:', details.reason);
  const settings = await StorageService.getSettings();
  await StorageService.saveSettings(settings);
});

// Centralized message dispatcher in Service Worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Use async self-invoking function and return true to keep message channel alive
  (async () => {
    try {
      switch (message.type) {
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
          const settings = await StorageService.getSettings();
          const user = await StorageService.getGitHubUser();
          const history = await StorageService.getSyncHistory();
          const pendingQueue = await StorageService.getPendingQueue();

          // Authoritative connection check:
          // Must have valid token AND authenticated user
          const isConnected = !!(settings.githubToken && user && user.login);
          const isRepoVerified = !!(isConnected && settings.repoConfig.owner && settings.repoConfig.repo && settings.repoConfig.verified);

          sendResponse({
            isConnected,
            isRepoVerified,
            user,
            settings,
            connectionState: {
              connected: isConnected,
              githubUsername: user?.login,
              githubUserId: user?.id,
              githubAvatarUrl: user?.avatarUrl,
              repositoryOwner: settings.repoConfig.owner,
              repositoryName: settings.repoConfig.repo,
              repositoryUrl: settings.repoConfig.owner && settings.repoConfig.repo
                ? `https://github.com/${settings.repoConfig.owner}/${settings.repoConfig.repo}`
                : undefined,
              repositoryVerified: isRepoVerified,
              hasPushAccess: isRepoVerified,
              selectedBranch: settings.repoConfig.branch || 'main',
              verifiedAt: settings.repoConfig.verifiedAt,
              lastVerifiedAt: settings.repoConfig.verifiedAt,
            },
            recentSolutions: history.slice(0, 5),
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
