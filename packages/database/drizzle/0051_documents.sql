CREATE TABLE "document_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"object_key" text NOT NULL,
	"expected_file_id" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_files_context_id" UNIQUE("household_id","document_id","id"),
	CONSTRAINT "document_files_size" CHECK ("document_files"."byte_size" BETWEEN 1 AND 52428800),
	CONSTRAINT "document_files_filename" CHECK (length("document_files"."filename") BETWEEN 1 AND 255)
);
--> statement-breakpoint
CREATE TABLE "document_tag_assignments" (
	"household_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "document_tag_assignments_document_id_tag_id_pk" PRIMARY KEY("document_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "document_tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"color" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_tags_household_id_id" UNIQUE("household_id","id"),
	CONSTRAINT "document_tags_name" CHECK (length(trim("document_tags"."name")) BETWEEN 1 AND 50),
	CONSTRAINT "document_tags_color" CHECK ("document_tags"."color" IN ('slate','red','orange','amber','green','teal','blue','violet'))
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"file_id" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_household_id_id" UNIQUE("household_id","id"),
	CONSTRAINT "documents_title" CHECK (length(trim("documents"."title")) BETWEEN 1 AND 200),
	CONSTRAINT "documents_description" CHECK ("documents"."description" IS NULL OR length("documents"."description") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_tag_assignments" ADD CONSTRAINT "document_assignment_document_fk" FOREIGN KEY ("household_id","document_id") REFERENCES "public"."documents"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_tag_assignments" ADD CONSTRAINT "document_assignment_tag_fk" FOREIGN KEY ("household_id","tag_id") REFERENCES "public"."document_tags"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_tags" ADD CONSTRAINT "document_tags_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_current_file_fk" FOREIGN KEY ("household_id","id","file_id") REFERENCES "public"."document_files"("household_id","document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_assignments_tag" ON "document_tag_assignments" USING btree ("household_id","tag_id","document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_tags_active_name" ON "document_tags" USING btree ("household_id","normalized_name") WHERE "document_tags"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "documents_uploaded" ON "documents" USING btree ("household_id","uploaded_at","id") WHERE "documents"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "documents_title_order" ON "documents" USING btree ("household_id","title","id") WHERE "documents"."deleted_at" IS NULL;
--> statement-breakpoint
INSERT INTO household_module_settings (household_id,module_key,enabled)
 SELECT id,'documents',false FROM households ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER PUBLICATION home_hub_zero ADD TABLE documents,document_tags,document_tag_assignments,
 document_files (id,household_id,document_id,filename,content_type,byte_size,confirmed_at,created_at);