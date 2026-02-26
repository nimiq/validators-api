-- The `is_listed` column was added manually in remote D1 databases.
-- Keep this as a no-op migration so deploy-time migrations don't fail
-- with "duplicate column name: is_listed".
SELECT 1;
