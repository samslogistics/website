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
      assert.equal(res.statusCode, 401, `${method}`);
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

// ---------- owner alerts (email + WhatsApp) ----------
const notify = await import('../lib/notify.js');
const ALERT_ENV = ['RESEND_API_KEY', 'ALERT_EMAIL_TO', 'ALERT_EMAIL_FROM', 'CALLMEBOT_PHONE', 'CALLMEBOT_APIKEY', 'SITE_URL'];

async function withFetch(fake, fn) {
  const realFetch = globalThis.fetch;
  const saved = Object.fromEntries(ALERT_ENV.map((k) => [k, process.env[k]]));
  globalThis.fetch = fake;
  try { return await fn(); } finally {
    globalThis.fetch = realFetch;
    for (const k of ALERT_ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

const sampleBooking = {
  reference: 'BR-ABC234', service: 'sea_freight', destination: 'Ghana', name: 'Ama Mensah',
  phone: '07123456789', email: 'ama@example.com', pickup: '1 High St, London', delivery: 'Accra',
  preferredDate: '2026-11-01', description: '2 barrels',
};
const sampleOrder = {
  reference: 'SO-ABC234', name: 'John Payne', phone: '07123456789', email: '', fulfilment: 'delivery',
  address: '5 Road, London', note: '', items: [
    { name: 'Cardboard box - small', qty: 3, unitPricePence: 1250 },
    { name: 'Shipping barrel - large', qty: 1, unitPricePence: null },
  ],
};

test('alerts are skipped (no network call) when no channel is configured', async () => {
  let calls = 0;
  await withFetch(async () => { calls++; return { ok: true }; }, async () => {
    for (const k of ALERT_ENV) delete process.env[k];
    const out = await notify.notifyOwner(notify.bookingAlert(sampleBooking));
    assert.deepEqual(out, ['skipped', 'skipped']);
    assert.equal(calls, 0);
  });
});

test('email goes to Resend with bearer key, reply_to and plain text', async () => {
  const seen = [];
  await withFetch(async (url, init) => { seen.push({ url, init }); return { ok: true }; }, async () => {
    process.env.RESEND_API_KEY = 're_test'; process.env.ALERT_EMAIL_TO = 'owner@example.com';
    delete process.env.CALLMEBOT_PHONE; delete process.env.CALLMEBOT_APIKEY;
    const out = await notify.notifyOwner(notify.bookingAlert(sampleBooking));
    assert.deepEqual(out, ['sent', 'skipped']);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, 'https://api.resend.com/emails');
    assert.equal(seen[0].init.headers.Authorization, 'Bearer re_test');
    const body = JSON.parse(seen[0].init.body);
    assert.deepEqual(body.to, ['owner@example.com']);
    assert.match(body.from, /onboarding@resend\.dev/);
    assert.equal(body.reply_to, 'ama@example.com');
    assert.match(body.subject, /BR-ABC234.*Sea Freight/);
    assert.match(body.text, /07123456789/); // the email has the full details
    assert.match(body.text, /https:\/\/samslogistics\.co\.uk\/admin/);
  });
});

test('WhatsApp message is URL-encoded and carries no phone number or address', async () => {
  const seen = [];
  await withFetch(async (url) => { seen.push(url); return { ok: true }; }, async () => {
    process.env.CALLMEBOT_PHONE = '+447700900123'; process.env.CALLMEBOT_APIKEY = 'k&1';
    delete process.env.RESEND_API_KEY; delete process.env.ALERT_EMAIL_TO;
    const out = await notify.notifyOwner(notify.supplyOrderAlert(sampleOrder));
    assert.deepEqual(out, ['skipped', 'sent']);
    const u = new URL(seen[0]);
    assert.equal(u.origin + u.pathname, 'https://api.callmebot.com/whatsapp.php');
    assert.equal(u.searchParams.get('phone'), '+447700900123');
    assert.equal(u.searchParams.get('apikey'), 'k&1');
    const text = u.searchParams.get('text');
    assert.match(text, /SO-ABC234/);
    assert.match(text, /4 items/);
    assert.ok(!/0712|Road|Payne/.test(text), 'no personal data in WhatsApp text');
  });
});

test('a failing or erroring channel never throws and does not stop the other', async () => {
  const errors = []; const realErr = console.error; console.error = (...a) => errors.push(a.join(' '));
  try {
    await withFetch(async (url) => {
      if (url.includes('resend')) return { ok: false, status: 500 };
      throw new Error('network down');
    }, async () => {
      process.env.RESEND_API_KEY = 're_test'; process.env.ALERT_EMAIL_TO = 'o@example.com';
      process.env.CALLMEBOT_PHONE = '+447700900123'; process.env.CALLMEBOT_APIKEY = 'k';
      assert.deepEqual(await notify.notifyOwner(notify.bookingAlert(sampleBooking)), ['failed', 'failed']);
      await notify.alertBooking(sampleBooking); // wrapper must resolve too
      await notify.alertSupplyOrder({ ...sampleOrder, items: null }); // bad data must not throw
    });
    assert.ok(errors.some((e) => /email failed.*HTTP 500/.test(e)));
    assert.ok(errors.every((e) => !/Ama|0712|Road/.test(e)), 'logs contain no customer data');
  } finally { console.error = realErr; }
});

test('supply order alert totals priced lines and flags items priced on request', () => {
  const a = notify.supplyOrderAlert(sampleOrder);
  assert.match(a.text, /3 x Cardboard box - small - £37\.50/);
  assert.match(a.text, /1 x Shipping barrel - large - price on request/);
  assert.match(a.text, /Total so far: £37\.50 \(\+ 1 item priced on request\)/);
  assert.match(a.text, /Address: 5 Road, London/);
  const pickup = notify.supplyOrderAlert({ ...sampleOrder, fulfilment: 'collection', address: null, items: [sampleOrder.items[0]] });
  assert.match(pickup.text, /Total: £37\.50/);
  assert.ok(!/Address:/.test(pickup.text));
  assert.equal(notify.supplyOrderAlert({ ...sampleOrder, email: 'a@b.co' }).replyTo, 'a@b.co');
  assert.equal(a.replyTo, undefined);
});

// ---------- contact form ----------
const { generateMessageRef } = await import('../lib/http.js');
const { CONTACT_SERVICES } = await import('../lib/constants.js');
const contact = (await import('../../api/contact.js')).default;
const adminMessages = (await import('../../api/admin/messages.js')).default;

const validMessage = () => ({
  name: 'Ama Mensah', email: 'ama@example.com', phone: '07123456789', service: 'Sea Freight',
  message: 'How much for two barrels to Accra?', website: '', consent: true,
});
async function postContact(body, method = 'POST') {
  const res = mockRes();
  await contact({ method, headers: {}, body }, res);
  return res;
}

test('contact helpers: message reference format and service list', () => {
  assert.match(generateMessageRef(), /^MS-[A-HJKMNP-Z2-9]{6}$/);
  assert.notEqual(generateMessageRef(), generateMessageRef());
  for (const s of ['Air Freight', 'Courier Service', 'Packaging Supplies', 'Other / general question']) {
    assert.ok(CONTACT_SERVICES.includes(s), s);
  }
});

test('POST /api/contact rejects bad input before touching the database', async () => {
  assert.equal((await postContact(validMessage(), 'GET')).statusCode, 405);
  for (const [field, value] of [
    ['name', '  '], ['email', ''], ['email', 'not-an-email'], ['phone', 'abc'], ['service', ''],
    ['service', 'Teleportation'], ['message', '   '], ['consent', false], ['consent', 'true'],
  ]) {
    const res = await postContact({ ...validMessage(), [field]: value });
    assert.equal(res.statusCode, 400, `${field}=${JSON.stringify(value)}`);
    assert.ok(res.body.error);
  }
  // phone is optional
  const ok = await postContact({ ...validMessage(), phone: '' });
  assert.notEqual(ok.statusCode, 400); // passes validation (500 here only because the test has no database)
});

test('contact honeypot returns a fake success without saving', async () => {
  const res = await postContact({ ...validMessage(), website: 'http://spam.example' });
  assert.equal(res.statusCode, 201);
  assert.match(res.body.reference, /^MS-/);
});

test('admin messages need a session and validate input', async () => {
  for (const method of ['GET', 'POST']) {
    const res = mockRes();
    await adminMessages({ method, query: {}, headers: {}, body: {} }, res);
    assert.equal(res.statusCode, 401, method);
  }
  const headers = { cookie: cookieOf(sessionCookie()) };
  for (const body of [{}, { id: 'x', action: 'handle' }, { id: 0, action: 'handle' }, { id: 1.5, action: 'handle' },
    { id: 1, action: 'explode' }, { id: 1 }]) {
    const res = mockRes();
    await adminMessages({ method: 'POST', headers, query: {}, body }, res);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
  const del = mockRes();
  await adminMessages({ method: 'DELETE', headers, query: {} }, del);
  assert.equal(del.statusCode, 405);
});

test('contact alert: email has the full message with reply-to, WhatsApp text has no personal data', () => {
  const a = notify.contactAlert({
    reference: 'MS-ABC234', name: 'Ama Mensah', email: 'ama@example.com', phone: '07123456789',
    service: 'Sea Freight', message: 'How much for two barrels?\nThanks',
  });
  assert.match(a.subject, /MS-ABC234.*Sea Freight/);
  assert.match(a.text, /Email: ama@example\.com/);
  assert.match(a.text, /How much for two barrels\?\nThanks/);
  assert.match(a.text, /https:\/\/samslogistics\.co\.uk\/admin/);
  assert.equal(a.replyTo, 'ama@example.com');
  assert.match(a.short, /MS-ABC234/);
  assert.ok(!/Ama|0712|barrels/.test(a.short), 'no personal data in the WhatsApp text');
  assert.match(notify.contactAlert({ reference: 'MS-X', name: 'A', email: 'a@b.co', service: 'Air Freight', message: 'hi' }).text, /Phone: -/);
});

// ---------- customer emails ----------
const customerMail = await import('../lib/customerMail.js');
const CUSTOMER_ENV = [...ALERT_ENV, 'CUSTOMER_EMAIL_FROM', 'REPLY_TO_EMAIL'];

async function withCustomerFetch(fake, fn) {
  const saved = Object.fromEntries(CUSTOMER_ENV.map((k) => [k, process.env[k]]));
  try { return await withFetch(fake, fn); } finally {
    for (const k of CUSTOMER_ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

test('customer email: skipped without key, without address, or with a bad address', async () => {
  let calls = 0;
  await withCustomerFetch(async () => { calls++; return { ok: true }; }, async () => {
    delete process.env.RESEND_API_KEY;
    assert.equal(await customerMail.emailBookingReceived(sampleBooking), 'skipped');
    process.env.RESEND_API_KEY = 're_test';
    assert.equal(await customerMail.emailBookingReceived({ ...sampleBooking, email: '' }), 'skipped');
    assert.equal(await customerMail.emailBookingReceived({ ...sampleBooking, email: 'not an email' }), 'skipped');
    assert.equal(await customerMail.emailSupplyReceived(sampleOrder), 'skipped'); // sample order has no email
    assert.equal(calls, 0);
  });
});

test('customer email: goes to the customer only, reply goes to the business inbox', async () => {
  const seen = [];
  await withCustomerFetch(async (url, init) => { seen.push({ url, body: JSON.parse(init.body) }); return { ok: true }; }, async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.ALERT_EMAIL_FROM = '"Sam\'s Logistics" <alerts@example.com>';
    delete process.env.CUSTOMER_EMAIL_FROM; delete process.env.REPLY_TO_EMAIL;
    assert.equal(await customerMail.emailBookingReceived(sampleBooking), 'sent');
    assert.equal(seen.length, 1);
    const m = seen[0].body;
    assert.equal(seen[0].url, 'https://api.resend.com/emails');
    assert.deepEqual(m.to, ['ama@example.com']);
    assert.equal(m.from, '"Sam\'s Logistics" <alerts@example.com>');
    assert.equal(m.reply_to, 'samslogistics.gh@gmail.com');
    assert.match(m.subject, /BR-ABC234/);
    assert.match(m.text, /Hello Ama,/);
    process.env.REPLY_TO_EMAIL = 'help@example.com';
    process.env.CUSTOMER_EMAIL_FROM = 'Sam <hello@example.com>';
    await customerMail.emailBookingReceived(sampleBooking);
    assert.equal(seen[1].body.reply_to, 'help@example.com');
    assert.equal(seen[1].body.from, 'Sam <hello@example.com>');
  });
});

test('customer email: failures and timeouts never throw', async () => {
  await withCustomerFetch(async () => { throw new Error('network down'); }, async () => {
    process.env.RESEND_API_KEY = 're_test';
    assert.equal(await customerMail.emailBookingReceived(sampleBooking), 'failed');
  });
  await withCustomerFetch(async () => ({ ok: false, status: 500 }), async () => {
    process.env.RESEND_API_KEY = 're_test';
    assert.equal(await customerMail.emailStatusUpdate({ trackingRef: 'SL-GH-ABC234', status: 'Departed UK', name: 'A', email: 'a@example.com' }), 'failed');
  });
});

test('customer email: texts are right and customer input never reaches subject or links', () => {
  process.env.SITE_URL = 'https://samslogistics.co.uk';
  const evil = { ...sampleBooking, name: 'Eve\r\nBcc: x@evil.com', reference: 'BR-ABC234' };
  const rec = customerMail.bookingReceivedMail(evil);
  assert.ok(!/[\r\n]/.test(rec.subject));
  assert.ok(!rec.subject.includes('Eve'));
  assert.match(rec.text, /not yet a confirmed booking/);

  const sup = customerMail.supplyReceivedMail({ ...sampleOrder, email: 'x@y.co' });
  assert.match(sup.text, /3 x Cardboard box - small - £37\.50/);
  assert.match(sup.text, /price on request/);
  assert.match(sup.text, /Nothing has been charged/);

  const acc = customerMail.bookingAcceptedMail({ ...sampleBooking, trackingRef: 'SL-GH-ABC234' });
  assert.match(acc.subject, /SL-GH-ABC234/);
  assert.match(acc.text, /https:\/\/samslogistics\.co\.uk\/\?track=SL-GH-ABC234#tracking/);

  const dec = customerMail.bookingDeclinedMail(sampleBooking);
  assert.match(dec.text, /not able to take this one on/);

  const st = customerMail.statusUpdateMail({ trackingRef: 'SL-GH-ABC234', status: 'Arrived at destination', location: 'Tema', note: 'Ready for delivery', name: 'Ama Mensah' });
  assert.equal(st.subject, 'Shipment SL-GH-ABC234: Arrived at destination');
  assert.match(st.text, /Location: Tema/);
  assert.match(st.text, /Note: Ready for delivery/);
  const bare = customerMail.statusUpdateMail({ trackingRef: 'SL-GH-ABC234', status: 'Departed UK', name: '' });
  assert.ok(!/Location:|Note:/.test(bare.text));
  assert.match(bare.text, /Hello there,/);
});

// ---- shared header/footer of the legal pages ----
test('legal pages are in sync with the shared header and footer', async () => {
  const fs = await import('node:fs');
  const { render, PAGES } = await import('../../scripts/build-pages.mjs');
  assert.equal(PAGES.length, 4);
  for (const page of PAGES) {
    const html = fs.readFileSync(new URL(`../../${page}.html`, import.meta.url), 'utf8');
    assert.equal(render(page, html), html, `${page}.html is out of date, run: npm run build:pages`);
    // exactly one footer link is highlighted: the page itself
    const active = [...html.matchAll(/href="(\w+)\.html" class="text-sams-gold font-bold/g)].map((m) => m[1]);
    assert.deepEqual(active, [page], `${page}.html highlights the wrong footer link`);
    assert.equal((html.match(/<header /g) || []).length, 1);
    assert.equal((html.match(/<footer /g) || []).length, 1);
  }
});

// ---- paging and search helper for the admin lists ----
test('listParams: page size, offset and safe search text', async () => {
  const { listParams, PAGE_SIZE } = await import('../../backend/lib/http.js');
  assert.equal(PAGE_SIZE, 25);
  assert.deepEqual(listParams({ query: {} }), { like: null, offset: 0, limit: 25 });
  assert.equal(listParams({ query: { offset: '50' } }).offset, 50);
  for (const bad of ['-5', 'abc', '1.5', '', undefined]) assert.equal(listParams({ query: { offset: bad } }).offset, 0, String(bad));
  assert.equal(listParams({ query: { offset: '99999999' } }).offset, 100000);
  assert.equal(listParams({ query: { q: '  Ann  ' } }).like, '%Ann%');
  // % _ and \ are escaped so they only match themselves
  assert.equal(listParams({ query: { q: '100%_x\\' } }).like, '%100\\%\\_x\\\\%');
  assert.equal(listParams({ query: { q: 'x'.repeat(200) } }).like.length, 62);
  assert.equal(listParams({ query: { q: '   ' } }).like, null);
});
