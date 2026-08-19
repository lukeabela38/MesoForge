PRAGMA foreign_keys = ON;

CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY,
  workout_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (
    status IN (
      'received',
      'queued',
      'queue_failed',
      'processing',
      'retrying',
      'awaiting_feedback',
      'completed',
      'failed'
    )
  ),
  received_at TEXT NOT NULL,
  processed_at TEXT,
  updated_at TEXT,
  last_error TEXT
);

CREATE INDEX webhook_events_status_idx ON webhook_events (status, received_at);

CREATE TABLE workout_snapshots (
  workout_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  fetched_at TEXT NOT NULL
);

CREATE TABLE session_feedback (
  workout_id TEXT PRIMARY KEY REFERENCES workout_snapshots(workout_id) ON DELETE CASCADE,
  pump_rating INTEGER CHECK (pump_rating BETWEEN 0 AND 3),
  workload_rating INTEGER CHECK (workload_rating BETWEEN 0 AND 3),
  joint_pain_rating INTEGER CHECK (joint_pain_rating BETWEEN 0 AND 3),
  recovered_on_time INTEGER CHECK (recovered_on_time IN (0, 1)),
  submitted_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE recommendations (
  id TEXT PRIMARY KEY,
  workout_id TEXT NOT NULL REFERENCES workout_snapshots(workout_id) ON DELETE RESTRICT,
  ruleset_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('provisional', 'final', 'superseded')),
  input_json TEXT NOT NULL CHECK (json_valid(input_json)),
  output_json TEXT NOT NULL CHECK (json_valid(output_json)),
  rationale_json TEXT NOT NULL CHECK (json_valid(rationale_json)),
  created_at TEXT NOT NULL,
  finalized_at TEXT
);

CREATE INDEX recommendations_workout_idx ON recommendations (workout_id, created_at);

CREATE TABLE routine_updates (
  id TEXT PRIMARY KEY,
  recommendation_id TEXT NOT NULL UNIQUE REFERENCES recommendations(id) ON DELETE RESTRICT,
  hevy_routine_id TEXT NOT NULL,
  request_json TEXT NOT NULL CHECK (json_valid(request_json)),
  response_json TEXT CHECK (response_json IS NULL OR json_valid(response_json)),
  status TEXT NOT NULL CHECK (status IN ('blocked', 'pending', 'succeeded', 'failed')),
  attempted_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
