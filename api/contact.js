// Public endpoint: POST /api/contact
// Stores a message from the website contact form for the admin (and alerts the owner).
// Replaces the old third-party form service.
import crypto from 'node:crypto';
import { db } from '../backend/lib/db.js';
import { CONTACT_SERVICES } from '../backend/lib/constants.js';
import {
  json, methodGuard, bodyOf, clean, clientIp, generateMessageRef, EMAIL_RE, PHONE_RE,
} from '../backend/lib/http.js';
import { alertContactMessage } from '../backend/lib/notify.js';

const MAX_PER_HOUR = 5; // per visitor (salted IP hash)

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;

  const b = bodyOf(req);

  // Honeypot: real visitors never see or fill this field. Pretend success, store nothing.
  if (clean(b.website, 200)) return json(res, 201, { reference: generateMessageRef() });

  const name = clean(b.name, 120);
  const email = clean(b.email, 160);
  const phone = clean(b.phone, 40);
  const service = clean(b.service, 60);
  const message = clean(b.message, 2000);

  if (!name) return json(res, 400, { error: 'Please enter your name.' });
  if (!email || !EMAIL_RE.test(email)) return json(res, 400, { error: 'Please enter a valid email address.' });
  if (phone && !PHONE_RE.test(phone)) return json(res, 400, { error: 'Please enter a valid phone number.' });
  if (!CONTACT_SERVICES.includes(service)) return json(res, 400, { error: 'Please choose a service.' });
  if (!message) return json(res, 400, { error: 'Please write a message.' });
  if (b.consent !== true) return json(res, 400, { error: 'Please accept the privacy policy to continue.' });

  try {
    const sql = db();
    const ipHash = crypto
      .createHash('sha256')
      .update(`${clientIp(req)}|${process.env.SESSION_SECRET || ''}`)
      .digest('hex');

    const recent = await sql`
      SELECT count(*)::int AS n FROM contact_messages
      WHERE ip_hash = ${ipHash} AND created_at > now() - interval '1 hour'`;
    if (recent[0].n >= MAX_PER_HOUR) {
      return json(res, 429, { error: 'Too many messages. Please try again later or call us.' });
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const reference = generateMessageRef();
      try {
        await sql`
          INSERT INTO contact_messages
            (reference, customer_name, customer_email, customer_phone, service, message, ip_hash)
          VALUES
            (${reference}, ${name}, ${email}, ${phone}, ${service}, ${message}, ${ipHash})`;
        // Tell the owner (email / WhatsApp). Never throws, never blocks the customer's message.
        await alertContactMessage({ reference, name, email, phone, service, message });
        return json(res, 201, { reference });
      } catch (err) {
        if (err?.code !== '23505') throw err; // retry only on duplicate reference
      }
    }
    return json(res, 500, { error: 'Could not save your message. Please try again.' });
  } catch (err) {
    console.error('contact failed', err);
    return json(res, 500, { error: 'Something went wrong. Please try again or call us.' });
  }
}
