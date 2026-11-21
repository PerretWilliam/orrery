ALTER TABLE "instance_settings" ADD COLUMN "admin_claim_hash" text;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "admin_claim_expires_at" timestamp with time zone;