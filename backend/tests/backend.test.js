import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_PASSWORD = 'correct horse battery staple';
process.env.SESSION_SECRET = 'x'.repeat(40);
delete process.env.DATABASE_URL; // no DB in tests: only paths that return before querying

const { checkPassword, sessionCookie, isAdmin } = await import('../lib/auth.js');
const {
  normalizeRef, clean, generateRef, generateRequestRef, validBookingDate, EMAIL_RE, PHONE_RE,
  generateOrderRef, parsePricePence, parseOrderLines, MAX_ORDER_LINES, MAX_LINE_QTY,
} = await import('../lib/http.js');
const { DESTINATIONS } = await import('../lib/constants.js');
const track = (await import('../../api/track.js')).default;
const session = (await import('../../api/admin/session.js')).default;
const shipments = (await import('../../api/admin/shipments.js')).default;
const shipment = (await import('../../api/admin/shipment.js')).default;
const booking = (await import('../../api/booking.js')).default;
const bookings = (await import('../../api/admin/bookings.js')).default;
const supplies = (await import('../../api/supplies.js')).default;
const supplyItems = (await import('../../api/admin/supply-items.js')).default;
const supplyOrders = (await import('../../api/admin/supply-orders.js')).default;

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

// ---------------------------------------------------------------------------
// Booking requests
// ---------------------------------------------------------------------------
const validBooking = () => ({
  service: 'house_removal',
  destination: 'UK',
  name: 'Ama Mensah',
  phone: '+44 7700 900123',
  email: 'ama@example.com',
  pickupAddress: '1 High Street, London E1 1AA',
  deliveryAddress: '2 Low Road, London N1 1AA',
  preferredDate: '',
  description: '2-bedroom flat',
  website: '',
  consent: true,
});
const postBooking = async (body, method = 'POST') => {
  const res = mockRes();
  await booking({ method, body, headers: { 'x-forwarded-for': '203.0.113.9' } }, res);
  return res;
};

test('booking helpers: request ref, email, phone and date checks', () => {
  assert.match(generateRequestRef(), /^BR-[A-HJKMNP-Z2-9]{6}$/);
  assert.ok(EMAIL_RE.test('a@b.co') && !EMAIL_RE.test('nope') && !EMAIL_RE.test('a@b'));
  assert.ok(PHONE_RE.test('+44 (0)7700-900123') && !PHONE_RE.test('abc') && !PHONE_RE.test('12'));
  const now = new Date('2026-10-15T12:00:00Z');
  assert.equal(validBookingDate('2026-10-20', now), true);
  assert.equal(validBookingDate('2026-10-14', now), true); // yesterday tolerated (timezones)
  assert.equal(validBookingDate('2026-09-01', now), false); // in the past
  assert.equal(validBookingDate('2030-01-01', now), false); // too far ahead
  assert.equal(validBookingDate('2026-02-31', now), false); // not a real date
  assert.equal(validBookingDate('15/10/2026', now), false);
});

test('POST /api/booking rejects bad input before touching the database', async () => {
  assert.equal((await postBooking(validBooking(), 'GET')).statusCode, 405);
  for (const [field, value] of [
    ['service', 'teleport'], ['destination', 'Mars'], ['name', '  '], ['phone', 'abc'],
    ['email', 'not-an-email'], ['pickupAddress', ''], ['deliveryAddress', ''],
    ['preferredDate', '2020-01-01'], ['consent', false], ['consent', 'true'],
  ]) {
    const res = await postBooking({ ...validBooking(), [field]: value });
    assert.equal(res.statusCode, 400, `${field}=${value}`);
    assert.ok(res.body.error);
  }
});

test('booking honeypot returns a fake success without saving', async () => {
  const res = await postBooking({ ...validBooking(), website: 'http://spam.example' });
  assert.equal(res.statusCode, 201);
  assert.match(res.body.reference, /^BR-/);
});

test('admin bookings: needs a session, validates id and action', async () => {
  const anon = mockRes();
  await bookings({ method: 'GET', query: {}, headers: {} }, anon);
  assert.equal(anon.statusCode, 401);

  const headers = { cookie: cookieOf(sessionCookie()) };
  for (const body of [
    { id: 'abc', action: 'accept' }, { id: 0, action: 'accept' }, { id: 1.5, action: 'accept' },
    { id: 1, action: 'delete' }, { id: 1 }, {},
  ]) {
    const res = mockRes();
    await bookings({ method: 'POST', headers, body }, res);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
});

// ---------------------------------------------------------------------------
// Supplies ordering
// ---------------------------------------------------------------------------
test('supplies helpers: order reference format', () => {
  for (let i = 0; i < 50; i++) assert.match(generateOrderRef(), /^SO-[A-HJKMNP-Z2-9]{6}$/);
});

test('parsePricePence: pounds in, pence out, blank = price on request', () => {
  assert.deepEqual(parsePricePence('12.50'), { ok: true, pence: 1250 });
  assert.deepEqual(parsePricePence('£12.5'), { ok: true, pence: 1250 });
  assert.deepEqual(parsePricePence(' 7 '), { ok: true, pence: 700 });
  assert.deepEqual(parsePricePence('0.99'), { ok: true, pence: 99 });
  assert.deepEqual(parsePricePence('19.99'), { ok: true, pence: 1999 }); // no floating point drift
  assert.deepEqual(parsePricePence(''), { ok: true, pence: null });
  assert.deepEqual(parsePricePence(undefined), { ok: true, pence: null });
  assert.deepEqual(parsePricePence(null), { ok: true, pence: null });
  for (const bad of ['abc', '-3', '12.345', '1,50', '1e3', '£', '£ -1', '9999999']) {
    assert.equal(parsePricePence(bad).ok, false, bad);
  }
});

test('parseOrderLines: accepts good lines, merges duplicates, rejects the rest', () => {
  assert.deepEqual(parseOrderLines([{ id: 1, quantity: 2 }, { id: '2', quantity: '3' }]), [{ id: 1, qty: 2 }, { id: 2, qty: 3 }]);
  assert.deepEqual(parseOrderLines([{ id: 1, quantity: 2 }, { id: 1, quantity: 3 }]), [{ id: 1, qty: 5 }]);
  assert.deepEqual(parseOrderLines([{ id: 1, quantity: MAX_LINE_QTY }, { id: 1, quantity: 10 }]), [{ id: 1, qty: MAX_LINE_QTY }]);
  assert.deepEqual(parseOrderLines([{ id: 1, quantity: 1, price: 0, name: 'FREE' }]), [{ id: 1, qty: 1 }]); // extras ignored
  for (const bad of [
    undefined, null, 'x', [], {}, [null], [{}], [{ id: 0, quantity: 1 }], [{ id: -1, quantity: 1 }], [{ id: 1.5, quantity: 1 }],
    [{ id: 1, quantity: 0 }], [{ id: 1, quantity: -2 }], [{ id: 1, quantity: 1.5 }], [{ id: 1, quantity: MAX_LINE_QTY + 1 }],
    [{ id: 1, quantity: 'lots' }], [{ id: 'abc', quantity: 1 }],
    Array.from({ length: MAX_ORDER_LINES + 1 }, (_, i) => ({ id: i + 1, quantity: 1 })),
  ]) {
    assert.equal(parseOrderLines(bad), null, JSON.stringify(bad));
  }
  assert.equal(parseOrderLines(Array.from({ length: MAX_ORDER_LINES }, (_, i) => ({ id: i + 1, quantity: 1 }))).length, MAX_ORDER_LINES);
});

const validOrder = () => ({
  name: 'Kwame Asante', phone: '+44 7700 900123', email: 'kwame@example.com', fulfilment: 'delivery',
  address: '1 High Street, London E1 1AA', note: '', items: [{ id: 1, quantity: 2 }], website: '', consent: true,
});
const postOrder = async (body, method = 'POST') => {
  const res = mockRes();
  await supplies({ method, body, headers: { 'x-forwarded-for': '203.0.113.20' } }, res);
  return res;
};

test('POST /api/supplies rejects bad input before touching the database', async () => {
  assert.equal((await postOrder(validOrder(), 'PUT')).statusCode, 405);
  for (const [field, value] of [
    ['items', []], ['items', 'box'], ['items', [{ id: 1, quantity: 0 }]], ['name', '  '], ['phone', 'abc'],
    ['email', 'not-an-email'], ['fulfilment', 'drone'], ['fulfilment', ''], ['address', ''], ['consent', false], ['consent', 'true'],
  ]) {
    const res = await postOrder({ ...validOrder(), [field]: value });
    assert.equal(res.statusCode, 400, `${field}=${JSON.stringify(value)}`);
    assert.ok(res.body.error);
  }
  // collection does not need an address
  const ok = await postOrder({ ...validOrder(), fulfilment: 'collection', address: '' });
  assert.notEqual(ok.statusCode, 400); // passes validation (500 here only because the test has no database)
});

test('supplies honeypot returns a fake success without saving', async () => {
  const res = await postOrder({ ...validOrder(), website: 'http://spam.example' });
  assert.equal(res.statusCode, 201);
  assert.match(res.body.reference, /^SO-/);
});

test('admin supply endpoints need a session and validate input', async () => {
  for (const handler of [supplyItems, supplyOrders]) {
    for (const method of ['GET', 'POST', 'DELETE']) {
      const res = mockRes();
      await handler({ method, query: {}, headers: {}, body: {} }, res);
      assert.equal(res.statusCode, method === 'DELETE' && handler === supplyOrders ? 405 : 401, `${method}`);
    }
  }

  const headers = { cookie: cookieOf(sessionCookie()) };
  const item = (over) => ({ name: 'Bubble wrap', category: 'Other', unit: 'roll', price: '12.99', ...over });
  for (const body of [
    item({ name: ' ' }), item({ category: 'Cars' }), item({ price: '12.345' }), item({ price: '-1' }),
    item({ sortOrder: 'abc' }), item({ sortOrder: -1 }), item({ sortOrder: 10000 }), item({ id: 'zz' }), item({ id: 0 }),
  ]) {
    const res = mockRes();
    await supplyItems({ method: 'POST', headers, body }, res);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
  const del = mockRes();
  await supplyItems({ method: 'DELETE', headers, query: { id: 'x' } }, del);
  assert.equal(del.statusCode, 400);

  for (const body of [
    { id: 'abc', action: 'confirm' }, { id: 0, action: 'confirm' }, { id: 1.5, action: 'confirm' },
    { id: 1, action: 'delete' }, { id: 1 }, {},
  ]) {
    const res = mockRes();
    await supplyOrders({ method: 'POST', headers, body }, res);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
});
