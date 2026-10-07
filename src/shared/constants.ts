import { ExtensionSettings } from './types';

export const DEFAULT_SETTINGS: ExtensionSettings = {
  authMethod: 'oauth',
  repoConfig: {
    owner: '',
    repo: '',
    branch: 'main',
    rootFolder: '',
  },
  autoSync: false,
  syncOnlyAccepted: true,
  duplicateDetection: true,
  generateProblemReadme: true,
  updateRootReadme: true,
  includeRuntimeInReadme: true,
  includeMemoryInReadme: true,
  theme: 'system',
  ownerOnlyMode: false,
};

export const STORAGE_KEYS = {
  SETTINGS: 'lc_gh_settings',
  GITHUB_USER: 'lc_gh_user',
  SYNC_HISTORY: 'lc_gh_history',
  PENDING_QUEUE: 'lc_gh_pending_queue',
} as const;

export const MESSAGES = {
  // LeetCode -> Background
  SUBMISSION_DETECTED: 'LC_SUBMISSION_DETECTED',
  GET_DIRECTORY_STATE: 'LC_GET_DIRECTORY_STATE',
  CHECK_DUPLICATE_CODE: 'LC_CHECK_DUPLICATE_CODE',
  SYNC_SOLUTION: 'LC_SYNC_SOLUTION',
  
  // Background -> LeetCode Content
  SHOW_SAVE_POPUP: 'LC_SHOW_SAVE_POPUP',

  // Popup/Options -> Background
  OPEN_OPTIONS_PAGE: 'LC_OPEN_OPTIONS_PAGE',
  GET_STATUS: 'LC_GET_STATUS',
  GET_SETTINGS: 'LC_GET_SETTINGS',
  SAVE_SETTINGS: 'LC_SAVE_SETTINGS',
  START_OAUTH_FLOW: 'LC_START_OAUTH_FLOW',
  VALIDATE_GITHUB_TOKEN: 'LC_VALIDATE_GITHUB_TOKEN',
  FETCH_REPOSITORIES: 'LC_FETCH_REPOSITORIES',
  FETCH_BRANCHES: 'LC_FETCH_BRANCHES',
  VERIFY_AND_LINK_REPOSITORY: 'LC_VERIFY_AND_LINK_REPOSITORY',
  DISCONNECT_GITHUB: 'LC_DISCONNECT_GITHUB',
  GET_PENDING_QUEUE: 'LC_GET_PENDING_QUEUE',
  RETRY_QUEUE_ITEM: 'LC_RETRY_QUEUE_ITEM',
  CLEAR_QUEUE_ITEM: 'LC_CLEAR_QUEUE_ITEM',
} as const;
