CREATE INDEX IF NOT EXISTS idx_events_name_time ON events(name,created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_visits_live_ip_time ON visits(first_at) WHERE ip IS NOT NULL;
