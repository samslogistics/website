import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_PASSWORD = 'correct horse battery staple';
process.env.SESSION_SECRET = 'x'.repeat(40);
delete process.env.DATABASE_URL; // no DB in tests: only paths that return before querying

const { checkPassword, sessionCookie, isAdmin } = await import('../lib/auth.js');
const { normalizeRef, clean, generateRef } = await import('../lib/http.js');
const { DESTINATIONS } = await import('../lib/constants.js');
const track = (await import('../../api/track.js')).default;
const session = (await import('../../api/admin/session.js')).default;
const shipments = (await import('../../api/admin/shipments.js')).default;
const shipment = (await import('../../api/admin/shipment.js')).default;

function mockRes() {
  return {
    headers: {}, statusCode: null, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
const cookieOf = (setCookie) => setCookie.split(';')[0];

test('normalizeRef accepts valid refs and rejects junk', () => {
  assert.equal(normalizeRef(' sl-gh-abc123 '), 'SL-GH-ABC123');
  assert.equal(normalizeRef('ab'), null);
  assert.equal(normalizeRef("x'; DROP TABLE shipments;--"), null);
  assert.equal(normalizeRef(undefined), null);
});

test('clean trims, nulls empties and caps length', () => {
  assert.equal(clean('  hi  '), 'hi');
  assert.equal(clean('   '), null);
  assert.equal(clean('abcdef', 3), 'abc');
});

test('generateRef matches the public format', () => {
  for (let i = 0; i < 50; i++) {
    const ref = generateRef(DESTINATIONS.Ghana);
    assert.match(ref, /^SL-GH-[A-HJKMNP-Z2-9]{6}$/);
    assert.equal(normalizeRef(ref), ref);
  }
});

test('password check', () => {
  assert.equal(checkPassword('correct horse battery staple'), true);
  assert.equal(checkPassword('nope'), false);
  assert.equal(checkPassword(undefined), false);
});

test('session cookie validates, expires and rejects tampering', () => {
  const token = cookieOf(sessionCookie());
  assert.equal(isAdmin({ headers: { cookie: token } }), true);
  assert.equal(isAdmin({ headers: { cookie: token } }, Date.now() + 9 * 3600 * 1000), false);
  const [name, value] = token.split('=');
  const tampered = `${name}=${value.slice(0, -2)}xx`;
  assert.equal(isAdmin({ headers: { cookie: tampered } }), false);
  assert.equal(isAdmin({ headers: {} }), false);
});

test('GET /api/track validates the reference before touching the database', async () => {
  const res = mockRes();
  await track({ method: 'GET', query: { ref: '!!' } }, res);
  assert.equal(res.statusCode, 400);
  const bad = mockRes();
  await track({ method: 'POST', query: {} }, bad);
  assert.equal(bad.statusCode, 405);
});

test('admin endpoints require a session', async () => {
  for (const handler of [shipments, shipment]) {
    const res = mockRes();
    await handler({ method: 'GET', query: {}, headers: {} }, res);
    assert.equal(res.statusCode, 401);
  }
});

test('login: wrong password 401, right password sets cookie', async () => {
  const bad = mockRes();
  await session({ method: 'POST', body: { password: 'wrong' }, headers: {} }, bad);
  assert.equal(bad.statusCode, 401);

  const ok = mockRes();
  await session({ method: 'POST', body: { password: 'correct horse battery staple' }, headers: {} }, ok);
  assert.equal(ok.statusCode, 200);
  assert.match(ok.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Strict/);

  const check = mockRes();
  await session({ method: 'GET', headers: { cookie: cookieOf(ok.headers['Set-Cookie']) } }, check);
  assert.equal(check.body.signedIn, true);
  assert.ok(check.body.meta.statuses.includes('Delivered'));
});

test('create shipment validates input when signed in', async () => {
  const headers = { cookie: cookieOf(sessionCookie()) };
  const res = mockRes();
  await shipments({ method: 'POST', headers, body: { service: 'nope', destination: 'Ghana', customerName: 'A' } }, res);
  assert.equal(res.statusCode, 400);
  const res2 = mockRes();
  await shipments({ method: 'POST', headers, body: { service: 'courier', destination: 'Ghana', customerName: '  ' } }, res2);
  assert.equal(res2.statusCode, 400);
  const res3 = mockRes();
  await shipment({ method: 'POST', headers, body: { ref: 'SL-GH-ABC123', status: 'Teleported' } }, res3);
  assert.equal(res3.statusCode, 400);
});
