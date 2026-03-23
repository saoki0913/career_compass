-- Align calendar_events with Drizzle schema (src/lib/db/schema.ts): missing updated_at caused SELECT failures.
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
