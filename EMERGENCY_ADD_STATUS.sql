1-- reservationsテーブルにstatusカラムが存在しないため追加するSQL

-- 1. statusカラムを追加（デフォルト値を 'active' に設定）
ALTER TABLE public.reservations 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- 2. 念のため既存レコードのNULLを更新
UPDATE public.reservations SET status = 'active' WHERE status IS NULL;
