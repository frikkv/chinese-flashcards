-- ============================================================
-- MANUAL SQL: Add status column to feedback table
-- Run this in Supabase SQL Editor
-- ============================================================

ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'new';
