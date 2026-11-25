CREATE FUNCTION audit_log_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- The one change allowed: the foreign key clearing actor_user_id when the user is deleted (the login snapshot stays).
    IF NEW.actor_user_id IS NULL
      AND (OLD.id, OLD.at, OLD.actor_login, OLD.action, OLD.target_type, OLD.target_id, OLD.metadata)
        IS NOT DISTINCT FROM (NEW.id, NEW.at, NEW.actor_login, NEW.action, NEW.target_type, NEW.target_id, NEW.metadata) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'audit_log is append-only';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.at > now() - interval '365 days' THEN
    RAISE EXCEPTION 'audit_log entries are kept for a year';
  END IF;
  RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER audit_log_guard BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_guard();
