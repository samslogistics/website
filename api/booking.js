// Public endpoint: POST /api/booking
// Stores a booking request for the admin to accept or decline.
import crypto from 'node:crypto';
import { db } from '../backend/lib/db.js';
import { SERVICES, DESTINATIONS } from '../backend/lib/constants.js';
import {
  json, methodGuard, bodyOf, clean, clientIp, generateRequestRef,
  EMAIL_RE, PHONE_RE, validBookingDate,
} from '../backend/lib/http.js';
import { alertBooking } from '../backend/lib/notify.js';
import { emailBookingReceived } from '../backend/lib/customerMail.js';

const MAX_PER_HOUR = 5; // per visitor (salted IP hash)

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;

  const b = bodyOf(req);

  // Honeypot: real visitors never see or fill this field. Pretend success, store nothing.
  if (clean(b.website, 200)) return json(res, 201, { reference: generateRequestRef() });

  const service = clean(b.service, 40);
  const destination = clean(b.destination, 40);
  const name = clean(b.name, 120);
  const phone = clean(b.phone, 40);
  const email = clean(b.email, 160);
  const pickup = clean(b.pickupAddress, 300);
  const delivery = clean(b.deliveryAddress, 300);
  const description = clean(b.description, 1000);
  const preferredDate = clean(b.preferredDate, 10);

  if (!SERVICES[service]) return json(res, 400, { error: 'Please choose a service.' });
  if (!DESTINATIONS[destination]) return json(res, 400, { error: 'Please choose a destination.' });
  if (!name) return json(res, 400, { error: 'Please enter your name.' });
  if (!phone || !PHONE_RE.test(phone)) return json(res, 400, { error: 'Please enter a valid phone number.' });
  if (email && !EMAIL_RE.test(email)) return json(res, 400, { error: 'Please enter a valid email address.' });
  if (!pickup) return json(res, 400, { error: 'Please enter the pick-up address.' });
  if (!delivery) return json(res, 400, { error: 'Please enter the delivery address.' });
  if (preferredDate && !validBookingDate(preferredDate)) return json(res, 400, { error: 'Please choose a valid date.' });
  if (b.consent !== true) return json(res, 400, { error: 'Please accept the privacy policy to continue.' });

  try {
    const sql = db();
    const ipHash = crypto
      .createHash('sha256')
      .update(`${clientIp(req)}|${process.env.SESSION_SECRET || ''}`)
      .digest('hex');

    const recent = await sql`
      SELECT count(*)::int AS n FROM booking_requests
      WHERE ip_hash = ${ipHash} AND created_at > now() - interval '1 hour'`;
    if (recent[0].n >= MAX_PER_HOUR) {
      return json(res, 429, { error: 'Too many requests. Please try again later or call us.' });
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const reference = generateRequestRef();
      try {
        await sql`
          INSERT INTO booking_requests
            (reference, service, destination, customer_name, customer_email, customer_phone,
             pickup_address, delivery_address, preferred_date, description, ip_hash)
          VALUES
            (${reference}, ${service}, ${destination}, ${name}, ${email}, ${phone},
             ${pickup}, ${delivery}, ${preferredDate}, ${description}, ${ipHash})`;
        // Tell the owner (email / WhatsApp). Never throws, never blocks the customer's request.
        // Also confirm to the customer if they gave an email address (same rules: never throws).
        await Promise.all([
          alertBooking({ reference, service, destination, name, phone, email, pickup, delivery, preferredDate, description }),
          emailBookingReceived({ reference, service, destination, name, email }),
        ]);
        return json(res, 201, { reference });
      } catch (err) {
        if (err?.code !== '23505') throw err; // retry only on duplicate reference
      }
    }
    return json(res, 500, { error: 'Could not save your request. Please try again.' });
  } catch (err) {
    console.error('booking failed', err);
    return json(res, 500, { error: 'Something went wrong. Please try again or call us.' });
  }
}
