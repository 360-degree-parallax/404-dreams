CREATE TABLE push_config (id integer PRIMARY KEY NOT NULL, public_key text NOT NULL, private_jwk text NOT NULL);
--> statement-breakpoint
CREATE TABLE push_subscriptions (id text PRIMARY KEY NOT NULL, endpoint text NOT NULL UNIQUE, p256dh text NOT NULL, auth text NOT NULL, created_at integer NOT NULL, last_test_at integer NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE push_alerts (id text PRIMARY KEY NOT NULL, created_at integer NOT NULL, window_end integer NOT NULL, kind text NOT NULL, payload text NOT NULL);
--> statement-breakpoint
CREATE INDEX idx_push_alerts_time ON push_alerts(created_at);
--> statement-breakpoint
CREATE TABLE push_deliveries (alert_id text NOT NULL, subscription_id text NOT NULL, state text NOT NULL, attempts integer NOT NULL DEFAULT 0, updated_at integer NOT NULL, status integer, PRIMARY KEY(alert_id,subscription_id));
