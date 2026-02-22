-- 管理者用：全プロファイル取得RPC（RLSバイパス）
-- 管理画面の予約候補リストでprofilesテーブルからの顧客データ取得に使用

CREATE OR REPLACE FUNCTION public.admin_fetch_all_profiles()
RETURNS SETOF public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized: admin only';
  END IF;

  RETURN QUERY SELECT * FROM public.profiles;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_fetch_all_profiles TO authenticated;
