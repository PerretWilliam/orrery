ALTER TABLE "user" ADD COLUMN "auth_suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "auth_secret_ciphertext" text;