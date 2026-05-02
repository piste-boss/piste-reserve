-- Googleカレンダー同期の同一予定・同一時刻の多重登録を防ぐ。
-- 繰り返し予定では同じgoogle_event_idが別日・別時刻で使われる場合があるため、
-- google_event_id単体ではなく日付・開始時刻との組み合わせで一意にする。
-- 既に本番DBに過去の重複が存在するため、2026-05-02以降に作成される行を対象にする。

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_reservations_google_event_slot_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_reservations_google_event_slot_unique
      ON public.reservations (google_event_id, reservation_date, reservation_time)
      WHERE google_event_id IS NOT NULL
        AND google_event_id <> ''
        AND created_at >= TIMESTAMPTZ '2026-05-02 00:00:00+00'
        AND (status IS NULL OR status <> 'cancelled');
  END IF;
END $$;
