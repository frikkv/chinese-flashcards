CREATE TABLE "announcements" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"author_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "announcements_published_idx" ON "announcements" USING btree ("is_published","is_pinned");
--> statement-breakpoint
-- RLS: anyone can read published announcements; writes are server-only via adminProcedure
ALTER TABLE "announcements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "announcements_select_published" ON "announcements" FOR SELECT USING (is_published = true);
--> statement-breakpoint
CREATE POLICY "announcements_service_role" ON "announcements" FOR ALL TO service_role USING (true) WITH CHECK (true);