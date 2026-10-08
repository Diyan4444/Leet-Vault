import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import handleRequest, {
  encryptTokenTicket,
  decryptTokenTicket,
  consumeTicket,
  isValidExtensionRedirect,
  getAllowedExtensionIds,
} from '../broker/index.js';

interface BrokerResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

function callBroker(
  method: string,
  urlStr: string,
  headers: Record<string, string> = {},
  body?: string
): Promise<BrokerResponse> {
  return new Promise((resolve) => {
    const req = new EventEmitter() as any;
    req.method = method;
    req.url = urlStr;
    req.headers = { ...headers };

    let statusCode = 200;
    const responseHeaders: Record<string, string> = {};
    let responseBody = '';

    const res = {
      setHeader(name: string, value: string) {
        responseHeaders[name.toLowerCase()] = value;
      },
      writeHead(code: number, headersParam?: Record<string, string>) {
        statusCode = code;
        if (headersParam) {
          for (const [k, v] of Object.entries(headersParam)) {
            responseHeaders[k.toLowerCase()] = v;
          }
        }
      },
      end(chunk?: string) {
        if (chunk) responseBody += chunk;
        resolve({ statusCode, headers: responseHeaders, body: responseBody });
      },
    };

    handleRequest(req, res);

    if (body) {
      req.emit('data', Buffer.from(body, 'utf8'));
    }
    req.emit('end');
  });
}

describe('OAuth Broker Production Security Suite', () => {
  const originalEnv = { ...process.env };
  const testSecret = 'mock-broker-client-secret-for-security-tests-1234567890';
  const testExtId = 'abcdefghijklmnopqrstuvwxyzabcdef';
  const testRedirectUri = `https://${testExtId}.chromiumapp.org/`;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.GITHUB_CLIENT_SECRET = testSecret;
    process.env.GITHUB_CLIENT_ID = 'mock-client-id';
    process.env.TICKET_STORE_DIR = path.join(os.tmpdir(), `test-tickets-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(() => {
    if (process.env.TICKET_STORE_DIR && fs.existsSync(process.env.TICKET_STORE_DIR)) {
      try {
        fs.rmSync(process.env.TICKET_STORE_DIR, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failure in tmp
      }
    }
    process.env = { ...originalEnv };
  });

  describe('Fix 1: Genuinely One-Time OAuth Tickets', () => {
    it('successfully encrypts and decrypts a valid exchange ticket', () => {
      const payload = {
        token: 'ghp_test_token_12345',
        exp: Date.now() + 60000,
        ext: testRedirectUri,
      };

      const ticket = encryptTokenTicket(payload);
      expect(ticket).toBeDefined();
      expect(typeof ticket).toBe('string');
      expect(ticket.split('.')).toHaveLength(3);

      const decrypted = decryptTokenTicket(ticket);
      expect(decrypted).not.toBeNull();
      expect(decrypted?.token).toBe('ghp_test_token_12345');
      expect(decrypted?.jti).toBeDefined();
      expect(decrypted?.exp).toBe(payload.exp);
    });

    it('redeems a valid ticket exactly once on /api/token and rejects the second attempt', async () => {
      const ticket = encryptTokenTicket({
        token: 'ghp_secret_access_token_99999',
        exp: Date.now() + 60000,
        ext: testRedirectUri,
      });

      // 1. First redemption -> SUCCESS (200)
      const res1 = await callBroker('POST', '/api/token', { 'Content-Type': 'application/json' }, JSON.stringify({ code: ticket }));
      expect(res1.statusCode).toBe(200);
      const json1 = JSON.parse(res1.body);
      expect(json1.access_token).toBe('ghp_secret_access_token_99999');

      // 2. Second redemption with the exact same ticket -> REJECTED (400)
      const res2 = await callBroker('POST', '/api/token', { 'Content-Type': 'application/json' }, JSON.stringify({ code: ticket }));
      expect(res2.statusCode).toBe(400);
      const json2 = JSON.parse(res2.body);
      expect(json2.error).toMatch(/already used|invalid/i);
    });

    it('rejects expired tickets', async () => {
      const expiredTicket = encryptTokenTicket({
        token: 'ghp_expired_token',
        exp: Date.now() - 1000, // expired 1s ago
        ext: testRedirectUri,
      });

      const res = await callBroker('POST', '/api/token', { 'Content-Type': 'application/json' }, JSON.stringify({ code: expiredTicket }));
      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.error).toMatch(/expired/i);
    });

    it('rejects tampered or malformed tickets', async () => {
      const validTicket = encryptTokenTicket({
        token: 'ghp_valid_token',
        exp: Date.now() + 60000,
        ext: testRedirectUri,
      });

      const parts = validTicket.split('.');
      // Alter ciphertext part
      const tamperedTicket = `${parts[0]}.${parts[1]}.tampered${parts[2].slice(8)}`;

      const res = await callBroker('POST', '/api/token', { 'Content-Type': 'application/json' }, JSON.stringify({ code: tamperedTicket }));
      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.error).toMatch(/invalid|corrupted/i);
    });

    it('handles race conditions: concurrent requests attempt to redeem the same ticket, exactly one succeeds', async () => {
      const ticket = encryptTokenTicket({
        token: 'ghp_concurrent_test_token',
        exp: Date.now() + 60000,
        ext: testRedirectUri,
      });

      // Fire 10 concurrent redemption requests
      const promises = Array.from({ length: 10 }, () =>
        callBroker('POST', '/api/token', { 'Content-Type': 'application/json' }, JSON.stringify({ code: ticket }))
      );

      const results = await Promise.all(promises);
      const successes = results.filter((r) => r.statusCode === 200);
      const rejections = results.filter((r) => r.statusCode === 400);

      expect(successes).toHaveLength(1);
      expect(rejections).toHaveLength(9);

      const successJson = JSON.parse(successes[0].body);
      expect(successJson.access_token).toBe('ghp_concurrent_test_token');

      for (const rej of rejections) {
        const rejJson = JSON.parse(rej.body);
        expect(rejJson.error).toMatch(/already used|invalid/i);
      }
    });

    it('consumeTicket returns false on duplicate calls with the same ticket ID', async () => {
      const ticketId = 'unique-test-ticket-id-12345';
      const exp = Date.now() + 30000;

      const first = await consumeTicket(ticketId, exp);
      expect(first).toBe(true);

      const second = await consumeTicket(ticketId, exp);
      expect(second).toBe(false);
    });
  });

  describe('Fix 2: Extension ID Validation Fails Closed', () => {
    it('fails closed in production if ALLOWED_EXTENSION_IDS is missing or empty', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.ALLOWED_EXTENSION_IDS;
      delete process.env.ALLOWED_EXTENSION_ID;

      // isValidExtensionRedirect returns false
      expect(isValidExtensionRedirect(testRedirectUri)).toBe(false);

      // /login returns 500 configuration error
      const loginRes = await callBroker('GET', `/login?redirect_uri=${encodeURIComponent(testRedirectUri)}`);
      expect(loginRes.statusCode).toBe(500);
      expect(loginRes.body).toMatch(/ALLOWED_EXTENSION_IDS is required in production/i);

      // /callback returns 500 configuration error
      const callbackRes = await callBroker('GET', `/callback?code=mock_code&state=${encodeURIComponent(JSON.stringify({ ext_redirect: testRedirectUri }))}`);
      expect(callbackRes.statusCode).toBe(500);
      expect(callbackRes.body).toMatch(/ALLOWED_EXTENSION_IDS is required in production/i);
    });

    it('in production, rejects extension IDs not listed in ALLOWED_EXTENSION_IDS', () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOWED_EXTENSION_IDS = `${testExtId},otherallowedid1234567890abcdef`;

      const unauthorizedId = 'unauthorizedextensionid12345678';
      const unauthorizedUri = `https://${unauthorizedId}.chromiumapp.org/`;

      expect(isValidExtensionRedirect(unauthorizedUri)).toBe(false);
      expect(isValidExtensionRedirect(testRedirectUri)).toBe(true);
    });

    it('in production, supports multiple comma-separated extension IDs with whitespace trimming', () => {
      process.env.NODE_ENV = 'production';
      const id1 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const id2 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      const id3 = 'cccccccccccccccccccccccccccccccc';

      process.env.ALLOWED_EXTENSION_IDS = `  ${id1}  ,  ${id2} , ${id3} `;

      const allowed = getAllowedExtensionIds();
      expect(allowed).toEqual([id1, id2, id3]);

      expect(isValidExtensionRedirect(`https://${id1}.chromiumapp.org/`)).toBe(true);
      expect(isValidExtensionRedirect(`https://${id2}.chromiumapp.org/`)).toBe(true);
      expect(isValidExtensionRedirect(`https://${id3}.chromiumapp.org/`)).toBe(true);
      expect(isValidExtensionRedirect(`https://dddddddddddddddddddddddddddddddd.chromiumapp.org/`)).toBe(false);
    });

    it('in production, rejects localhost and 127.0.0.1 redirect URIs', () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOWED_EXTENSION_IDS = testExtId;

      expect(isValidExtensionRedirect('http://localhost:3000/callback')).toBe(false);
      expect(isValidExtensionRedirect('http://127.0.0.1:3000/callback')).toBe(false);
    });

    it('in non-production (development), allows localhost and 127.0.0.1', () => {
      process.env.NODE_ENV = 'development';
      expect(isValidExtensionRedirect('http://localhost:3000/callback')).toBe(true);
      expect(isValidExtensionRedirect('http://127.0.0.1:8080/callback')).toBe(true);
    });
  });
});
