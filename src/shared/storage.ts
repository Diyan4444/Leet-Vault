import { ExtensionSettings, GitHubUser, SyncHistoryItem, PendingQueueItem } from './types';
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
}
