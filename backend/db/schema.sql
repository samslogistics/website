-- Sam's Logistics UK - database schema (Neon / Postgres)
-- Run once in the Neon SQL Editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS shipments (
    id              BIGSERIAL PRIMARY KEY,
    tracking_ref    TEXT        NOT NULL UNIQUE,
    service         TEXT        NOT NULL,   -- air_freight | sea_freight | doorstep | house_removal | store_pickup | courier
    destination     TEXT        NOT NULL,   -- Ghana | Jamaica | UK
    customer_name   TEXT        NOT NULL,
    customer_email  TEXT,
    customer_phone  TEXT,
    receiver_name   TEXT,
    description     TEXT,
    status          TEXT        NOT NULL DEFAULT 'Order received',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shipment_events (
    id           BIGSERIAL PRIMARY KEY,
    shipment_id  BIGINT      NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    status       TEXT        NOT NULL,
    location     TEXT,
    note         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment ON shipment_events (shipment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipments_created ON shipments (created_at DESC);

-- ---------------------------------------------------------------------------
-- Booking requests (added in phase 2). Safe to re-run.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS booking_requests (
    id               BIGSERIAL PRIMARY KEY,
    reference        TEXT        NOT NULL UNIQUE,          -- BR-XXXXXX, shown to the customer
    service          TEXT        NOT NULL,                 -- same keys as shipments.service
    destination      TEXT        NOT NULL,                 -- Ghana | Jamaica | UK
    customer_name    TEXT        NOT NULL,
    customer_email   TEXT,
    customer_phone   TEXT        NOT NULL,
    pickup_address   TEXT        NOT NULL,
    delivery_address TEXT        NOT NULL,
    preferred_date   DATE,
    description      TEXT,
    status           TEXT        NOT NULL DEFAULT 'new',   -- new | accepted | declined
    shipment_ref     TEXT,                                 -- set when accepted
    ip_hash          TEXT,                                 -- salted hash, used only for rate limiting
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    handled_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_booking_requests_status ON booking_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_requests_ip ON booking_requests (ip_hash, created_at);
