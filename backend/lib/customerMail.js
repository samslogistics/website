// Emails to CUSTOMERS about their own order (not marketing). Sent only when the customer gave an
// email address and RESEND_API_KEY is set. Like the owner alerts, these NEVER throw and never block
// the request that triggered them: short timeout, failures are only logged (no customer data).
//
// Settings (all optional except RESEND_API_KEY):
//   CUSTOMER_EMAIL_FROM  sender, falls back to ALERT_EMAIL_FROM, then the Resend sandbox sender
//   REPLY_TO_EMAIL       where customer replies go (default: the Gmail inbox of the business)
//   SITE_URL             used for the tracking link
//
// Safety: subjects and links only contain our own references and fixed status names. Anything the
// customer typed appears only in the plain-text body, never in headers.
import { SERVICES, FULFILMENT } from './constants.js';
import { EMAIL_RE } from './http.js';
import { request, siteUrl, describeItems } from './notify.js';

const PHONE = '07432294414';
const brand = "Sam's Logistics UK";

const replyTo = () => process.env.REPLY_TO_EMAIL || 'samslogistics.gh@gmail.com';
const fromAddress = () =>
  process.env.CUSTOMER_EMAIL_FROM || process.env.ALERT_EMAIL_FROM || "Sam's Logistics <onboarding@resend.dev>";

export const trackUrl = (ref) => `${siteUrl()}/?track=${encodeURIComponent(ref)}#tracking`;

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';

const signOff = () => [
  '',
  `Questions? Just reply to this email, or call / WhatsApp us on ${PHONE}.`,
  '',
  `${brand}`,
  siteUrl(),
].join('\n');

// Returns 'sent' | 'skipped' | 'failed'. Never throws.
export async function sendCustomerEmail({ to, subject, text }) {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key || typeof to !== 'string' || !EMAIL_RE.test(to.trim())) return 'skipped';
    await request('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromAddress(), to: [to.trim()], reply_to: replyTo(), subject, text }),
    });
    return 'sent';
  } catch (e) {
    console.error('customer email failed:', e?.name === 'AbortError' ? 'timeout' : e?.message);
    return 'failed';
  }
}

// ---- message builders (pure, easy to test) ----

export function bookingReceivedMail(r) {
  const service = SERVICES[r.service] || r.service;
  return {
    subject: `We received your request ${r.reference}`,
    text: [
      `Hello ${firstName(r.name)},`,
      '',
      `Thank you for your booking request with ${brand}. We have received it and will contact you shortly to confirm the details and the price.`,
      '',
      `Reference: ${r.reference}`,
      `Service: ${service}`,
      `Destination: ${r.destination}`,
      '',
      'This is a request, not yet a confirmed booking. You will get your tracking number as soon as we accept it.',
      signOff(),
    ].join('\n'),
  };
}

export function supplyReceivedMail(o) {
  const { lines, total } = describeItems(o.items);
  const fulfilment = FULFILMENT[o.fulfilment] || o.fulfilment;
  return {
    subject: `We received your supplies order ${o.reference}`,
    text: [
      `Hello ${firstName(o.name)},`,
      '',
      `Thank you for your supplies order with ${brand}. We have received it and will contact you shortly to confirm availability and payment.`,
      '',
      `Reference: ${o.reference}`,
      ...lines,
      total,
      `Fulfilment: ${fulfilment}`,
      '',
      'Nothing has been charged. You pay later, after we have confirmed your order.',
      signOff(),
    ].join('\n'),
  };
}

export function bookingAcceptedMail(r) {
  const service = SERVICES[r.service] || r.service;
  return {
    subject: `Your booking is accepted - tracking number ${r.trackingRef}`,
    text: [
      `Hello ${firstName(r.name)},`,
      '',
      `Good news: your booking ${r.reference} (${service} to ${r.destination}) has been accepted.`,
      '',
      `Your tracking number: ${r.trackingRef}`,
      `Track your shipment any time: ${trackUrl(r.trackingRef)}`,
      signOff(),
    ].join('\n'),
  };
}

export function bookingDeclinedMail(r) {
  return {
    subject: `About your request ${r.reference}`,
    text: [
      `Hello ${firstName(r.name)},`,
      '',
      `Thank you for your request ${r.reference}. Unfortunately we are not able to take this one on.`,
      `If you would like to talk it through or change the details, please reply to this email or call us.`,
      signOff(),
    ].join('\n'),
  };
}

export function statusUpdateMail(s) {
  return {
    subject: `Shipment ${s.trackingRef}: ${s.status}`,
    text: [
      `Hello ${firstName(s.name)},`,
      '',
      `There is an update on your shipment ${s.trackingRef}.`,
      '',
      `Status: ${s.status}`,
      ...(s.location ? [`Location: ${s.location}`] : []),
      ...(s.note ? [`Note: ${s.note}`] : []),
      '',
      `Full tracking history: ${trackUrl(s.trackingRef)}`,
      signOff(),
    ].join('\n'),
  };
}

// ---- helpers used by the API handlers ----
export const emailBookingReceived = (r) => r.email ? sendCustomerEmail({ to: r.email, ...bookingReceivedMail(r) }) : 'skipped';
export const emailSupplyReceived = (o) => o.email ? sendCustomerEmail({ to: o.email, ...supplyReceivedMail(o) }) : 'skipped';
export const emailBookingAccepted = (r) => r.email ? sendCustomerEmail({ to: r.email, ...bookingAcceptedMail(r) }) : 'skipped';
export const emailBookingDeclined = (r) => r.email ? sendCustomerEmail({ to: r.email, ...bookingDeclinedMail(r) }) : 'skipped';
export const emailStatusUpdate = (s) => s.email ? sendCustomerEmail({ to: s.email, ...statusUpdateMail(s) }) : 'skipped';
