// Public endpoint: GET /api/track?ref=SL-GH-XXXXXX
// Returns status + timeline only. Never returns customer details.
import { db } from '../backend/lib/db.js';
import { SERVICES } from '../backend/lib/constants.js';
import { json, methodGuard, normalizeRef } from '../backend/lib/http.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['GET'])) return;

  const ref = normalizeRef(req.query?.ref);
  if (!ref) return json(res, 400, { error: 'Please enter a valid tracking number.' });

  try {
    const sql = db();
    const rows = await sql`
      SELECT id, tracking_ref, service, destination, status, created_at, updated_at
      FROM shipments WHERE tracking_ref = ${ref}`;
    if (!rows.length) {
      return json(res, 404, { error: 'We could not find that tracking number. Please check it and try again.' });
    }
    const s = rows[0];
    const events = await sql`
      SELECT status, location, note, created_at
      FROM shipment_events WHERE shipment_id = ${s.id}
      ORDER BY created_at DESC, id DESC`;

    return json(res, 200, {
      ref: s.tracking_ref,
      service: SERVICES[s.service] || s.service,
      destination: s.destination,
      status: s.status,
      updatedAt: s.updated_at,
      events,
    });
  } catch (err) {
    console.error('track failed', err);
    return json(res, 500, { error: 'Tracking is temporarily unavailable. Please try again shortly.' });
  }
}
