-- ============================================================
-- キャンセル後のかな検索バグ修正：マイグレーション
-- ============================================================

-- 1. reservations テーブルに status カラムを追加
-- 既存レコードはデフォルト値 'active' が適用される
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- 2. profiles テーブルに name_kana カラムを追加
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name_kana TEXT;
