import { MESSAGES } from '../shared/constants';
import {
  SyncHistoryItem,
  ExtensionSettings,
  GitHubUser,
  ConnectionState,
  PendingQueueItem,
} from '../shared/types';
import { escapeHtml } from '../utils/sanitize';

document.addEventListener('DOMContentLoaded', async () => {
  const connectedView = document.getElementById('connected-view') as HTMLElement;
  const disconnectedView = document.getElementById('disconnected-view') as HTMLElement;

  const githubUserBadge = document.getElementById('github-user-badge') as HTMLElement;
  const repoDisplay = document.getElementById('repo-display') as HTMLElement;
  const repoVerifiedRow = document.getElementById('repo-verified-row') as HTMLElement;
  const branchDisplay = document.getElementById('branch-display') as HTMLElement;
  const lastSyncDisplay = document.getElementById('last-sync-display') as HTMLElement;
  const recentList = document.getElementById('recent-list') as HTMLElement;

  const pendingSection = document.getElementById('pending-section') as HTMLElement;
  const pendingCountBadge = document.getElementById('pending-count-badge') as HTMLElement;
  const pendingList = document.getElementById('pending-list') as HTMLElement;

  const openGithubBtn = document.getElementById('open-github-btn') as HTMLButtonElement;
  const openSettingsIcon = document.getElementById('open-settings-icon') as HTMLButtonElement;
  const changeRepoBtn = document.getElementById('change-repo-btn') as HTMLButtonElement;
  const disconnectPopupBtn = document.getElementById('disconnect-popup-btn') as HTMLButtonElement;
  const connectBtn = document.getElementById('connect-btn') as HTMLButtonElement;
  const authErrorHint = document.getElementById('auth-error-hint') as HTMLElement;

  const openOptions = () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('src/options/options.html'));
    }
  };

  openSettingsIcon?.addEventListener('click', openOptions);
  changeRepoBtn?.addEventListener('click', openOptions);

  // Connect GitHub via OAuth
  connectBtn?.addEventListener('click', () => {
    connectBtn.disabled = true;
    connectBtn.textContent = 'Connecting with GitHub...';
    if (authErrorHint) authErrorHint.style.display = 'none';

    chrome.runtime.sendMessage({ type: MESSAGES.START_OAUTH_FLOW }, (res) => {
      connectBtn.disabled = false;
      connectBtn.textContent = 'Connect GitHub';

      if (!res || !res.success) {
        if (authErrorHint) {
          authErrorHint.textContent = res?.error || 'OAuth authorization was cancelled or failed.';
          authErrorHint.style.display = 'block';
        }
        return;
      }

      // Authorization succeeded! Reload authoritative status
      renderStatus();
      // If repo not yet configured, guide user to options page
      openOptions();
    });
  });

  // Disconnect GitHub
  disconnectPopupBtn?.addEventListener('click', () => {
    disconnectPopupBtn.disabled = true;
    disconnectPopupBtn.textContent = 'Disconnecting...';
    chrome.runtime.sendMessage({ type: MESSAGES.DISCONNECT_GITHUB }, () => {
      connectedView.style.display = 'none';
      disconnectedView.style.display = 'block';
      disconnectPopupBtn.disabled = false;
      disconnectPopupBtn.textContent = 'Disconnect';
    });
  });

  function applyTheme(theme?: 'light' | 'dark' | 'system') {
    if (theme === 'dark' || theme === 'light') {
      document.documentElement.setAttribute('data-theme', theme);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  const renderStatus = () => {
    chrome.runtime.sendMessage(
      { type: MESSAGES.GET_STATUS },
      (response: {
        isConnected: boolean;
        isRepoVerified?: boolean;
        user: GitHubUser | null;
        settings: ExtensionSettings;
        connectionState?: ConnectionState;
        recentSolutions: SyncHistoryItem[];
        pendingQueue?: PendingQueueItem[];
      }) => {
        if (response?.settings?.theme) {
          applyTheme(response.settings.theme);
        }

        if (chrome.runtime.lastError || !response || !response.isConnected) {
          connectedView.style.display = 'none';
          disconnectedView.style.display = 'block';
          return;
        }

        const { settings, recentSolutions, connectionState, user, isRepoVerified, pendingQueue } = response;
        connectedView.style.display = 'block';
        disconnectedView.style.display = 'none';

        const username = connectionState?.githubUsername || user?.login;
        if (githubUserBadge) {
          githubUserBadge.textContent = username ? `Connected as @${username}` : 'Connected';
        }

        const owner = connectionState?.repositoryOwner || settings.repoConfig.owner;
        const repo = connectionState?.repositoryName || settings.repoConfig.repo;

        if (owner && repo) {
          repoDisplay.textContent = `✓ ${owner}/${repo}`;
          if (isRepoVerified || connectionState?.repositoryVerified || settings.repoConfig.verified) {
            repoVerifiedRow.style.display = 'flex';
          } else {
            repoVerifiedRow.style.display = 'none';
          }
        } else {
          repoDisplay.textContent = 'No repository linked';
          repoVerifiedRow.style.display = 'none';
        }

        branchDisplay.textContent = connectionState?.selectedBranch || settings.repoConfig.branch || 'main';

        // Render Pending Queue if any
        if (pendingQueue && pendingQueue.length > 0) {
          pendingSection.style.display = 'block';
          pendingCountBadge.textContent = String(pendingQueue.length);
          pendingList.innerHTML = '';

          pendingQueue.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'recent-item';
            row.style.flexDirection = 'column';
            row.style.alignItems = 'flex-start';
            row.style.gap = '6px';
            row.style.borderLeft = '3px solid #f59e0b';

            const title = item.request.submission.problem.title;
            const fileName = item.request.customSolutionName || 'solution';
            const errorMsg = item.error || 'Temporary error';

            row.innerHTML = `
              <div style="display: flex; justify-content: space-between; width: 100%; font-size: 13px; font-weight: 600;">
                <span>${escapeHtml(title)}</span>
                <span style="font-size: 11px; color: #b45309;">Retries: ${item.retryCount}</span>
              </div>
              <div style="font-size: 11px; color: #64748b; font-family: monospace;">${escapeHtml(fileName)}</div>
              <div style="font-size: 11px; color: #b91c1c;">${escapeHtml(errorMsg)}</div>
              <div style="display: flex; gap: 6px; margin-top: 4px;">
                <button class="btn btn-secondary retry-btn" style="padding: 3px 8px; font-size: 11px;">Retry</button>
                <button class="btn btn-secondary remove-btn" style="padding: 3px 8px; font-size: 11px; color: #dc2626;">Remove</button>
              </div>
            `;

            row.querySelector('.retry-btn')?.addEventListener('click', (e) => {
              e.stopPropagation();
              const btn = e.target as HTMLButtonElement;
              btn.disabled = true;
              btn.textContent = 'Retrying...';
              chrome.runtime.sendMessage({ type: MESSAGES.RETRY_QUEUE_ITEM, payload: { id: item.id } }, () => {
                renderStatus();
              });
            });

            row.querySelector('.remove-btn')?.addEventListener('click', (e) => {
              e.stopPropagation();
              chrome.runtime.sendMessage({ type: MESSAGES.CLEAR_QUEUE_ITEM, payload: { id: item.id } }, () => {
                renderStatus();
              });
            });

            pendingList.appendChild(row);
          });
        } else {
          pendingSection.style.display = 'none';
        }

        // Render Recent Solutions
        if (recentSolutions && recentSolutions.length > 0) {
          const last = recentSolutions[0];
          const minsAgo = Math.max(0, Math.floor((Date.now() - last.timestamp) / 60000));
          lastSyncDisplay.textContent = minsAgo === 0 ? 'Just now' : `${minsAgo} min ago`;

          recentList.innerHTML = '';
          recentSolutions.forEach((sol) => {
            const item = document.createElement('a');
            item.className = 'recent-item';
            item.href = sol.githubUrl;
            item.target = '_blank';
            item.rel = 'noreferrer';
            item.title = `View ${sol.fileName} on GitHub`;

            const name = escapeHtml(`${sol.solutionName} (${sol.problemTitle})`);
            item.innerHTML = `
              <span class="recent-name">${name}</span>
              <span class="recent-check">✓</span>
            `;
            recentList.appendChild(item);
          });
        } else {
          lastSyncDisplay.textContent = 'Never';
          recentList.innerHTML = '<div class="empty-state">No solutions synced yet</div>';
        }

        if (openGithubBtn) {
          openGithubBtn.onclick = () => {
            if (owner && repo) {
              window.open(`https://github.com/${owner}/${repo}`, '_blank');
            } else {
              openOptions();
            }
          };
        }
      }
    );
  };

  renderStatus();
});
