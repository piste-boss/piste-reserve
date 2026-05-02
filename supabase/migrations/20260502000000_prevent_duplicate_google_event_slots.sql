-- Googleカレンダー同期の同一予定・同一時刻の多重登録を防ぐ。
-- 繰り返し予定では同じgoogle_event_idが別日・別時刻で使われる場合があるため、
-- google_event_id単体ではなく日付・開始時刻との組み合わせで一意にする。

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_reservations_google_event_slot_unique'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.reservations
      WHERE google_event_id IS NOT NULL
        AND google_event_id <> ''
        AND (status IS NULL OR status <> 'cancelled')
      GROUP BY google_event_id, reservation_date, reservation_time
      HAVING COUNT(*) > 1
    ) THEN
      RAISE NOTICE 'Duplicate active google_event_id/date/time rows exist. Resolve duplicates before creating idx_reservations_google_event_slot_unique.';
    ELSE
      CREATE UNIQUE INDEX idx_reservations_google_event_slot_unique
        ON public.reservations (google_event_id, reservation_date, reservation_time)
        WHERE google_event_id IS NOT NULL
          AND google_event_id <> ''
          AND (status IS NULL OR status <> 'cancelled');
    END IF;
  END IF;
END $$;
