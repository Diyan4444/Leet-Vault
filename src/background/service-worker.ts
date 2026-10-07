import { MESSAGES } from '../shared/constants';
import { StorageService } from '../shared/storage';
import { GitHubAuthService, GitHubRepositoriesService } from '../github/repositories';
import { SyncManager } from '../sync/sync-manager';
import { DuplicateDetector } from '../sync/duplicate-detector';
import { SyncRequest } from '../shared/types';

// Handle Extension Lifecycle
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[LeetCode GitHub Sync] Extension installed/updated:', details.reason);
  // Ensure default settings exist in storage
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

        case MESSAGES.GET_STATUS: {
          const settings = await StorageService.getSettings();
          const user = await StorageService.getGitHubUser();
          const history = await StorageService.getSyncHistory();
          const isConnected = !!(settings.githubToken && settings.repoConfig.repo);
          sendResponse({
            isConnected,
            user,
            settings,
            recentSolutions: history.slice(0, 5),
          });
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
