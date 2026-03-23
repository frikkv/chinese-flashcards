-- ============================================================
-- MANUAL SQL: announcement_reads table
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS "announcement_reads" (
  "id" text PRIMARY KEY NOT NULL,
  "announcement_id" text NOT NULL REFERENCES "announcements"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "read_at" timestamp DEFAULT now() NOT NULL
);

-- 2. Unique constraint: one read per user per announcement
ALTER TABLE "announcement_reads"
  ADD CONSTRAINT "announcement_reads_unique" UNIQUE ("announcement_id", "user_id");

-- 3. Index for fast lookups by user
CREATE INDEX IF NOT EXISTS "announcement_reads_user_idx"
  ON "announcement_reads" ("user_id");

-- 4. Enable RLS
ALTER TABLE "announcement_reads" ENABLE ROW LEVEL SECURITY;

-- 5. Users can only read their own rows
CREATE POLICY "announcement_reads_select_own"
  ON "announcement_reads" FOR SELECT
  USING (user_id = auth.uid()::text);

-- 6. Users can only insert rows for themselves
CREATE POLICY "announcement_reads_insert_own"
  ON "announcement_reads" FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

-- 7. Service role has full access (server-side via tRPC)
CREATE POLICY "announcement_reads_service_role"
  ON "announcement_reads" FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
