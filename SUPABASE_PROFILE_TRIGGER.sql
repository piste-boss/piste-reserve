-- プロファイル自動作成トリガー関数
-- 新規ユーザー作成時に、auth.usersのuser_metadataからprofilesテーブルに情報を自動コピー

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

-- トリガーの作成（既存の場合は削除して再作成）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 既存ユーザーのプロファイル更新トリガー関数（オプション）
-- ユーザー情報が更新された際にprofilesテーブルも同期
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS TRIGGER AS $$
BEGIN
  -- emailまたはuser_metadataが変更された場合のみ更新
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

-- 更新トリガーの作成
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;

CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_update();
