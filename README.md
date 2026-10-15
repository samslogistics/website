# Sam's Logistics UK

Static site (HTML + Tailwind CDN) with a small backend on **Vercel serverless functions + Neon Postgres**.

## Structure

```
index.html, *.html          public pages
admin.html                  admin dashboard (password protected, noindex)
frontend/styles|scripts     CSS and browser JS (global_style.css, global_script.js, admin.js)
assets/                     images, icons
api/                        Vercel function entry points (URL = /api/...)
  track.js                  public: GET /api/track?ref=SL-GH-XXXXXX
  admin/session.js          login / logout / session check
  admin/shipments.js        list + create shipments
  admin/shipment.js         one shipment: details, add status update, delete
  booking.js                public: POST /api/booking (booking request from the home page form)
  admin/bookings.js         admin: list requests, accept (creates a shipment + tracking number) or decline
backend/lib                 shared server code (db, auth, helpers, constants)
backend/db/schema.sql       database schema
backend/tests               node:test unit tests (npm test)
```

## One-time setup

1. **Neon**: create a project, open the SQL Editor and run `backend/db/schema.sql`.
2. **Vercel** -> Project -> Settings -> Environment Variables, add (see `.env.example`):
   - `DATABASE_URL` - Neon pooled connection string
   - `ADMIN_PASSWORD` - long passphrase for `/admin.html`
   - `SESSION_SECRET` - random 32+ character string
3. Deploy (push to the connected repo, or `vercel --prod`).
4. Open `/admin.html`, sign in, create a test shipment, then look it up in the tracking form on the home page.

## Local development

```
npm install
cp .env.example .env     # fill in values
npx vercel dev
```
Opening the HTML files directly (file://) works for the layout, but `/api/*` only exists under `vercel dev` or on Vercel.

## Tracking numbers

Format `SL-<GH|JM|UK>-XXXXXX`, generated when you create a shipment. Customers only see status, service, destination and the timeline; names, emails and phone numbers are admin-only.

## Next phases

- Supplies catalogue + order requests (boxes, barrels, tape, shrink wrap)
- Email/WhatsApp notification on status change
