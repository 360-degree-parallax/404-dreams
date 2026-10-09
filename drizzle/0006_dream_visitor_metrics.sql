ALTER TABLE visits ADD COLUMN visitor_id text;
--> statement-breakpoint
CREATE INDEX idx_visits_visitor ON visits(visitor_id);
--> statement-breakpoint
CREATE TABLE visitors (id text PRIMARY KEY NOT NULL, first_at integer NOT NULL, last_at integer NOT NULL);
--> statement-breakpoint
CREATE INDEX idx_visitors_first_at ON visitors(first_at);
--> statement-breakpoint
CREATE TABLE visitor_days (visitor_id text NOT NULL, day integer NOT NULL, PRIMARY KEY(visitor_id,day));
--> statement-breakpoint
CREATE INDEX idx_visitor_days_day ON visitor_days(day);
--> statement-breakpoint
CREATE INDEX idx_events_session_time ON events(session_id,created_at);
