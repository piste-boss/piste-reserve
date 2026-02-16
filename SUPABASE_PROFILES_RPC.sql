-- ============================================================
-- Profiles テーブル完全セットアップ
-- RLS / トリガー / RPC関数 / UNIQUE制約 すべて含む
-- Supabase SQL エディタで実行すること
-- ============================================================

-- ============================================================
-- 1. テーブル作成
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name TEXT,
  phone TEXT,
  email TEXT,
  line_user_id TEXT,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_profiles_line_user_id ON public.profiles(line_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- line_user_id のユニーク制約（同一LINE IDの重複防止、NULLは重複許可）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_line_user_id'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT unique_line_user_id UNIQUE (line_user_id);
  END IF;
END $$;

-- ============================================================
-- 2. RLS 有効化 + ポリシー
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 既存ポリシーを全削除（エラー回避）
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- ユーザー用ポリシー
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 管理者チェック関数（無限ループ回避のため SECURITY DEFINER で分離）
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- 管理者用ポリシー
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (public.is_admin());

-- ============================================================
-- 3. 新規ユーザー作成トリガー
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, phone, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 4. ユーザー更新トリガー
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.email IS DISTINCT FROM OLD.email) OR
     (NEW.raw_user_meta_data IS DISTINCT FROM OLD.raw_user_meta_data) THEN
    UPDATE public.profiles
    SET
      name = COALESCE(NEW.raw_user_meta_data->>'name', name),
      phone = COALESCE(NEW.raw_user_meta_data->>'phone', phone),
      email = NEW.email,
      updated_at = NOW()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_update();

-- ============================================================
-- 5. RPC関数
-- ============================================================

-- プロフィールを安全に作成・更新する関数
CREATE OR REPLACE FUNCTION public.create_profile_securely(
  _id UUID,
  _name TEXT,
  _phone TEXT,
  _email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  IF auth.uid() != _id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.profiles (id, name, phone, email)
  VALUES (_id, _name, _phone, _email)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    updated_at = NOW()
  RETURNING to_jsonb(profiles.*) INTO result;

  RETURN result;
END;
$$;

-- LINE連携IDを安全に更新する関数
-- 既存予約の line_user_id も同時にバックフィルする
CREATE OR REPLACE FUNCTION public.update_profile_line_id(
  _id UUID,
  _line_user_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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

  -- 既存予約のline_user_idもバックフィル（リマインド通知が届くようにする）
  UPDATE public.reservations
  SET line_user_id = _line_user_id
  WHERE user_id = _id AND line_user_id IS NULL;
END;
$$;

-- 実行権限の付与
GRANT EXECUTE ON FUNCTION public.create_profile_securely TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_profile_line_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin TO authenticated;
