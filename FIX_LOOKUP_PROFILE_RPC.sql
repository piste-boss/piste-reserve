-- 管理者用: メールまたは電話番号から profiles の user_id, line_user_id を取得する関数
-- SECURITY DEFINER により RLS をバイパスする
CREATE OR REPLACE FUNCTION public.lookup_profile_for_reservation(
  _email TEXT DEFAULT NULL,
  _phone TEXT DEFAULT NULL
)
RETURNS TABLE(user_id UUID, line_user_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  normalized_phone TEXT;
BEGIN
  -- 管理者チェック
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized: admin only';
  END IF;

  -- 電話番号正規化（ハイフン・スペース・全角スペースを除去）
  normalized_phone := regexp_replace(COALESCE(_phone, ''), '[-\s\u3000]', '', 'g');

  -- 1. メールアドレスで検索
  IF _email IS NOT NULL AND _email != '' THEN
    RETURN QUERY
      SELECT p.id, p.line_user_id
      FROM public.profiles p
      WHERE p.email = _email
      LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- 2. 電話番号で検索（正規化して比較）
  IF normalized_phone != '' THEN
    RETURN QUERY
      SELECT p.id, p.line_user_id
      FROM public.profiles p
      WHERE regexp_replace(COALESCE(p.phone, ''), '[-\s\u3000]', '', 'g') = normalized_phone
      LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_profile_for_reservation TO authenticated;
