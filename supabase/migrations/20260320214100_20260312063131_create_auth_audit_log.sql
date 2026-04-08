/*
  # Create Auth Audit Log Table

  1. New Tables
    - `auth_audit_log`
      - `id` (uuid, primary key) - unique identifier for each log entry
      - `user_id` (uuid, nullable) - reference to user who performed the action
      - `event_type` (text) - type of authentication event
      - `event_status` (text) - success or failure
      - `ip_address` (text, nullable) - IP address of the request
      - `user_agent` (text, nullable) - browser/client information
      - `metadata` (jsonb, nullable) - additional event data
      - `created_at` (timestamptz) - when the event occurred

  2. Security
    - Enable RLS on `auth_audit_log` table
    - Add policy for service role to insert audit logs
    - Add policy for authenticated users to read their own audit logs

  3. Indexes
    - Add index on user_id for faster queries
    - Add index on event_type for filtering
    - Add index on created_at for time-based queries

  Event types:
    - login_success
    - login_failed
    - logout
    - password_reset_requested
    - password_reset_completed
    - magic_link_sent
    - magic_link_used
    - session_expired
    - signup_success
    - signup_failed
*/

CREATE TABLE IF NOT EXISTS auth_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_status text NOT NULL CHECK (event_status IN ('success', 'failure')),
  ip_address text,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE auth_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can insert audit logs"
  ON auth_audit_log
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can read own audit logs"
  ON auth_audit_log
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_auth_audit_log_user_id ON auth_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_log_event_type ON auth_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_auth_audit_log_created_at ON auth_audit_log(created_at DESC);
