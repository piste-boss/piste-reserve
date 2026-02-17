-- 旧シグネチャ(2引数)を削除してから新シグネチャ(3引数)で再作成
DROP FUNCTION IF EXISTS public.lookup_profile_for_reservation(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.lookup_profile_for_reservation(
  _user_id UUID DEFAULT NULL,
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized: admin only';
  END IF;

  -- 1. user_id で直接検索（最も確実）
  IF _user_id IS NOT NULL THEN
    RETURN QUERY
      SELECT p.id, p.line_user_id
      FROM public.profiles p
      WHERE p.id = _user_id
      LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- 2. メールアドレスで検索
  IF _email IS NOT NULL AND _email != '' THEN
    RETURN QUERY
      SELECT p.id, p.line_user_id
      FROM public.profiles p
      WHERE p.email = _email
      LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- 3. 電話番号で検索（正規化して比較）
  normalized_phone := regexp_replace(COALESCE(_phone, ''), '[-\s\u3000]', '', 'g');
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
