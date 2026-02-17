-- 既存予約に profiles の user_id / line_user_id を同期（一括バックフィル）
-- マッチ条件: 名前+電話番号(正規化)、またはメールアドレス

-- 1. 名前 + 電話番号(正規化) で一致
UPDATE public.reservations r
SET
  user_id = p.id,
  line_user_id = COALESCE(r.line_user_id, p.line_user_id)
FROM public.profiles p
WHERE r.user_id IS NULL
  AND p.name IS NOT NULL AND p.name != ''
  AND r.name = p.name
  AND regexp_replace(COALESCE(r.phone, ''), '[-\s\u3000]', '', 'g') = regexp_replace(COALESCE(p.phone, ''), '[-\s\u3000]', '', 'g')
  AND regexp_replace(COALESCE(p.phone, ''), '[-\s\u3000]', '', 'g') != '';

-- 2. メールアドレスで一致（まだ user_id が埋まっていないもの）
UPDATE public.reservations r
SET
  user_id = p.id,
  line_user_id = COALESCE(r.line_user_id, p.line_user_id)
FROM public.profiles p
WHERE r.user_id IS NULL
  AND p.email IS NOT NULL AND p.email != ''
  AND r.email = p.email;

-- 3. user_id はあるが line_user_id がない予約に、profiles の line_user_id を補完
UPDATE public.reservations r
SET line_user_id = p.line_user_id
FROM public.profiles p
WHERE r.user_id = p.id
  AND r.line_user_id IS NULL
  AND p.line_user_id IS NOT NULL;
