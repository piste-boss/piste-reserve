# キャンセル後のかな検索が機能しなくなるバグの修正

## Context

管理画面で新規予約を登録する際、ヨミガナ（例："イシカワスグル"）を入力すると候補が表示される機能がある。しかし、顧客の予約がキャンセルされると、その顧客がかな検索で見つからなくなる。

**根本原因：**
1. キャンセル処理が物理削除（`.delete()`）→ `reservations` テーブルから `name_kana` 付きレコードが消失
2. `profiles` テーブルに `name_kana` カラムがない → プロファイル由来の顧客はかな検索不可

## 方針

**論理削除への変更** + **profiles に name_kana 追加**

- `reservations` テーブルに `status` カラムを追加（`'active'` / `'cancelled'`）
- キャンセル時は DELETE ではなく `status = 'cancelled'` に UPDATE
- カレンダー表示・マイページ・リマインダー・時間枠表示では `cancelled` を除外
- 顧客候補の構築時はキャンセル済みも含めて全予約から取得（かな検索を維持）
- `profiles` テーブルに `name_kana` カラムを追加

## 変更ファイル一覧

### 1. SQL マイグレーション（Supabase SQL エディタで実行）

```sql
-- reservations に status カラム追加（既存レコードは DEFAULT 'active' が適用される）
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- profiles に name_kana カラム追加
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name_kana TEXT;
```

### 2. `src/components/MyPage.tsx`（ユーザー側キャンセル）

**行121-148:** `.delete()` を `.update({ status: 'cancelled' })` に変更。cancel_reason の別途 UPDATE も不要になり1回のUPDATEに統合。

**行30-34:** マイページの予約一覧に `.neq('status', 'cancelled')` を追加

### 3. `src/components/admin/ReservationManager.tsx`

**行134-142（executeDelete）:** `.delete()` を `.update({ status: 'cancelled' })` に変更

**行35-88（fetchReservations）:** クエリを2つに分離
- カレンダー表示用: `.neq('status', 'cancelled')` でアクティブのみ取得 → `setReservations()`
- 顧客候補構築用: フィルタなしで全予約（キャンセル済み含む）から `name, name_kana, phone, email, menu_id` を取得 → 顧客マージロジックに使用

### 4. `supabase/functions/ai-chat/index.ts`（AI チャット）

**行222:** `cancel_reservation` の `.delete()` を `.update({ status: 'cancelled', cancel_reason })` に変更

**行145:** `get_booked_times` に `.neq('status', 'cancelled')` を追加

**行150:** `find_user_reservations` に `.neq('status', 'cancelled')` を追加

**行172-174:** `add_reservation` の重複チェックに `.neq('status', 'cancelled')` を追加

### 5. `src/components/ReservationTime.tsx`

**行38-41:** 予約枠取得クエリに `.neq('status', 'cancelled')` を追加
**行47:** フォールバッククエリにも同様のフィルタを追加

### 6. `src/App.tsx`

**行280:** 重複チェッククエリに `.neq('status', 'cancelled')` を追加

### 7. `src/LP.tsx`

**行124-130:** 重複チェッククエリに `.neq('status', 'cancelled')` を追加

### 8. `supabase/functions/handle-reservation/index.ts`（Edge Function）

**行22-31:** UPDATE 時のスキップ判定にキャンセル検出を追加

```typescript
if (type === 'UPDATE') {
    const isCancellation = record.status === 'cancelled' && old_record.status !== 'cancelled';
    if (!isCancellation) {
        // 既存ロジック：日時・メニュー変更がなければスキップ
    }
}
```

**行33以降:** `effectiveType` 変数を導入し、キャンセル検出時は `'DELETE'` として扱う

```typescript
const effectiveType = (type === 'UPDATE' && record.status === 'cancelled' && old_record.status !== 'cancelled')
    ? 'DELETE' : type;
```

以降、`type` の代わりに `effectiveType` を使用（GAS同期、LINE通知、メール通知すべて）。

### 9. `supabase/functions/send-reminders/index.ts`

**行25-32:** リマインダークエリに `.neq('status', 'cancelled')` を追加

### 10. SQL ドキュメントファイルの更新

以下のファイルの profiles テーブル定義に `name_kana TEXT` を追加：
- `SUPABASE_SCHEMA.sql`
- `SUPABASE_PROFILES_SCHEMA.sql`
- `SUPABASE_FULL_SETUP.sql`
- `SUPABASE_PROFILES_RPC.sql`

`SUPABASE_SCHEMA.sql` に reservations の `status` カラム追加も記載。

## 実装順序

1. SQL ドキュメントファイルの更新（`SUPABASE_SCHEMA.sql` 等）
2. `MyPage.tsx` のキャンセル処理変更 + 表示フィルタ追加
3. `ReservationManager.tsx` の削除処理変更 + クエリ分離
4. `ai-chat/index.ts` のキャンセル処理変更 + クエリフィルタ追加
5. `ReservationTime.tsx` のフィルタ追加
6. `App.tsx` / `LP.tsx` の重複チェックフィルタ追加
7. `handle-reservation/index.ts` の論理削除対応
8. `send-reminders/index.ts` のフィルタ追加

## 検証方法

1. **管理画面で予約を作成** → ヨミガナ付きで登録
2. **その予約をキャンセル** → status が 'cancelled' に変わることを確認
3. **新規予約フォームでヨミガナ検索** → キャンセル済み顧客がかな候補に表示されることを確認
4. **カレンダー表示** → キャンセル済み予約が表示されないことを確認
5. **マイページ** → キャンセル済み予約が表示されないことを確認
6. **時間選択画面** → キャンセル済みの時間枠が「予約可能」として表示されることを確認
7. **AI チャット** → キャンセル機能が正しく動作し、空き時間が正しいことを確認
8. **Edge Function** → キャンセル時にLINE/メール通知が送信されることを確認
