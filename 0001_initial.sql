PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  space_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  revoked_at INTEGER,
  PRIMARY KEY (space_id, id),
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS devices_token ON devices(space_id, token_hash);

CREATE TABLE IF NOT EXISTS operations (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id TEXT NOT NULL,
  op_id TEXT NOT NULL,
  entity_hash TEXT NOT NULL,
  device_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  iv TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (space_id, op_id),
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS operations_cursor ON operations(space_id, row_id);

CREATE TABLE IF NOT EXISTS pairs (
  token_hash TEXT PRIMARY KEY,
  display_code TEXT NOT NULL,
  space_id TEXT NOT NULL,
  inviter_device TEXT NOT NULL,
  inviter_public_key TEXT NOT NULL,
  consumer_device TEXT,
  consumer_name TEXT,
  consumer_public_key TEXT,
  consumer_token_hash TEXT,
  claim_hash TEXT,
  wrapped_iv TEXT,
  wrapped_payload TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS pairs_expiry ON pairs(expires_at);
