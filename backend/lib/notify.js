// Owner alerts for new customer requests (booking requests, supply orders).
// Two optional channels, each switched on by environment variables:
//   Email     RESEND_API_KEY + ALERT_EMAIL_TO   (optional: ALERT_EMAIL_FROM)
//   WhatsApp  CALLMEBOT_PHONE + CALLMEBOT_APIKEY
// A channel with missing settings is skipped. Alerts NEVER throw and never block a customer's
// request: every call has a short timeout and failures are only logged (without customer data).
// WhatsApp messages carry no phone numbers or addresses; the email has the full details.
import { SERVICES, FULFILMENT } from './constants.js';

const TIMEOUT_MS = 3000;

const siteUrl = () => (process.env.SITE_URL || 'https://samslogistics.co.uk').replace(/\/+$/, '');
const adminUrl = () => `${siteUrl()}/admin`;

export const gbp = (pence) => `£${(pence / 100).toFixed(2)}`;

async function request(url, init = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  } finally {
    clearTimeout(timer);
  }
}

async function sendEmail({ subject, text, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  if (!key || !to) return 'skipped';
  const from = process.env.ALERT_EMAIL_FROM || "Sam's Logistics <onboarding@resend.dev>";
  const payload = { from, to: [to], subject, text };
  if (replyTo) payload.reply_to = replyTo;
  await request('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return 'sent';
}

async function sendWhatsApp(text) {
  const phone = process.env.CALLMEBOT_PHONE;
  const apikey = process.env.CALLMEBOT_APIKEY;
  if (!phone || !apikey) return 'skipped';
  const q = `phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
  await request(`https://api.callmebot.com/whatsapp.php?${q}`);
  return 'sent';
}

// Sends one alert over every configured channel. Resolves whatever happens.
export async function notifyOwner(alert) {
  const channels = ['email', 'whatsapp'];
  const results = await Promise.allSettled([sendEmail(alert), sendWhatsApp(alert.short)]);
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`alert via ${channels[i]} failed:`, r.reason?.name === 'AbortError' ? 'timeout' : r.reason?.message);
    }
  });
  return results.map((r) => (r.status === 'fulfilled' ? r.value : 'failed'));
}

const orBlank = (v) => (v ? String(v) : '-');
const footer = () => `\n\nOpen the admin to handle it: ${adminUrl()}`;

export function bookingAlert(r) {
  const service = SERVICES[r.service] || r.service;
  const text = [
    `New booking request ${r.reference}`,
    '',
    `Service: ${service}`,
    `Destination: ${r.destination}`,
    `Name: ${r.name}`,
    `Phone: ${r.phone}`,
    `Email: ${orBlank(r.email)}`,
    `Pick-up: ${r.pickup}`,
    `Delivery: ${r.delivery}`,
    `Preferred date: ${orBlank(r.preferredDate)}`,
    `Details: ${orBlank(r.description)}`,
  ].join('\n') + footer();
  return {
    subject: `New booking request ${r.reference} - ${service}`,
    text,
    short: `New booking request ${r.reference} (${service}, ${r.destination}). Check the admin: ${adminUrl()}`,
    replyTo: r.email || undefined,
  };
}

export function supplyOrderAlert(o) {
  const fulfilment = FULFILMENT[o.fulfilment] || o.fulfilment;
  const lines = o.items.map((i) => {
    const price = i.unitPricePence === null ? 'price on request' : `${gbp(i.unitPricePence * i.qty)}`;
    return `  ${i.qty} x ${i.name} - ${price}`;
  });
  const priced = o.items.filter((i) => i.unitPricePence !== null);
  const onRequest = o.items.length - priced.length;
  const sum = priced.reduce((s, i) => s + i.unitPricePence * i.qty, 0);
  const total = onRequest
    ? `Total so far: ${gbp(sum)} (+ ${onRequest} item${onRequest > 1 ? 's' : ''} priced on request)`
    : `Total: ${gbp(sum)}`;
  const count = o.items.reduce((s, i) => s + i.qty, 0);
  const text = [
    `New supply order ${o.reference}`,
    '',
    ...lines,
    total,
    '',
    `Fulfilment: ${fulfilment}`,
    ...(o.fulfilment === 'delivery' ? [`Address: ${orBlank(o.address)}`] : []),
    `Name: ${o.name}`,
    `Phone: ${o.phone}`,
    `Email: ${orBlank(o.email)}`,
    `Note: ${orBlank(o.note)}`,
  ].join('\n') + footer();
  return {
    subject: `New supply order ${o.reference} - ${count} item${count > 1 ? 's' : ''}`,
    text,
    short: `New supply order ${o.reference} (${count} item${count > 1 ? 's' : ''}, ${fulfilment.toLowerCase()}). Check the admin: ${adminUrl()}`,
    replyTo: o.email || undefined,
  };
}

export function contactAlert(m) {
  const text = [
    `New website message ${m.reference}`,
    '',
    `Name: ${m.name}`,
    `Email: ${m.email}`,
    `Phone: ${orBlank(m.phone)}`,
    `About: ${m.service}`,
    '',
    m.message,
  ].join('\n') + footer();
  return {
    subject: `New website message ${m.reference} - ${m.service}`,
    text,
    short: `New website message ${m.reference} (${m.service}). Check the admin: ${adminUrl()}`,
    replyTo: m.email || undefined,
  };
}

// Used by the handlers: build + send, swallow everything.
export async function alertBooking(r) {
  try { await notifyOwner(bookingAlert(r)); } catch (e) { console.error('booking alert failed:', e?.message); }
}
export async function alertSupplyOrder(o) {
  try { await notifyOwner(supplyOrderAlert(o)); } catch (e) { console.error('order alert failed:', e?.message); }
}
export async function alertContactMessage(m) {
  try { await notifyOwner(contactAlert(m)); } catch (e) { console.error('contact alert failed:', e?.message); }
}
