CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"card_context" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_word_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"words_json" text NOT NULL,
	"word_count" integer NOT NULL,
	"dialect" text DEFAULT 'mandarin' NOT NULL,
	"source_file_name" text,
	"is_favorited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "distractor_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"vocab_key" text NOT NULL,
	"correct_answer" text NOT NULL,
	"distractors_json" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flashcard_progress" (
	"user_id" text NOT NULL,
	"card_id" text NOT NULL,
	"dialect" text DEFAULT 'mandarin' NOT NULL,
	"times_correct" integer DEFAULT 0 NOT NULL,
	"times_attempted" integer DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "flashcard_progress_user_id_card_id_dialect_pk" PRIMARY KEY("user_id","card_id","dialect")
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"id" text PRIMARY KEY NOT NULL,
	"sender_id" text NOT NULL,
	"receiver_id" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_unique_pair" UNIQUE("sender_id","receiver_id")
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"word_set_key" text NOT NULL,
	"word_set_detail" text DEFAULT '' NOT NULL,
	"mode" text NOT NULL,
	"session_size" integer NOT NULL,
	"dialect" text DEFAULT 'mandarin' NOT NULL,
	"correct_count" integer NOT NULL,
	"total_count" integer NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_last_session" (
	"user_id" text PRIMARY KEY NOT NULL,
	"word_set_key" text NOT NULL,
	"word_set_detail" text NOT NULL,
	"mode" text NOT NULL,
	"session_size" integer NOT NULL,
	"dialect" text DEFAULT 'mandarin' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"bio" text,
	"username_confirmed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_word_sets" ADD CONSTRAINT "custom_word_sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_progress" ADD CONSTRAINT "flashcard_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_receiver_id_users_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_last_session" ADD CONSTRAINT "user_last_session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_userId_idx" ON "chat_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "custom_word_sets_userId_idx" ON "custom_word_sets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "distractor_sets_vocabKey_idx" ON "distractor_sets" USING btree ("vocab_key");--> statement-breakpoint
CREATE INDEX "flashcard_progress_userId_idx" ON "flashcard_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "friendships_sender_idx" ON "friendships" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "friendships_receiver_idx" ON "friendships" USING btree ("receiver_id");--> statement-breakpoint
CREATE INDEX "study_sessions_userId_idx" ON "study_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "study_sessions_userId_completedAt_idx" ON "study_sessions" USING btree ("user_id","completed_at");--> statement-breakpoint
CREATE INDEX "user_profiles_username_idx" ON "user_profiles" USING btree ("username");