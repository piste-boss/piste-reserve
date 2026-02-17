-- 1. lookup_profile_for_reservation: 電話番号正規化対応
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized: admin only';
  END IF;

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

-- 2. update_profile_line_id: バックフィル条件をemail/phoneにも拡張
CREATE OR REPLACE FUNCTION public.update_profile_line_id(
  _id UUID,
  _line_user_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _email TEXT;
  _phone TEXT;
BEGIN
  IF auth.uid() != _id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.profiles
  SET line_user_id = _line_user_id, updated_at = NOW()
  WHERE id = _id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', _id;
  END IF;

  -- プロファイルからemail/phoneを取得
  SELECT email, phone INTO _email, _phone FROM public.profiles WHERE id = _id;

  -- 既存予約のline_user_idをバックフィル（user_id一致、またはemail/phone一致）
  UPDATE public.reservations
  SET line_user_id = _line_user_id
  WHERE line_user_id IS NULL
    AND (
      user_id = _id
      OR (_email IS NOT NULL AND _email != '' AND email = _email)
      OR (_phone IS NOT NULL AND _phone != '' AND regexp_replace(COALESCE(phone, ''), '[-\s\u3000]', '', 'g') = regexp_replace(_phone, '[-\s\u3000]', '', 'g'))
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_profile_line_id TO authenticated;
