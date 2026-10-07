import { describe, it, expect } from 'vitest';
import { MESSAGES } from '../src/shared/constants';
import { validatePayload } from '../src/background/service-worker';

describe('Service Worker Runtime Message Payload Validation', () => {
  describe('Parameterless commands (accepted without payload)', () => {
    const parameterlessTypes = [
      MESSAGES.START_OAUTH_FLOW,
      MESSAGES.GET_SETTINGS,
      MESSAGES.OPEN_OPTIONS_PAGE,
      MESSAGES.GET_STATUS,
      MESSAGES.FETCH_REPOSITORIES,
      MESSAGES.DISCONNECT_GITHUB,
      MESSAGES.GET_PENDING_QUEUE,
    ];

    parameterlessTypes.forEach((type) => {
      it(`accepts ${type} with undefined payload`, () => {
        expect(validatePayload(type, undefined)).toBeNull();
      });

      it(`accepts ${type} with null payload`, () => {
        expect(validatePayload(type, null)).toBeNull();
      });
    });

    it('accepts START_OAUTH_FLOW with optional brokerUrl payload', () => {
      expect(validatePayload(MESSAGES.START_OAUTH_FLOW, { brokerUrl: 'https://custom-broker.example.com' })).toBeNull();
    });

    it('accepts OPEN_OPTIONS_PAGE legacy string literal', () => {
      expect(validatePayload('OPEN_OPTIONS_PAGE', undefined)).toBeNull();
    });
  });

  describe('Payload-bearing commands (rejected when payload is missing)', () => {
    const payloadRequiredTypes = [
      MESSAGES.GET_DIRECTORY_STATE,
      MESSAGES.CHECK_DUPLICATE_CODE,
      MESSAGES.SYNC_SOLUTION,
      MESSAGES.FETCH_BRANCHES,
      MESSAGES.VERIFY_AND_LINK_REPOSITORY,
      MESSAGES.RETRY_QUEUE_ITEM,
      MESSAGES.CLEAR_QUEUE_ITEM,
      MESSAGES.VALIDATE_GITHUB_TOKEN,
      MESSAGES.SAVE_SETTINGS,
    ];

    payloadRequiredTypes.forEach((type) => {
      it(`rejects ${type} when payload is undefined`, () => {
        const err = validatePayload(type, undefined);
        expect(err).toBe('Missing message payload');
      });

      it(`rejects ${type} when payload is null`, () => {
        const err = validatePayload(type, null);
        expect(err).toBe('Missing message payload');
      });
    });
  });

  describe('Payload schema enforcement (rejects malformed payloads)', () => {
    it('rejects GET_DIRECTORY_STATE with invalid types', () => {
      expect(validatePayload(MESSAGES.GET_DIRECTORY_STATE, { problemId: 123, problemSlug: 'two-sum' })).toContain('Invalid payload');
      expect(validatePayload(MESSAGES.GET_DIRECTORY_STATE, { problemId: '1', problemSlug: null })).toContain('Invalid payload');
    });

    it('rejects CHECK_DUPLICATE_CODE with invalid types', () => {
      expect(validatePayload(MESSAGES.CHECK_DUPLICATE_CODE, { code: 123, files: [] })).toContain('Invalid payload');
      expect(validatePayload(MESSAGES.CHECK_DUPLICATE_CODE, { code: 'abc', files: 'not-array' })).toContain('Invalid payload');
    });

    it('rejects SYNC_SOLUTION with missing submission data', () => {
      expect(validatePayload(MESSAGES.SYNC_SOLUTION, {})).toContain('Invalid payload');
      expect(validatePayload(MESSAGES.SYNC_SOLUTION, { submission: { code: 'code' } })).toContain('Invalid payload');
    });

    it('rejects FETCH_BRANCHES and VERIFY_AND_LINK_REPOSITORY with missing owner/repo', () => {
      expect(validatePayload(MESSAGES.FETCH_BRANCHES, { owner: 'user' })).toContain('Invalid payload');
      expect(validatePayload(MESSAGES.VERIFY_AND_LINK_REPOSITORY, { repo: 'repo' })).toContain('Invalid payload');
    });

    it('rejects RETRY_QUEUE_ITEM and CLEAR_QUEUE_ITEM with missing id', () => {
      expect(validatePayload(MESSAGES.RETRY_QUEUE_ITEM, {})).toContain('Invalid payload');
      expect(validatePayload(MESSAGES.CLEAR_QUEUE_ITEM, { id: 123 })).toContain('Invalid payload');
    });

    it('rejects VALIDATE_GITHUB_TOKEN with missing token', () => {
      expect(validatePayload(MESSAGES.VALIDATE_GITHUB_TOKEN, {})).toContain('Invalid payload');
      expect(validatePayload(MESSAGES.VALIDATE_GITHUB_TOKEN, { token: 12345 })).toContain('Invalid payload');
    });
  });

  describe('Valid payloads (accepted)', () => {
    it('accepts valid GET_DIRECTORY_STATE', () => {
      expect(validatePayload(MESSAGES.GET_DIRECTORY_STATE, { problemId: '1', problemSlug: 'two-sum' })).toBeNull();
    });

    it('accepts valid CHECK_DUPLICATE_CODE', () => {
      expect(validatePayload(MESSAGES.CHECK_DUPLICATE_CODE, { code: 'int main(){}', files: [] })).toBeNull();
    });

    it('accepts valid SYNC_SOLUTION', () => {
      expect(validatePayload(MESSAGES.SYNC_SOLUTION, {
        submission: {
          code: 'int main(){}',
          problem: { id: '1', title: 'Two Sum', slug: 'two-sum', url: 'https://leetcode.com' },
          language: 'cpp',
        },
      })).toBeNull();
    });

    it('accepts valid FETCH_BRANCHES and VERIFY_AND_LINK_REPOSITORY', () => {
      expect(validatePayload(MESSAGES.FETCH_BRANCHES, { owner: 'user', repo: 'repo' })).toBeNull();
      expect(validatePayload(MESSAGES.VERIFY_AND_LINK_REPOSITORY, { owner: 'user', repo: 'repo', branch: 'main' })).toBeNull();
    });

    it('accepts valid RETRY_QUEUE_ITEM and CLEAR_QUEUE_ITEM', () => {
      expect(validatePayload(MESSAGES.RETRY_QUEUE_ITEM, { id: 'item_123' })).toBeNull();
      expect(validatePayload(MESSAGES.CLEAR_QUEUE_ITEM, { id: 'item_123' })).toBeNull();
    });

    it('accepts valid VALIDATE_GITHUB_TOKEN', () => {
      expect(validatePayload(MESSAGES.VALIDATE_GITHUB_TOKEN, { token: 'ghp_abc123' })).toBeNull();
    });
  });
});
