import { StorageService } from '../shared/storage';
import { MESSAGES } from '../shared/constants';
import { ExtensionSettings, GitHubUser } from '../shared/types';
import { parseGitHubRepoUrl } from '../utils/sanitize';
import { GitHubBranchItem } from '../github/types';

document.addEventListener('DOMContentLoaded', async () => {
  const repoUrlInput = document.getElementById('repo-url-input') as HTMLInputElement;
  const connectGithubBtn = document.getElementById('connect-github-btn') as HTMLButtonElement;
  const connectionStatusBox = document.getElementById('connection-status-box') as HTMLElement;
  const linkedRepoName = document.getElementById('linked-repo-name') as HTMLElement;
  const disconnectBtn = document.getElementById('disconnect-btn') as HTMLButtonElement;

  const branchSelect = document.getElementById('branch-select') as HTMLSelectElement;
  const rootFolderInput = document.getElementById('root-folder-input') as HTMLInputElement;

  const syncAcceptedToggle = document.getElementById('sync-accepted-toggle') as HTMLInputElement;
  const duplicateDetectionToggle = document.getElementById('duplicate-detection-toggle') as HTMLInputElement;
  const autoSyncToggle = document.getElementById('auto-sync-toggle') as HTMLInputElement;

  const problemReadmeToggle = document.getElementById('problem-readme-toggle') as HTMLInputElement;
  const rootReadmeToggle = document.getElementById('root-readme-toggle') as HTMLInputElement;

  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
  const saveSettingsBtn = document.getElementById('save-settings-btn') as HTMLButtonElement;
  const statusBanner = document.getElementById('status-banner') as HTMLElement;

  const showBanner = (msg: string, type: 'success' | 'error') => {
    statusBanner.className = `banner banner-${type}`;
    statusBanner.textContent = msg;
    statusBanner.style.display = 'block';
    setTimeout(() => {
      statusBanner.style.display = 'none';
    }, 4000);
  };

  // 1. Load initial settings
  const currentSettings = await StorageService.getSettings();
  const currentUser = await StorageService.getGitHubUser();

  if (currentSettings.repoConfig.owner && currentSettings.repoConfig.repo) {
    const fullRepoUrl = `https://github.com/${currentSettings.repoConfig.owner}/${currentSettings.repoConfig.repo}`;
    repoUrlInput.value = fullRepoUrl;
    showConnectedState(currentSettings.repoConfig.owner, currentSettings.repoConfig.repo);
    await loadBranches(currentSettings.repoConfig.owner, currentSettings.repoConfig.repo, currentSettings.repoConfig.branch);
  }

  rootFolderInput.value = currentSettings.repoConfig.rootFolder || '';
  syncAcceptedToggle.checked = currentSettings.syncOnlyAccepted;
  duplicateDetectionToggle.checked = currentSettings.duplicateDetection;
  autoSyncToggle.checked = currentSettings.autoSync;
  problemReadmeToggle.checked = currentSettings.generateProblemReadme;
  rootReadmeToggle.checked = currentSettings.updateRootReadme;
  themeSelect.value = currentSettings.theme || 'system';

  function showConnectedState(owner: string, repo: string) {
    connectionStatusBox.style.display = 'flex';
    linkedRepoName.textContent = `${owner}/${repo}`;
    connectGithubBtn.textContent = 'Linked';
    connectGithubBtn.classList.remove('btn-primary');
    connectGithubBtn.classList.add('btn-secondary');
  }

  function showDisconnectedState() {
    connectionStatusBox.style.display = 'none';
    linkedRepoName.textContent = '';
    connectGithubBtn.textContent = 'Connect GitHub';
    connectGithubBtn.classList.remove('btn-secondary');
    connectGithubBtn.classList.add('btn-primary');
  }

  async function loadBranches(owner: string, repo: string, selectedBranchName = 'main') {
    branchSelect.innerHTML = '<option value="main">Loading branches...</option>';
    return new Promise<void>((resolve) => {
      chrome.runtime.sendMessage(
        { type: MESSAGES.FETCH_BRANCHES, payload: { owner, repo } },
        (res: { branches?: GitHubBranchItem[]; error?: string }) => {
          branchSelect.innerHTML = '';
          if (res && res.branches && res.branches.length > 0) {
            res.branches.forEach((b) => {
              const opt = document.createElement('option');
              opt.value = b.name;
              opt.textContent = b.name;
              if (b.name === selectedBranchName) {
                opt.selected = true;
              }
              branchSelect.appendChild(opt);
            });
          } else {
            const opt = document.createElement('option');
            opt.value = selectedBranchName || 'main';
            opt.textContent = selectedBranchName || 'main';
            branchSelect.appendChild(opt);
          }
          resolve();
        }
      );
    });
  }

  // Connect GitHub / Link Repo Handler
  connectGithubBtn.addEventListener('click', async () => {
    const rawUrl = repoUrlInput.value.trim();
    if (!rawUrl) {
      showBanner('Please enter a GitHub repository URL.', 'error');
      return;
    }

    const parsed = parseGitHubRepoUrl(rawUrl);
    if (!parsed) {
      showBanner('Invalid GitHub URL. Expected: https://github.com/USERNAME/REPOSITORY', 'error');
      return;
    }

    const { owner, repo } = parsed;
    connectGithubBtn.disabled = true;
    connectGithubBtn.textContent = 'Linking...';

    // Verify repository connection via Service Worker
    chrome.runtime.sendMessage(
      {
        type: MESSAGES.FETCH_BRANCHES,
        payload: { owner, repo },
      },
      async (res: { branches?: GitHubBranchItem[]; error?: string }) => {
        connectGithubBtn.disabled = false;
        connectGithubBtn.textContent = 'Linked';

        if (res && res.error && res.error.includes('401')) {
          showBanner('GitHub authentication required or token expired. Please re-authenticate.', 'error');
          showDisconnectedState();
          return;
        }

        // Successfully verified / linked
        await StorageService.saveSettings({
          repoConfig: {
            owner,
            repo,
            branch: (res?.branches && res.branches[0]?.name) || 'main',
            rootFolder: rootFolderInput.value.trim(),
          },
        });

        showConnectedState(owner, repo);
        await loadBranches(owner, repo, 'main');
        showBanner(`Successfully linked repository ${owner}/${repo}!`, 'success');
      }
    );
  });

  // Disconnect Handler
  disconnectBtn.addEventListener('click', async () => {
    await StorageService.saveSettings({
      repoConfig: {
        owner: '',
        repo: '',
        branch: 'main',
        rootFolder: '',
      },
    });
    repoUrlInput.value = '';
    showDisconnectedState();
    showBanner('GitHub repository unlinked.', 'success');
  });

  // Save Settings Handler
  saveSettingsBtn.addEventListener('click', async () => {
    const rawUrl = repoUrlInput.value.trim();
    let owner = '';
    let repo = '';

    if (rawUrl) {
      const parsed = parseGitHubRepoUrl(rawUrl);
      if (parsed) {
        owner = parsed.owner;
        repo = parsed.repo;
      }
    }

    const branch = branchSelect.value || 'main';
    const rootFolder = rootFolderInput.value.trim();

    const newSettings: Partial<ExtensionSettings> = {
      repoConfig: {
        owner,
        repo,
        branch,
        rootFolder,
      },
      syncOnlyAccepted: syncAcceptedToggle.checked,
      duplicateDetection: duplicateDetectionToggle.checked,
      autoSync: autoSyncToggle.checked,
      generateProblemReadme: problemReadmeToggle.checked,
      updateRootReadme: rootReadmeToggle.checked,
      theme: themeSelect.value as 'light' | 'dark' | 'system',
    };

    await StorageService.saveSettings(newSettings);
    showBanner('Settings saved successfully!', 'success');
  });
});
