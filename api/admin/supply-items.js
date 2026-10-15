// Admin catalogue editor.
// GET    /api/admin/supply-items            -> every item, including hidden ones
// POST   /api/admin/supply-items            -> create (no id) or update (with id)
// DELETE /api/admin/supply-items?id=123     -> delete an item (old orders keep their copy of the name/price)
import { db } from '../../backend/lib/db.js';
import { requireAdmin } from '../../backend/lib/auth.js';
import { SUPPLY_CATEGORIES } from '../../backend/lib/constants.js';
import { json, methodGuard, bodyOf, clean, parsePricePence } from '../../backend/lib/http.js';

const asId = (v) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
};

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['GET', 'POST', 'DELETE'])) return;
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === 'GET') {
      const items = await db()`
        SELECT id, name, category, description, unit, price_pence, active, sort_order
        FROM supply_items ORDER BY sort_order, id`;
      return json(res, 200, { items });
    }

    if (req.method === 'DELETE') {
      const id = asId(req.query?.id);
      if (!id) return json(res, 400, { error: 'Invalid item id.' });
      const rows = await db()`DELETE FROM supply_items WHERE id = ${id} RETURNING id`;
      if (!rows.length) return json(res, 404, { error: 'Item not found.' });
      return json(res, 200, { ok: true });
    }

    const b = bodyOf(req);
    const name = clean(b.name, 120);
    const category = clean(b.category, 40);
    const description = clean(b.description, 300);
    const unit = clean(b.unit, 30) || 'each';
    const price = parsePricePence(b.price);
    // Blank sort order: new products go to the end of the list, existing products keep their place.
    const blankSort = b.sortOrder === '' || b.sortOrder === undefined || b.sortOrder === null;
    const sortOrder = blankSort ? null : Number(b.sortOrder);
    const active = b.active !== false;
    const hasId = b.id !== undefined && b.id !== null && b.id !== '';
    const id = hasId ? asId(b.id) : null;

    if (hasId && !id) return json(res, 400, { error: 'Invalid item id.' });
    if (!name) return json(res, 400, { error: 'Please enter a product name.' });
    if (!SUPPLY_CATEGORIES.includes(category)) return json(res, 400, { error: 'Please choose a category.' });
    if (!price.ok) return json(res, 400, { error: 'Enter the price in pounds, for example 12.50, or leave it blank for "price on request".' });
    if (sortOrder !== null && (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999)) {
      return json(res, 400, { error: 'Sort order must be a whole number from 0 to 9999.' });
    }

    const sql = db();
    if (id) {
      const rows = await sql`
        UPDATE supply_items
        SET name = ${name}, category = ${category}, description = ${description}, unit = ${unit},
            price_pence = ${price.pence}, active = ${active}, sort_order = COALESCE(${sortOrder}, sort_order)
        WHERE id = ${id} RETURNING id`;
      if (!rows.length) return json(res, 404, { error: 'Item not found.' });
      return json(res, 200, { ok: true, id });
    }
    const rows = await sql`
      INSERT INTO supply_items (name, category, description, unit, price_pence, active, sort_order)
      VALUES (${name}, ${category}, ${description}, ${unit}, ${price.pence}, ${active},
              COALESCE(${sortOrder}, (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM supply_items)))
      RETURNING id`;
    return json(res, 201, { ok: true, id: Number(rows[0].id) });
  } catch (err) {
    console.error('supply items failed', err);
    return json(res, 500, { error: 'Something went wrong.' });
  }
}
