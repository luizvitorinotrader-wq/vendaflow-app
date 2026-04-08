/*
  # Add UNIQUE constraint to profiles.email

  1. Changes
    - Add UNIQUE constraint to prevent duplicate email registrations
    
  2. Security
    - Prevents multiple accounts with same email
    - Protects against account takeover via duplicate registration
*/

-- Add unique constraint on email
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'profiles_email_unique'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_email_unique UNIQUE (email);
  END IF;
END $$;

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);