-- ============================================================
-- customers テーブル作成 + トリガー + バックフィル
-- 管理画面の予約候補リスト専用テーブル
-- ============================================================

-- 1. テーブル作成
CREATE TABLE public.customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  name_kana TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  phone_normalized TEXT GENERATED ALWAYS AS (
    regexp_replace(phone, '[-\s\u3000]', '', 'g')
  ) STORED,
  email TEXT DEFAULT '',
  user_id UUID,
  line_user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 重複判定用ユニーク制約（名前 + 正規化電話番号）
CREATE UNIQUE INDEX idx_customers_name_phone ON public.customers (name, phone_normalized);

-- カタカナ検索用インデックス
CREATE INDEX idx_customers_name_kana ON public.customers (name_kana);

-- 権限設定（RLS無効、authenticated/anonにSELECT許可）
GRANT SELECT ON public.customers TO authenticated;
GRANT SELECT ON public.customers TO anon;

-- ============================================================
-- 2. 予約 INSERT/UPDATE 時の自動顧客同期トリガー
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_customer_from_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 名前が空なら何もしない
  IF NEW.name IS NULL OR NEW.name = '' THEN
    RETURN NEW;
  END IF;

  -- UPDATE時はuser_id/line_user_idの変更のみ対象
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.user_id IS NOT DISTINCT FROM OLD.user_id)
       AND (NEW.line_user_id IS NOT DISTINCT FROM OLD.line_user_id) THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.customers (name, name_kana, phone, email, user_id, line_user_id)
  VALUES (
    NEW.name,
    COALESCE(NEW.name_kana, ''),
    COALESCE(NEW.phone, ''),
    COALESCE(NEW.email, ''),
    NEW.user_id,
    NEW.line_user_id
  )
  ON CONFLICT (name, phone_normalized) DO UPDATE SET
    name_kana = CASE WHEN EXCLUDED.name_kana != '' THEN EXCLUDED.name_kana ELSE customers.name_kana END,
    email = CASE WHEN EXCLUDED.email != '' THEN EXCLUDED.email ELSE customers.email END,
    user_id = COALESCE(EXCLUDED.user_id, customers.user_id),
    line_user_id = COALESCE(EXCLUDED.line_user_id, customers.line_user_id),
    updated_at = now();

  RETURN NEW;
END;
$$;

-- INSERT + UPDATE(user_id/line_user_id変更)の両方で発火
CREATE TRIGGER trg_sync_customer_after_reservation
  AFTER INSERT OR UPDATE OF user_id, line_user_id ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_customer_from_reservation();

-- ============================================================
-- 3. 既存データのバックフィル
-- ============================================================

-- profiles から投入（先に実行 - 会員データ優先）
INSERT INTO public.customers (name, name_kana, phone, email, user_id, line_user_id)
SELECT DISTINCT ON (p.name, regexp_replace(COALESCE(p.phone,''), '[-\s\u3000]','','g'))
  COALESCE(p.name,''), COALESCE(p.name_kana,''), COALESCE(p.phone,''),
  COALESCE(p.email,''), p.id, p.line_user_id
FROM public.profiles p
WHERE p.name IS NOT NULL AND p.name != ''
ORDER BY p.name, regexp_replace(COALESCE(p.phone,''), '[-\s\u3000]','','g'), p.updated_at DESC
ON CONFLICT DO NOTHING;

-- reservations から投入（profilesにない顧客を追加）
INSERT INTO public.customers (name, name_kana, phone, email, user_id, line_user_id)
SELECT DISTINCT ON (r.name, regexp_replace(COALESCE(r.phone,''), '[-\s\u3000]','','g'))
  COALESCE(r.name,''), COALESCE(r.name_kana,''), COALESCE(r.phone,''),
  COALESCE(r.email,''), r.user_id, r.line_user_id
FROM public.reservations r
WHERE r.name IS NOT NULL AND r.name != ''
ORDER BY r.name, regexp_replace(COALESCE(r.phone,''), '[-\s\u3000]','','g'), r.created_at DESC
ON CONFLICT DO NOTHING;
