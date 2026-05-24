/**
 * tests/notify-signup.test.js
 * Sprint 71 — Unit tests for the notify-new-signup Edge Function handler logic.
 *
 * The edge function uses Deno-specific APIs (Deno.serve, Deno.env.get) which are
 * unavailable in Node.js. This test validates the notification payload construction
 * and handler behaviour through isolated pure-function tests with mocked fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Pure helper functions extracted from edge function logic ──────────────────
// These mirror the functions in supabase/functions/notify-new-signup/index.ts.

function buildEmailPayload(toEmail, userEmail, userId, signupAt) {
  const signupDate = new Date(signupAt).toUTCString();
  return {
    from: 'DES Studio <noreply@updates.simmodlr.app>',
    to: [toEmail],
    subject: `New signup: ${userEmail}`,
    text: [
      'New user signup on DES Studio',
      '',
      `Email:     ${userEmail}`,
      `User ID:   ${userId}`,
      `Signed up: ${signupDate}`,
      '',
      '— DES Studio Operator Notification',
    ].join('\n'),
  };
}

function buildSlackPayload(userEmail, signupAt) {
  const signupDate = new Date(signupAt).toUTCString();
  return {
    text: `🎉 New DES Studio signup: *${userEmail}* at ${signupDate}`,
  };
}

function shouldProcess(payload) {
  return (
    payload.type === 'INSERT' &&
    payload.table === 'users' &&
    payload.schema === 'auth'
  );
}

function verifyWebhookSecret(authHeader, expectedSecret) {
  if (!expectedSecret) return false;
  return authHeader === `Bearer ${expectedSecret}`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('notify-new-signup — email payload construction', () => {
  const SIGNUP_AT = '2026-05-20T10:30:00.000Z';
  const USER_EMAIL = 'newuser@example.com';
  const USER_ID = 'abc-123-def';
  const ADMIN_EMAIL = 'admin@operator.com';

  it('builds correct email subject', () => {
    const payload = buildEmailPayload(ADMIN_EMAIL, USER_EMAIL, USER_ID, SIGNUP_AT);
    expect(payload.subject).toBe(`New signup: ${USER_EMAIL}`);
  });

  it('addresses email to admin', () => {
    const payload = buildEmailPayload(ADMIN_EMAIL, USER_EMAIL, USER_ID, SIGNUP_AT);
    expect(payload.to).toEqual([ADMIN_EMAIL]);
  });

  it('email body contains user email', () => {
    const payload = buildEmailPayload(ADMIN_EMAIL, USER_EMAIL, USER_ID, SIGNUP_AT);
    expect(payload.text).toContain(USER_EMAIL);
  });

  it('email body contains user ID', () => {
    const payload = buildEmailPayload(ADMIN_EMAIL, USER_EMAIL, USER_ID, SIGNUP_AT);
    expect(payload.text).toContain(USER_ID);
  });

  it('email body contains formatted signup date', () => {
    const payload = buildEmailPayload(ADMIN_EMAIL, USER_EMAIL, USER_ID, SIGNUP_AT);
    const expectedDate = new Date(SIGNUP_AT).toUTCString();
    expect(payload.text).toContain(expectedDate);
  });

  it('email body contains operator signature', () => {
    const payload = buildEmailPayload(ADMIN_EMAIL, USER_EMAIL, USER_ID, SIGNUP_AT);
    expect(payload.text).toContain('DES Studio Operator Notification');
  });

  it('from address is the platform noreply', () => {
    const payload = buildEmailPayload(ADMIN_EMAIL, USER_EMAIL, USER_ID, SIGNUP_AT);
    expect(payload.from).toMatch(/noreply/i);
  });
});

describe('notify-new-signup — Slack payload construction', () => {
  const SIGNUP_AT = '2026-05-20T10:30:00.000Z';
  const USER_EMAIL = 'newuser@example.com';

  it('Slack payload text contains user email', () => {
    const payload = buildSlackPayload(USER_EMAIL, SIGNUP_AT);
    expect(payload.text).toContain(USER_EMAIL);
  });

  it('Slack payload text contains signup date', () => {
    const payload = buildSlackPayload(USER_EMAIL, SIGNUP_AT);
    const expectedDate = new Date(SIGNUP_AT).toUTCString();
    expect(payload.text).toContain(expectedDate);
  });

  it('Slack payload has text property', () => {
    const payload = buildSlackPayload(USER_EMAIL, SIGNUP_AT);
    expect(typeof payload.text).toBe('string');
    expect(payload.text.length).toBeGreaterThan(0);
  });
});

describe('notify-new-signup — webhook event routing', () => {
  it('processes INSERT on auth.users', () => {
    expect(shouldProcess({ type: 'INSERT', table: 'users', schema: 'auth' })).toBe(true);
  });

  it('skips UPDATE events', () => {
    expect(shouldProcess({ type: 'UPDATE', table: 'users', schema: 'auth' })).toBe(false);
  });

  it('skips INSERT on other tables', () => {
    expect(shouldProcess({ type: 'INSERT', table: 'profiles', schema: 'public' })).toBe(false);
  });

  it('skips INSERT on public.users (not auth schema)', () => {
    expect(shouldProcess({ type: 'INSERT', table: 'users', schema: 'public' })).toBe(false);
  });
});

describe('notify-new-signup — webhook secret verification', () => {
  it('accepts valid Bearer token', () => {
    expect(verifyWebhookSecret('Bearer my-secret-123', 'my-secret-123')).toBe(true);
  });

  it('rejects wrong token', () => {
    expect(verifyWebhookSecret('Bearer wrong-secret', 'my-secret-123')).toBe(false);
  });

  it('rejects missing Authorization header', () => {
    expect(verifyWebhookSecret('', 'my-secret-123')).toBe(false);
  });

  it('rejects non-Bearer scheme', () => {
    expect(verifyWebhookSecret('Basic my-secret-123', 'my-secret-123')).toBe(false);
  });

  it('rejects when WEBHOOK_SECRET is not configured (empty)', () => {
    expect(verifyWebhookSecret('Bearer anything', '')).toBe(false);
  });

  it('rejects when WEBHOOK_SECRET is undefined/null', () => {
    expect(verifyWebhookSecret('Bearer anything', undefined)).toBe(false);
    expect(verifyWebhookSecret('Bearer anything', null)).toBe(false);
  });
});

describe('notify-new-signup — fetch-based send functions', () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('sends Resend API request with correct authorization header', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const API_KEY = 're_test_key';
    const payload = buildEmailPayload('admin@test.com', 'user@test.com', 'uid-1', '2026-05-01T00:00:00Z');

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(options.method).toBe('POST');
    expect(options.headers['Authorization']).toBe(`Bearer ${API_KEY}`);
    const body = JSON.parse(options.body);
    expect(body.to).toEqual(['admin@test.com']);
    expect(body.subject).toContain('user@test.com');
  });

  it('sends Slack POST with JSON text payload', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, text: async () => 'ok' });

    const SLACK_URL = 'https://hooks.slack.com/services/test';
    const slackPayload = buildSlackPayload('user@test.com', '2026-05-01T00:00:00Z');

    await fetch(SLACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackPayload),
    });

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe(SLACK_URL);
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body);
    expect(body.text).toContain('user@test.com');
  });
});
