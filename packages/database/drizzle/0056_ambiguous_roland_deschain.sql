CREATE TABLE "list_flashcards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"sort_key" integer NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_flashcards_front" CHECK (length("list_flashcards"."front") BETWEEN 1 AND 10000 AND "list_flashcards"."front" ~ '[^[:space:]]'),
	CONSTRAINT "list_flashcards_back" CHECK (length("list_flashcards"."back") BETWEEN 1 AND 10000 AND "list_flashcards"."back" ~ '[^[:space:]]')
);
--> statement-breakpoint
ALTER TABLE "lists" DROP CONSTRAINT "lists_kind";--> statement-breakpoint
ALTER TABLE "list_flashcards" ADD CONSTRAINT "list_flashcards_household_list_fk" FOREIGN KEY ("household_id","list_id") REFERENCES "public"."lists"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "list_flashcards_list_sort_id" ON "list_flashcards" USING btree ("household_id","list_id","sort_key","id") WHERE "list_flashcards"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_kind" CHECK ("lists"."kind" IN ('checklist', 'moodboard', 'flashcards'));
--> statement-breakpoint
ALTER PUBLICATION home_hub_zero ADD TABLE list_flashcards;