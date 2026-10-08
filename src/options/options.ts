import { StorageService } from '../shared/storage';
import { MESSAGES } from '../shared/constants';
import { ExtensionSettings, GitHubUser, ConnectionState, PendingQueueItem } from '../shared/types';
import { parseGitHubRepoUrl, escapeHtml } from '../utils/sanitize';
import { GitHubBranchItem } from '../github/types';

document.addEventListener('DOMContentLoaded', async () => {
  // OAuth Account elements
  const oauthUnconnectedBox = document.getElementById('oauth-unconnected-box') as HTMLElement;
  const oauthConnectedBox = document.getElementById('oauth-connected-box') as HTMLElement;
  const connectOauthBtn = document.getElementById('connect-oauth-btn') as HTMLButtonElement;
  const userIdentityDisplay = document.getElementById('user-identity-display') as HTMLElement;
  const disconnectBtn = document.getElementById('disconnect-btn') as HTMLButtonElement;

  // Repository elements
  const repoUrlInput = document.getElementById('repo-url-input') as HTMLInputElement;
  const verifyRepoBtn = document.getElementById('verify-repo-btn') as HTMLButtonElement;
  const repoStatusBox = document.getElementById('repo-status-box') as HTMLElement;
  const repoStatusLine = document.getElementById('repo-status-line') as HTMLElement;
  const branchSelect = document.getElementById('branch-select') as HTMLSelectElement;
  const rootFolderInput = document.getElementById('root-folder-input') as HTMLInputElement;

  // Queue elements
  const queueEmptyState = document.getElementById('queue-empty-state') as HTMLElement;
  const optionsQueueList = document.getElementById('options-queue-list') as HTMLElement;

  // Preference toggles
  const syncAcceptedToggle = document.getElementById('sync-accepted-toggle') as HTMLInputElement;
  const duplicateDetectionToggle = document.getElementById('duplicate-detection-toggle') as HTMLInputElement;
  const autoSyncToggle = document.getElementById('auto-sync-toggle') as HTMLInputElement;
  const ownerOnlyToggle = document.getElementById('owner-only-toggle') as HTMLInputElement;
  const problemReadmeToggle = document.getElementById('problem-readme-toggle') as HTMLInputElement;
  const rootReadmeToggle = document.getElementById('root-readme-toggle') as HTMLInputElement;
  const includeRuntimeToggle = document.getElementById('include-runtime-toggle') as HTMLInputElement;
  const includeMemoryToggle = document.getElementById('include-memory-toggle') as HTMLInputElement;
  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
  const saveSettingsBtn = document.getElementById('save-settings-btn') as HTMLButtonElement;
  const statusBanner = document.getElementById('status-banner') as HTMLElement;

  function applyTheme(theme: 'light' | 'dark' | 'system') {
    if (theme === 'dark' || theme === 'light') {
      document.documentElement.setAttribute('data-theme', theme);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  themeSelect?.addEventListener('change', () => {
    applyTheme(themeSelect.value as any);
  });

  let verifiedOwner = '';
  let verifiedRepo = '';
  let isAuthenticated = false;

  const showBanner = (msg: string, type: 'success' | 'error') => {
    statusBanner.className = `banner banner-${type}`;
    statusBanner.textContent = msg;
    statusBanner.style.display = 'block';
    setTimeout(() => {
      statusBanner.style.display = 'none';
    }, 4500);
  };

  function setAuthenticatedState(username: string) {
    isAuthenticated = true;
    oauthUnconnectedBox.style.display = 'none';
    oauthConnectedBox.style.display = 'flex';
    userIdentityDisplay.textContent = `Connected as @${username}`;
    verifyRepoBtn.disabled = false;
  }

  function setUnauthenticatedState() {
    isAuthenticated = false;
    oauthUnconnectedBox.style.display = 'block';
    oauthConnectedBox.style.display = 'none';
    repoStatusBox.style.display = 'none';
    verifiedOwner = '';
    verifiedRepo = '';
    branchSelect.innerHTML = '<option value="main">main</option>';
  }

  function setRepoVerifiedState(owner: string, repo: string, isOwner = true) {
    verifiedOwner = owner;
    verifiedRepo = repo;
    repoStatusBox.style.display = 'flex';
    const roleText = isOwner ? 'Owned by you · Push Access: Yes' : 'Collaborator · Push Access: Yes';
    repoStatusLine.textContent = `✓ ${owner}/${repo} (${roleText})`;
    verifyRepoBtn.textContent = 'Verified';
    verifyRepoBtn.classList.remove('btn-primary');
    verifyRepoBtn.classList.add('btn-secondary');
  }

  function setRepoUnverifiedState() {
    verifiedOwner = '';
    verifiedRepo = '';
    repoStatusBox.style.display = 'none';
    verifyRepoBtn.textContent = 'Verify Repository';
    verifyRepoBtn.classList.remove('btn-secondary');
    verifyRepoBtn.classList.add('btn-primary');
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

  function renderPendingQueue(queue: PendingQueueItem[]) {
    if (!queue || queue.length === 0) {
      queueEmptyState.style.display = 'block';
      optionsQueueList.style.display = 'none';
      optionsQueueList.innerHTML = '';
      return;
    }

    queueEmptyState.style.display = 'none';
    optionsQueueList.style.display = 'flex';
    optionsQueueList.innerHTML = '';

    queue.forEach((item) => {
      const card = document.createElement('div');
      card.style.cssText = 'padding: 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; font-size: 13px;';

      const title = item.request.submission.problem.title;
      const file = item.request.customSolutionName || 'solution';
      const errorMsg = item.error || 'Temporary error';

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-weight: 600; color: #92400e;">
          <span>${escapeHtml(title)}</span>
          <span style="font-size: 11px;">Retries: ${item.retryCount}</span>
        </div>
        <div style="font-family: monospace; color: #475569; margin-top: 2px;">${escapeHtml(file)}</div>
        <div style="color: #b91c1c; font-size: 12px; margin-top: 4px;">${escapeHtml(errorMsg)}</div>
        <div style="display: flex; gap: 8px; margin-top: 8px;">
          <button class="btn btn-secondary retry-btn" style="padding: 4px 10px; font-size: 12px;">Retry Now</button>
          <button class="btn btn-secondary remove-btn" style="padding: 4px 10px; font-size: 12px; color: #dc2626;">Remove</button>
        </div>
      `;

      card.querySelector('.retry-btn')?.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: MESSAGES.RETRY_QUEUE_ITEM, payload: { id: item.id } }, () => {
          loadAuthoritativeStatus();
        });
      });

      card.querySelector('.remove-btn')?.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: MESSAGES.CLEAR_QUEUE_ITEM, payload: { id: item.id } }, () => {
          loadAuthoritativeStatus();
        });
      });

      optionsQueueList.appendChild(card);
    });
  }

  function loadAuthoritativeStatus() {
    chrome.runtime.sendMessage(
      { type: MESSAGES.GET_STATUS },
      async (response: {
        isConnected: boolean;
        isRepoVerified: boolean;
        user: GitHubUser | null;
        settings: ExtensionSettings;
        connectionState?: ConnectionState;
        pendingQueue?: PendingQueueItem[];
      }) => {
        const settings = response?.settings || (await StorageService.getSettings());
        const user = response?.user || (await StorageService.getGitHubUser());

        if (response?.isConnected && user) {
          setAuthenticatedState(user.login);
        } else {
          setUnauthenticatedState();
        }

        if (settings.repoConfig.owner && settings.repoConfig.repo) {
          repoUrlInput.value = `https://github.com/${settings.repoConfig.owner}/${settings.repoConfig.repo}`;
          if (response?.isRepoVerified || settings.repoConfig.verified) {
            setRepoVerifiedState(settings.repoConfig.owner, settings.repoConfig.repo, response?.connectionState?.isOwner ?? true);
            await loadBranches(settings.repoConfig.owner, settings.repoConfig.repo, settings.repoConfig.branch);
          } else {
            setRepoUnverifiedState();
          }
        } else {
          setRepoUnverifiedState();
        }

        rootFolderInput.value = settings.repoConfig.rootFolder || '';
        syncAcceptedToggle.checked = settings.syncOnlyAccepted;
        duplicateDetectionToggle.checked = settings.duplicateDetection;
        autoSyncToggle.checked = settings.autoSync;
        ownerOnlyToggle.checked = !!settings.ownerOnlyMode;
        problemReadmeToggle.checked = settings.generateProblemReadme;
        rootReadmeToggle.checked = settings.updateRootReadme;
        includeRuntimeToggle.checked = settings.includeRuntimeInReadme !== false;
        includeMemoryToggle.checked = settings.includeMemoryInReadme !== false;
        themeSelect.value = settings.theme || 'system';
        applyTheme(settings.theme || 'system');

        renderPendingQueue(response?.pendingQueue || []);
      }
    );
  }

  // Initial load
  loadAuthoritativeStatus();

  // 1. Connect GitHub OAuth Handler
  connectOauthBtn.addEventListener('click', () => {
    connectOauthBtn.disabled = true;
    connectOauthBtn.textContent = 'Connecting with GitHub...';

    chrome.runtime.sendMessage({ type: MESSAGES.START_OAUTH_FLOW }, (res) => {
      connectOauthBtn.disabled = false;
      connectOauthBtn.textContent = 'Connect GitHub Account';

      if (!res || !res.success) {
        showBanner(res?.error || 'OAuth authorization was cancelled or failed.', 'error');
        return;
      }

      showBanner(`✓ Successfully connected as @${res.user.login}!`, 'success');
      loadAuthoritativeStatus();
    });
  });

  // 2. Disconnect Handler
  disconnectBtn.addEventListener('click', () => {
    disconnectBtn.disabled = true;
    disconnectBtn.textContent = 'Disconnecting...';

    chrome.runtime.sendMessage({ type: MESSAGES.DISCONNECT_GITHUB }, () => {
      disconnectBtn.disabled = false;
      disconnectBtn.textContent = 'Disconnect GitHub';
      repoUrlInput.value = '';
      setUnauthenticatedState();
      showBanner('GitHub account disconnected and repository unlinked.', 'success');
    });
  });

  // 3. Verify Repository Handler
  verifyRepoBtn.addEventListener('click', async () => {
    if (!isAuthenticated) {
      showBanner('Please connect your GitHub account above before verifying a repository.', 'error');
      return;
    }

    const rawUrl = repoUrlInput.value.trim();
    if (!rawUrl) {
      showBanner('Please enter a GitHub repository URL.', 'error');
      return;
    }

    const parsed = parseGitHubRepoUrl(rawUrl);
    if (!parsed) {
      showBanner('Invalid GitHub URL. Expected format: https://github.com/USERNAME/REPOSITORY', 'error');
      return;
    }

    const { owner, repo } = parsed;
    verifyRepoBtn.disabled = true;
    verifyRepoBtn.textContent = 'Verifying access...';

    chrome.runtime.sendMessage(
      {
        type: MESSAGES.VERIFY_AND_LINK_REPOSITORY,
        payload: {
          owner,
          repo,
          branch: branchSelect.value || 'main',
          rootFolder: rootFolderInput.value.trim(),
        },
      },
      async (res: { success?: boolean; isOwner?: boolean; error?: string; settings?: ExtensionSettings }) => {
        verifyRepoBtn.disabled = false;

        if (!res || !res.success) {
          setRepoUnverifiedState();
          showBanner(res?.error || 'Repository verification failed: no write permissions.', 'error');
          return;
        }

        setRepoVerifiedState(owner, repo, res.isOwner ?? true);
        await loadBranches(owner, repo, branchSelect.value || 'main');
        showBanner(`✓ Successfully verified push access and linked ${owner}/${repo}!`, 'success');
      }
    );
  });

  // 4. Save Settings Handler
  saveSettingsBtn.addEventListener('click', async () => {
    const rawUrl = repoUrlInput.value.trim();
    let owner = verifiedOwner;
    let repo = verifiedRepo;

    if (rawUrl) {
      const parsed = parseGitHubRepoUrl(rawUrl);
      if (parsed) {
        if (parsed.owner !== verifiedOwner || parsed.repo !== verifiedRepo) {
          showBanner('Repository URL was modified. Please click "Verify Repository" to confirm write permissions before saving.', 'error');
          return;
        }
        owner = parsed.owner;
        repo = parsed.repo;
      }
    } else {
      owner = '';
      repo = '';
    }

    const branch = branchSelect.value || 'main';
    const rootFolder = rootFolderInput.value.trim();
    const current = await StorageService.getSettings();

    const newSettings: Partial<ExtensionSettings> = {
      repoConfig: {
        owner,
        repo,
        branch,
        rootFolder,
        verified: !!(owner && repo && owner === verifiedOwner && repo === verifiedRepo),
        verifiedAt: current.repoConfig.verifiedAt,
      },
      syncOnlyAccepted: syncAcceptedToggle.checked,
      duplicateDetection: duplicateDetectionToggle.checked,
      autoSync: autoSyncToggle.checked,
      ownerOnlyMode: ownerOnlyToggle.checked,
      generateProblemReadme: problemReadmeToggle.checked,
      updateRootReadme: rootReadmeToggle.checked,
      includeRuntimeInReadme: includeRuntimeToggle.checked,
      includeMemoryInReadme: includeMemoryToggle.checked,
      theme: themeSelect.value as 'light' | 'dark' | 'system',
    };

    await StorageService.saveSettings(newSettings);
    showBanner('Settings saved successfully!', 'success');
  });
});
