-- Rollback for 20260502 mail duplicate mitigation.
-- This removes the DB-side guard that prevents duplicate Google Calendar slots.
-- To fully roll back the Supabase Edge Function, redeploy:
-- backups/supabase/handle-reservation.before-mail-duplicate-fix.20260502.ts

DROP INDEX IF EXISTS public.idx_reservations_google_event_slot_unique;
