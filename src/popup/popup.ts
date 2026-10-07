import { MESSAGES } from '../shared/constants';
import { SyncHistoryItem, ExtensionSettings, GitHubUser } from '../shared/types';

document.addEventListener('DOMContentLoaded', async () => {
  const connectedView = document.getElementById('connected-view') as HTMLElement;
  const disconnectedView = document.getElementById('disconnected-view') as HTMLElement;

  const repoDisplay = document.getElementById('repo-display') as HTMLElement;
  const branchDisplay = document.getElementById('branch-display') as HTMLElement;
  const lastSyncDisplay = document.getElementById('last-sync-display') as HTMLElement;
  const recentList = document.getElementById('recent-list') as HTMLElement;

  const openGithubBtn = document.getElementById('open-github-btn') as HTMLButtonElement;
  const openSettingsBtn = document.getElementById('open-settings-btn') as HTMLButtonElement;
  const openSettingsIcon = document.getElementById('open-settings-icon') as HTMLButtonElement;
  const connectBtn = document.getElementById('connect-btn') as HTMLButtonElement;

  const openOptions = () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('src/options/options.html'));
    }
  };

  openSettingsBtn?.addEventListener('click', openOptions);
  openSettingsIcon?.addEventListener('click', openOptions);
  connectBtn?.addEventListener('click', openOptions);

  // Request status from Service Worker
  chrome.runtime.sendMessage(
    { type: MESSAGES.GET_STATUS },
    (response: {
      isConnected: boolean;
      user: GitHubUser | null;
      settings: ExtensionSettings;
      recentSolutions: SyncHistoryItem[];
    }) => {
      if (chrome.runtime.lastError || !response || !response.isConnected) {
        connectedView.style.display = 'none';
        disconnectedView.style.display = 'block';
        return;
      }

      const { settings, recentSolutions } = response;
      connectedView.style.display = 'block';
      disconnectedView.style.display = 'none';

      const ownerRepo = `${settings.repoConfig.owner} / ${settings.repoConfig.repo}`;
      repoDisplay.textContent = ownerRepo;
      branchDisplay.textContent = settings.repoConfig.branch || 'main';

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

          item.innerHTML = `
            <span class="recent-name">${sol.solutionName} (${sol.problemTitle})</span>
            <span class="recent-check">✓</span>
          `;
          recentList.appendChild(item);
        });
      } else {
        lastSyncDisplay.textContent = 'Never';
        recentList.innerHTML = '<div class="empty-state">No solutions synced yet</div>';
      }

      openGithubBtn.addEventListener('click', () => {
        const repoUrl = `https://github.com/${settings.repoConfig.owner}/${settings.repoConfig.repo}`;
        window.open(repoUrl, '_blank');
      });
    }
  );
});
