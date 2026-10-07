import { ExtensionSettings, GitHubUser, SyncHistoryItem, PendingQueueItem, ConnectionState } from './types';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from './constants';

export class StorageService {
  /**
   * Loads settings from chrome.storage.local
   */
  static async getSettings(): Promise<ExtensionSettings> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return DEFAULT_SETTINGS;
    }
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
  }

  /**
   * Saves settings to chrome.storage.local
   */
  static async saveSettings(settings: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    const current = await this.getSettings();
    const updated = { ...current, ...settings };
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
    }
    return updated;
  }

  /**
   * Gets authenticated GitHub user profile
   */
  static async getGitHubUser(): Promise<GitHubUser | null> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return null;
    }
    const result = await chrome.storage.local.get(STORAGE_KEYS.GITHUB_USER);
    return result[STORAGE_KEYS.GITHUB_USER] || null;
  }

  /**
   * Saves authenticated GitHub user profile
   */
  static async saveGitHubUser(user: GitHubUser | null): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [STORAGE_KEYS.GITHUB_USER]: user });
    }
  }

  /**
   * Gets sync history
   */
  static async getSyncHistory(): Promise<SyncHistoryItem[]> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return [];
    }
    const result = await chrome.storage.local.get(STORAGE_KEYS.SYNC_HISTORY);
    return result[STORAGE_KEYS.SYNC_HISTORY] || [];
  }

  /**
   * Appends an item to sync history (keeps latest 50)
   */
  static async addSyncHistory(item: SyncHistoryItem): Promise<void> {
    const history = await this.getSyncHistory();
    const updated = [item, ...history.filter((h) => h.id !== item.id)].slice(0, 50);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [STORAGE_KEYS.SYNC_HISTORY]: updated });
    }
  }

  /**
   * Gets pending sync queue items
   */
  static async getPendingQueue(): Promise<PendingQueueItem[]> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return [];
    }
    const result = await chrome.storage.local.get(STORAGE_KEYS.PENDING_QUEUE);
    return result[STORAGE_KEYS.PENDING_QUEUE] || [];
  }

  /**
   * Adds an item to pending sync queue
   */
  static async enqueuePendingItem(item: PendingQueueItem): Promise<void> {
    const queue = await this.getPendingQueue();
    const updated = [...queue.filter((q) => q.id !== item.id), item];
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_QUEUE]: updated });
    }
  }

  /**
   * Removes an item from pending sync queue
   */
  static async removePendingItem(id: string): Promise<void> {
    const queue = await this.getPendingQueue();
    const updated = queue.filter((item) => item.id !== id);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_QUEUE]: updated });
    }
  }

  /**
   * Optimized batch reader: retrieves settings, authenticated user, and queue in a single storage read
   */
  static async getAuthoritativeStatus(): Promise<{
    connection: ConnectionState;
    settings: ExtensionSettings;
    user: GitHubUser | null;
    pendingQueue: PendingQueueItem[];
    recentSolutions: SyncHistoryItem[];
  }> {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return {
        connection: { connected: false, repositoryVerified: false, hasPushAccess: false },
        settings: DEFAULT_SETTINGS,
        user: null,
        pendingQueue: [],
        recentSolutions: [],
      };
    }

    const res = await chrome.storage.local.get([
      STORAGE_KEYS.SETTINGS,
      STORAGE_KEYS.GITHUB_USER,
      STORAGE_KEYS.PENDING_QUEUE,
      STORAGE_KEYS.SYNC_HISTORY,
    ]);

    const settings: ExtensionSettings = { ...DEFAULT_SETTINGS, ...(res[STORAGE_KEYS.SETTINGS] || {}) };
    const user: GitHubUser | null = res[STORAGE_KEYS.GITHUB_USER] || null;
    const pendingQueue: PendingQueueItem[] = res[STORAGE_KEYS.PENDING_QUEUE] || [];
    const recentSolutions: SyncHistoryItem[] = res[STORAGE_KEYS.SYNC_HISTORY] || [];

    const isConnected = !!(settings.githubToken && user);
    const repoCfg = settings.repoConfig;

    const connection: ConnectionState = {
      connected: isConnected,
      githubUserId: user?.id,
      githubUsername: user?.login,
      githubAvatarUrl: user?.avatarUrl,
      repositoryOwner: repoCfg.owner,
      repositoryName: repoCfg.repo,
      repositoryUrl: repoCfg.owner && repoCfg.repo ? `https://github.com/${repoCfg.owner}/${repoCfg.repo}` : '',
      repositoryVerified: !!repoCfg.verified,
      hasPushAccess: !!repoCfg.verified,
      selectedBranch: repoCfg.branch || 'main',
      verifiedAt: repoCfg.verifiedAt,
      lastVerifiedAt: repoCfg.verifiedAt,
    };

    return { connection, settings, user, pendingQueue, recentSolutions };
  }
}
