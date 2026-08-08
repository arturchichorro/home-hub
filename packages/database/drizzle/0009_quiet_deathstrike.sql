CREATE TABLE "household_module_settings" (
	"household_id" uuid NOT NULL,
	"module_key" text NOT NULL,
	"enabled" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_module_settings_household_id_module_key_pk" PRIMARY KEY("household_id","module_key")
);
--> statement-breakpoint
ALTER TABLE "household_module_settings" ADD CONSTRAINT "household_module_settings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;