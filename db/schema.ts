import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  name: text('name').notNull(),
  sessionId: text('session_id').notNull(),
  viewId: text('view_id').notNull(),
  source: text('source').notNull(),
  format: text('format').notNull(),
  palette: text('palette').notNull(),
  colors: text('colors').notNull(),
  ratio: text('ratio').notNull(),
  comboKey: text('combo_key').notNull(),
  comboLabel: text('combo_label').notNull(),
  seed: integer('seed').notNull(),
  weight: real('weight').notNull(),
  detail: real('detail').notNull(),
  spark: real('spark').notNull(),
}, table => [index('idx_events_created_at').on(table.createdAt), index('idx_events_view_name').on(table.viewId, table.name)]);

export const adminCredentials = sqliteTable('admin_credentials', {
  id: integer('id').primaryKey(),
  hash: text('hash').notNull(),
  salt: text('salt').notNull(),
  version: integer('version').notNull(),
  mustChange: integer('must_change').notNull(),
  failures: integer('failures').notNull(),
  lockedUntil: integer('locked_until').notNull(),
});
export const adminSessions = sqliteTable('admin_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  version: integer('version').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, table => [index('idx_admin_sessions_expires_at').on(table.expiresAt)]);

export const visits = sqliteTable('visits', {
  sessionId: text('session_id').primaryKey(),
  firstAt: integer('first_at').notNull(),
  lastAt: integer('last_at').notNull(),
  ip: text('ip'),
  channel: text('channel').notNull(),
  medium: text('medium').notNull(),
  campaign: text('campaign').notNull(),
  content: text('content').notNull(),
  referrer: text('referrer').notNull(),
  evidence: text('evidence').notNull(),
}, table => [index('idx_visits_first_at').on(table.firstAt)]);

export const guestbook = sqliteTable('guestbook', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  sessionId: text('session_id').notNull(),
  viewId: text('view_id').notNull(),
  text: text('text').notNull(),
  imageKey: text('image_key').notNull(),
  name: text('name').notNull().default('ANON'),
  passwordHash: text('password_hash'),
  passwordSalt: text('password_salt'),
  failures: integer('failures').notNull().default(0),
  lockedUntil: integer('locked_until').notNull().default(0),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
}, table => [index('idx_guestbook_created_at').on(table.createdAt), uniqueIndex('idx_guestbook_view_id').on(table.viewId)]);

export const guestbookLikes = sqliteTable('guestbook_likes', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull(),
  voterHash: text('voter_hash').notNull(),
  createdAt: integer('created_at').notNull(),
}, table => [uniqueIndex('idx_guestbook_like_voter').on(table.postId, table.voterHash)]);
