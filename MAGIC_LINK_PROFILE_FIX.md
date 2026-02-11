# マジックリンク認証時のプロファイル情報自動登録

## 問題点
マジックリンクでログインした際、メールアドレスは`auth.users`に登録されるものの、氏名と電話番号が`profiles`テーブルに登録されていなかった。

## 解決方法

### 1. フロントエンド修正（App.tsx）
マジックリンク送信**前**に、氏名・電話番号・メールアドレスを入力してもらい、`signInWithOtp`の`options.data`として送信するように変更。

**変更箇所：**
- ログインフォームに氏名と電話番号の入力欄を追加
- `signInWithOtp`の`options.data`に`name`と`phone`を含める

```typescript
const { error } = await supabase.auth.signInWithOtp({
  email: authEmail,
  options: { 
    emailRedirectTo: window.location.origin,
    data: {
      name: authName,
      phone: authPhone
    }
  }
});
```

### 2. データベーストリガー設定（SUPABASE_PROFILE_TRIGGER.sql）

`auth.users`テーブルに新規ユーザーが作成された際、自動的に`profiles`テーブルにレコードを作成し、`user_metadata`から氏名・電話番号を取り出して保存するトリガーを設定。

**実行するSQL：**
1. `SUPABASE_PROFILES_SCHEMA.sql` - profilesテーブルのスキーマ作成（すでに存在する場合はスキップされる）
2. `SUPABASE_PROFILE_TRIGGER.sql` - トリガー関数とトリガーの作成

### 3. Supabaseでの設定手順

1. Supabaseダッシュボードにログイン
2. プロジェクトを選択
3. 左メニューから「SQL Editor」を選択
4. 新しいクエリを作成
5. `SUPABASE_PROFILES_SCHEMA.sql`の内容を貼り付けて実行
6. もう一つ新しいクエリを作成
7. `SUPABASE_PROFILE_TRIGGER.sql`の内容を貼り付けて実行

## データフロー

```
1. ユーザーがログインフォームで氏名・電話番号・メールアドレスを入力
   ↓
2. signInWithOtp実行（user_metadataに氏名・電話番号を含める）
   ↓
3. Supabaseが新規ユーザーをauth.usersテーブルに作成
   ↓
4. トリガー発火: handle_new_user()関数が実行
   ↓
5. auth.users.raw_user_meta_dataから氏名・電話番号を取得
   ↓
6. profilesテーブルに自動的にレコード作成
   (id, name, phone, email)
   ↓
7. ユーザーがマジックリンクをクリックしてログイン完了
   ↓
8. fetchProfile関数でprofilesテーブルからデータ取得
   → 氏名・電話番号がすでに登録されている✅
```

## 注意点

- **既存ユーザー**: 既にログインしたことがあるユーザーは、user_metadataが空の可能性があります。その場合は、マイページから情報を更新してもらう必要があります。
- **更新トリガー**: `handle_user_update()`関数も実装しているため、ユーザー情報が更新された際にprofilesテーブルも自動的に同期されます。

## テスト方法

1. 新規ユーザーでログインフォームにアクセス
2. 氏名・電話番号・メールアドレスを入力
3. マジックリンクを受信してログイン
4. マイページで氏名・電話番号が正しく表示されることを確認
5. 予約時にフォームに氏名・電話番号が自動入力されることを確認
