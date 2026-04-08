/*
  # Enhance Audit Logging
  
  1. Changes
    - Add indexes for better query performance on user_id, event_type, and created_at
    - Add helper function to log events easily from application code
  
  2. Performance Improvements
    - Index on user_id for filtering by user
    - Index on event_type for filtering by event type
    - Index on created_at (DESC) for time-based queries and recent events
  
  3. New Functions
    - `log_audit_event()` - Helper function to insert audit log entries
      - Parameters: user_id, event_type, event_status, metadata (optional)
      - SECURITY DEFINER to allow consistent logging regardless of caller permissions
*/

-- Add indexes for better query performance (these may already exist from previous migration)
CREATE INDEX IF NOT EXISTS idx_auth_audit_log_user_id 
  ON auth_audit_log(user_id);

CREATE INDEX IF NOT EXISTS idx_auth_audit_log_event_type 
  ON auth_audit_log(event_type);

CREATE INDEX IF NOT EXISTS idx_auth_audit_log_created_at 
  ON auth_audit_log(created_at DESC);

-- Create helper function to log audit events
CREATE OR REPLACE FUNCTION log_audit_event(
  p_user_id uuid,
  p_event_type text,
  p_event_status text,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void AS $$
BEGIN
  INSERT INTO auth_audit_log (
    user_id,
    event_type,
    event_status,
    metadata,
    created_at
  ) VALUES (
    p_user_id,
    p_event_type,
    p_event_status,
    p_metadata,
    now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
