-- Profiles テーブルのスキーマ定義
-- auth.users と1対1で紐づくユーザープロファイル情報

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name TEXT,
  name_kana TEXT,
  phone TEXT,
  email TEXT,
  line_user_id TEXT,
  role TEXT DEFAULT 'user', -- 'user' | 'admin'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS (Row Level Security) の有効化
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ポリシー: ユーザーは自分のプロファイルのみ閲覧可能
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- ポリシー: ユーザーは自分のプロファイルのみ更新可能
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- ポリシー: 管理者は全てのプロファイルを閲覧可能
CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ポリシー: 管理者は全てのプロファイルを更新可能
CREATE POLICY "Admins can update all profiles"
  ON public.profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_profiles_line_user_id ON public.profiles(line_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
