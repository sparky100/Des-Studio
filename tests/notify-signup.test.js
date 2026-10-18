/**
 * tests/notify-signup.test.js
 * The notify-new-signup Edge Function's request handling
 * (supabase/functions/notify-new-signup/handler.ts), run directly against a
 * fake Supabase and Resend. index.ts only wires it to Deno.serve.
 */
import { describe, it, expect } from 'vitest';
import {
  createHandler, isRecentSignup, signupEmail, testEmail, appLabel, DEFAULT_NOTIFY_EMAIL, RECENT_SIGNUP_MS,
} from '../supabase/functions/notify-new-signup/handler.ts';

const NOW = Date.parse('2026-10-18T09:00:00Z');
const URL_ = 'https://proj.supabase.co';

function fakeBackend({ users = {}, roles = {}, tokens = {}, resendOk = true, totalUsers = 20 } = {}) {
  const notified = new Set();
  const emails = [];
  const calls = [];
  const res = (body, status = 200, headers = {}) => new Response(body == null ? null : JSON.stringify(body), { status, headers });
  async function fetch(url, init = {}) {
    const u = new URL(url);
    const method = init.method || 'GET';
    calls.push(`${method} ${u.pathname}`);
    if (u.origin === 'https://api.resend.com') {
      emails.push(JSON.parse(init.body));
      return resendOk ? res({ id: 'em_1' }) : new Response('domain not verified', { status: 403 });
    }
    if (u.pathname.startsWith('/auth/v1/admin/users/')) {
      const user = users[decodeURIComponent(u.pathname.split('/').pop())];
      return user ? res(user) : res({ msg: 'not found' }, 404);
    }
    if (u.pathname === '/auth/v1/user') {
      const token = (init.headers.Authorization || '').replace('Bearer ', '');
      return tokens[token] ? res(tokens[token]) : res({ msg: 'bad jwt' }, 401);
    }
    if (u.pathname === '/rest/v1/profiles' && method === 'HEAD') return res(null, 200, { 'content-range': `0-0/${totalUsers}` });
    if (u.pathname === '/rest/v1/profiles') {
      const id = u.searchParams.get('id').replace('eq.', '');
      return res(roles[id] ? [{ role: roles[id] }] : []);
    }
    if (u.pathname === '/rest/v1/signup_notifications' && method === 'POST') {
      const { user_id } = JSON.parse(init.body);
      if (notified.has(user_id)) return res([], 201);
      notified.add(user_id);
      return res([{ user_id }], 201);
    }
    if (u.pathname === '/rest/v1/signup_notifications' && method === 'DELETE') {
      notified.delete(u.searchParams.get('user_id').replace('eq.', ''));
      return res(null, 204);
    }
    throw new Error(`unexpected ${method} ${url}`);
  }
  return { fetch, emails, calls, notified };
}

function handlerWith(backend, env = {}) {
  const all = { SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: 'service', RESEND_API_KEY: 're_key', ...env };
  return createHandler({ env: k => all[k], fetch: backend.fetch, now: () => NOW });
}

const post = (body, headers = {}) => new Request('https://fn/notify-new-signup', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

const newUser = { id: 'u1', email: 'new@example.com', created_at: new Date(NOW - 30_000).toISOString(), user_metadata: {} };

describe('a new sign-up', () => {
  it('emails support@simmodlr.app once, with the user count', async () => {
    const backend = fakeBackend({ users: { u1: newUser } });
    const handle = handlerWith(backend);
    const first = await (await handle(post({ user_id: 'u1' }))).json();
    expect(first).toEqual({ ok: true, sent: true });
    expect(backend.emails).toHaveLength(1);
    expect(backend.emails[0].to).toEqual([DEFAULT_NOTIFY_EMAIL]);
    expect(backend.emails[0].subject).toBe('New sign-up: new@example.com');
    expect(backend.emails[0].text).toMatch(/Users now: 20/);
    // A repeat (a retry, or a forged call) sends nothing.
    expect(await (await handle(post({ user_id: 'u1' }))).json()).toEqual({ ok: true, skipped: 'already_notified' });
    expect(backend.emails).toHaveLength(1);
  });

  it('ignores accounts that are not brand new, and unknown ids', async () => {
    const old = { ...newUser, id: 'u2', created_at: new Date(NOW - RECENT_SIGNUP_MS - 1000).toISOString() };
    const backend = fakeBackend({ users: { u2: old } });
    const handle = handlerWith(backend);
    expect(await (await handle(post({ user_id: 'u2' }))).json()).toEqual({ ok: true, skipped: 'not_recent' });
    expect(await (await handle(post({ user_id: 'nope' }))).json()).toEqual({ ok: true, skipped: 'unknown_user' });
    expect(await (await handle(post({}))).json()).toEqual({ ok: true, skipped: 'no_user_id' });
    expect(backend.emails).toHaveLength(0);
  });

  it('accepts the older webhook payload shape', async () => {
    const backend = fakeBackend({ users: { u1: newUser } });
    expect(await (await handlerWith(backend)(post({ type: 'INSERT', record: { id: 'u1' } }))).json()).toEqual({ ok: true, sent: true });
  });

  it('when the email fails, the claim is released so a retry can send it', async () => {
    const backend = fakeBackend({ users: { u1: newUser }, resendOk: false });
    const out = await (await handlerWith(backend)(post({ user_id: 'u1' }))).json();
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/Resend error 403/);
    expect(backend.notified.has('u1')).toBe(false);
  });

  it('uses ADMIN_NOTIFY_EMAIL when set', async () => {
    const backend = fakeBackend({ users: { u1: newUser } });
    await handlerWith(backend, { ADMIN_NOTIFY_EMAIL: 'ops@example.com' })(post({ user_id: 'u1' }));
    expect(backend.emails[0].to).toEqual(['ops@example.com']);
  });
});

describe('a test email from an admin panel', () => {
  const tokens = { admintok: { id: 'a1', email: 'admin@example.com' }, usertok: { id: 'p1', email: 'p@example.com' } };
  const roles = { a1: 'admin', p1: 'user' };

  it('is sent for a platform admin', async () => {
    const backend = fakeBackend({ tokens, roles });
    const res = await handlerWith(backend)(post({ test: true }, { Authorization: 'Bearer admintok' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sent: true, to: DEFAULT_NOTIFY_EMAIL });
    expect(backend.emails[0].subject).toMatch(/^Test:/);
    expect(backend.emails[0].text).toMatch(/sent by admin@example.com/);
  });

  it('is refused for anyone else', async () => {
    const backend = fakeBackend({ tokens, roles });
    const handle = handlerWith(backend);
    expect((await handle(post({ test: true }, { Authorization: 'Bearer usertok' }))).status).toBe(403);
    expect((await handle(post({ test: true }))).status).toBe(401);
    expect((await handle(post({ test: true }, { Authorization: 'Bearer forged' }))).status).toBe(401);
    expect(backend.emails).toHaveLength(0);
  });

  it('reports a delivery problem so the admin can see it', async () => {
    const backend = fakeBackend({ tokens, roles, resendOk: false });
    const res = await handlerWith(backend)(post({ test: true }, { Authorization: 'Bearer admintok' }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/domain not verified/);
  });

  it('says so when no Resend key is configured', async () => {
    const backend = fakeBackend({ tokens, roles });
    const res = await handlerWith(backend, { RESEND_API_KEY: '' })(post({ test: true }, { Authorization: 'Bearer admintok' }));
    expect((await res.json()).error).toBe('RESEND_API_KEY is not set');
  });
});

describe('helpers', () => {
  it('recent means created within the window', () => {
    expect(isRecentSignup({ created_at: new Date(NOW - 1000).toISOString() }, NOW)).toBe(true);
    expect(isRecentSignup({ created_at: new Date(NOW - RECENT_SIGNUP_MS - 1).toISOString() }, NOW)).toBe(false);
    expect(isRecentSignup({ created_at: 'garbage' }, NOW)).toBe(false);
  });

  it('names the app when the sign-up recorded one', () => {
    expect(appLabel('loop')).toBe('Loop');
    expect(appLabel(undefined)).toBeNull();
    const email = signupEmail({ ...newUser, user_metadata: { app_name: 'loop' } }, 'x@y', null);
    expect(email.text).toMatch(/\(Loop\)/);
    expect(email.text).not.toMatch(/Users now/);
    expect(testEmail('x@y', 'a@b').to).toEqual(['x@y']);
  });

  it('OPTIONS and non-POST requests', async () => {
    const handle = handlerWith(fakeBackend());
    expect((await handle(new Request('https://fn', { method: 'OPTIONS' }))).status).toBe(200);
    expect((await handle(new Request('https://fn', { method: 'GET' }))).status).toBe(405);
  });
});
