-- ============================================================
-- MANUAL SQL: user_retention table
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS "user_retention" (
  "user_id" text PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "current_streak" integer NOT NULL DEFAULT 0,
  "longest_streak" integer NOT NULL DEFAULT 0,
  "last_active_date" timestamp,
  "daily_goal_xp" integer NOT NULL DEFAULT 50,
  "current_day_xp" integer NOT NULL DEFAULT 0,
  "last_xp_update_date" timestamp
);

-- 2. Index
CREATE INDEX IF NOT EXISTS "user_retention_user_idx" ON "user_retention" ("user_id");

-- 3. Enable RLS
ALTER TABLE "user_retention" ENABLE ROW LEVEL SECURITY;

-- 4. Users can only read their own row
CREATE POLICY "user_retention_select_own"
  ON "user_retention" FOR SELECT
  USING (user_id = auth.uid()::text);

-- 5. Users can only insert their own row
CREATE POLICY "user_retention_insert_own"
  ON "user_retention" FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

-- 6. Users can only update their own row
CREATE POLICY "user_retention_update_own"
  ON "user_retention" FOR UPDATE
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- 7. Service role has full access (server-side via tRPC)
CREATE POLICY "user_retention_service_role"
  ON "user_retention" FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
