CREATE TABLE "ai_usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"feature_name" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"estimated_cost_usd" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_usage_feature_idx" ON "ai_usage_events" USING btree ("feature_name");
--> statement-breakpoint
CREATE INDEX "ai_usage_created_idx" ON "ai_usage_events" USING btree ("created_at");
--> statement-breakpoint
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "deny_all_ai_usage_events" ON public.ai_usage_events;
--> statement-breakpoint
CREATE POLICY "deny_all_ai_usage_events"
ON public.ai_usage_events
FOR ALL
TO public
USING (false)
WITH CHECK (false);