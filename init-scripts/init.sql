-- init.sql - PostgreSQL initialization script
-- This script runs when the PostgreSQL container starts for the first time

-- Create extensions (if needed)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create any initial tables or data here
-- (Currently using MongoDB as primary database, PostgreSQL for future extensions)

-- Example: Create a simple audit log table for future use
-- CREATE TABLE IF NOT EXISTS audit_logs (
--     id SERIAL PRIMARY KEY,
--     timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     action VARCHAR(255),
--     user_id VARCHAR(255),
--     details JSONB
-- );

-- Example: Create indexes for performance
-- CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
-- CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);