# LINE連携バグ修正プラン

## Context

LINE連携がうまくいかないケースがある。調査の結果、以下の問題が特定された：

1. **RPC関数 `update_profile_line_id` と `create_profile_securely` がDBに未定義** — コードから呼び出しているが関数が存在せず、常に失敗してフォールバックに頼っている
2. **LP.tsx で `liff.getContext()?.userId` を使用** — 外部ブラウザでは `userId` が取得できず、予約に LINE ID がセットされない
3. **profiles テーブルに INSERT ポリシーがない** — RPC失敗時にクライアントから直接プロフィール作成ができない
4. **エラーハンドリングが不十分** — ユーザーに具体的なエラー原因が伝わらない

## 修正内容

### 1. RPC関数の定義 + INSERT ポリシー + UNIQUE制約（SQLファイル作成）

**ファイル**: `SUPABASE_PROFILES_RPC.sql` (新規作成)

```sql
-- update_profile_line_id: プロフィールの line_user_id を更新
-- LINE連携時に既存の予約も同時にバックフィルする
CREATE OR REPLACE FUNCTION public.update_profile_line_id(_id UUID, _line_user_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE public.profiles SET line_user_id = _line_user_id, updated_at = NOW()
  WHERE id = _id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', _id;
  END IF;
  -- 既存予約のline_user_idもバックフィル
  UPDATE public.reservations SET line_user_id = _line_user_id
  WHERE user_id = _id AND line_user_id IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- create_profile_securely: プロフィールを安全に作成（単一行を返す）
CREATE OR REPLACE FUNCTION public.create_profile_securely(
  _id UUID, _name TEXT, _phone TEXT, _email TEXT
)
RETURNS public.profiles AS $$
DECLARE
  result public.profiles;
BEGIN
  INSERT INTO public.profiles (id, name, phone, email)
  VALUES (_id, _name, _phone, _email)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, phone = EXCLUDED.phone, email = EXCLUDED.email, updated_at = NOW();
  SELECT * INTO result FROM public.profiles WHERE id = _id;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- INSERT ポリシーの追加（RPC失敗時のフォールバック用）
CREATE POLICY "Users can insert own profile" ON public.profiles
FOR INSERT WITH CHECK (auth.uid() = id);

-- line_user_id のユニーク制約（同一LINE IDの重複防止）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_line_user_id'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT unique_line_user_id UNIQUE (line_user_id);
  END IF;
END $$;

-- 実行権限の付与
GRANT EXECUTE ON FUNCTION public.update_profile_line_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_profile_securely TO authenticated;
```

### 2. LP.tsx のバグ修正

**ファイル**: `src/LP.tsx`

**問題**: 155行目で `liff.getContext()?.userId` を使用 — 外部ブラウザでは動作しない

**修正**: `liff.getProfile()` を使って非同期でLINE IDを取得する

```typescript
// handleFormSubmit 内で、予約オブジェクト作成前にLINE IDを取得
let lineUserId: string | null = null;
if (liff.isLoggedIn()) {
  try {
    const liffProfile = await liff.getProfile();
    lineUserId = liffProfile.userId;
  } catch {
    lineUserId = null;
  }
}

const reservation = {
  ...
  line_user_id: lineUserId,
};
```

### 3. App.tsx useEffect B のエラーハンドリング改善

**ファイル**: `src/App.tsx` (216-221行目)

フォールバック直接updateの結果チェックを追加し、失敗時はローカルstateを更新しない：

```typescript
const { error: directError } = await supabase
  .from('profiles')
  .update({ line_user_id: liffLineUserId })
  .eq('id', session.user.id);
if (directError) {
  console.error("Direct profile update also failed:", directError);
  return; // ローカルstate更新せず
}
```

### 4. MyPage.tsx のエラーメッセージ改善

**ファイル**: `src/components/MyPage.tsx` (92-94行目)

```typescript
catch (err: any) {
  console.error('LINE link error:', err);
  alert(`連携に失敗しました。\n${err?.message || 'しばらくしてから再度お試しください。'}`);
}
```

### 5. LP.tsx のエラーメッセージ改善

**ファイル**: `src/LP.tsx` (99-101行目)

```typescript
catch (err: any) {
  console.error('LINE link error:', err);
  alert(`連携に失敗しました。\n${err?.message || 'しばらくしてから再度お試しください。'}`);
}
```

## 修正対象ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `SUPABASE_PROFILES_RPC.sql` | 新規作成 — RPC関数2つ + INSERTポリシー + UNIQUE制約 |
| `src/LP.tsx:145-156` | `getContext()?.userId` → `getProfile()` に修正 |
| `src/LP.tsx:99-101` | エラーメッセージ改善 |
| `src/App.tsx:216-221` | フォールバックupdateのエラーチェック追加 |
| `src/components/MyPage.tsx:92-94` | エラーメッセージ改善 |

## 検証方法

1. Supabase SQL エディタで `SUPABASE_PROFILES_RPC.sql` を実行
2. 以下のシナリオをテスト:
   - **App.tsx からの LINE 連携**: 予約完了 → LINE連携ボタン → 連携成功確認 + 既存予約のline_user_idもバックフィルされること
   - **MyPage からの LINE 連携**: マイページ → 連携ボタン → 連携成功確認
   - **LP からの予約**: 無料体験予約（外部ブラウザ）→ LINE連携ボタン → 連携成功確認
   - **エラーケース**: エラー時にユーザーにわかりやすいメッセージが表示されること
   - **重複チェック**: 同一LINE IDで複数ユーザーが連携しようとした場合のエラーハンドリング
