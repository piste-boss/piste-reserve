# 予約データ消失バグ修正指示

## バグ概要
コミット `c26bec0`（キャンセルバグ更新）以降、フロントエンドから予約データが表示されなくなった。

## 根本原因
`reservations` テーブルに `status` カラムを追加し、全クエリに `.neq('status', 'cancelled')` フィルターを追加したが、既存レコードの `status` が `NULL` のままになっている。

SQLでは `NULL != 'cancelled'` は `NULL`（falsy）と評価されるため、`status` が `NULL` のレコードは全てクエリ結果から除外される。

## 修正内容（2段階）

### 修正1: データベース修正（Supabase SQL Editor で実行）

以下のSQLを **Supabase ダッシュボード > SQL Editor** で実行する：

```sql
-- 1. 既存の NULL レコードを 'active' に更新（これが最重要）
UPDATE public.reservations SET status = 'active' WHERE status IS NULL;

-- 2. 今後 NULL が入らないよう NOT NULL 制約を追加
ALTER TABLE public.reservations ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.reservations ALTER COLUMN status SET DEFAULT 'active';
```

### 修正2: フロントエンドのクエリを防御的に修正

`NULL` の `status` が万が一残っていても表示されるよう、`.neq('status', 'cancelled')` を `.or('status.is.null,status.neq.cancelled')` に置き換える。

#### 対象ファイルと修正箇所

**ファイル1: `src/components/MyPage.tsx` (34行目付近)**

変更前:
```typescript
.neq('status', 'cancelled')
```

変更後:
```typescript
.or('status.is.null,status.neq.cancelled')
```

**ファイル2: `src/components/ReservationTime.tsx` (42行目付近 と 51行目付近)**

2箇所とも同じ変更:

変更前:
```typescript
.neq('status', 'cancelled')
```

変更後:
```typescript
.or('status.is.null,status.neq.cancelled')
```

**ファイル3: `src/components/admin/ReservationManager.tsx` (41行目付近)**

変更前:
```typescript
.neq('status', 'cancelled')
```

変更後:
```typescript
.or('status.is.null,status.neq.cancelled')
```

### 修正箇所一覧

| ファイル | 行 | 変更内容 |
|---|---|---|
| `src/components/MyPage.tsx` | 34 | `.neq('status', 'cancelled')` → `.or('status.is.null,status.neq.cancelled')` |
| `src/components/ReservationTime.tsx` | 42 | 同上 |
| `src/components/ReservationTime.tsx` | 51 | 同上 |
| `src/components/admin/ReservationManager.tsx` | 41 | 同上 |

## 修正の優先順位

1. **最優先**: データベースのSQL実行（修正1）- これだけで即座に予約が表示されるようになる
2. **次に**: フロントエンドの防御的修正（修正2）- 今後同様の問題を防ぐ

## 検証方法

1. SQL実行後、フロントエンドで予約一覧を確認し、データベースの予約が全て表示されることを確認
2. 管理画面（ReservationManager）のカレンダーに予約が反映されていることを確認
3. 新規予約を作成し、`status = 'active'` で保存されることを確認
4. キャンセル操作を行い、`status = 'cancelled'` に更新されて一覧から消えることを確認
5. 予約時間選択画面（ReservationTime）でキャンセル済みの枠が予約可能として表示されることを確認

## 不要ファイルの削除

修正完了後、以下のファイルは不要なため削除してよい：
- `COMPLETE_FIX.sql`
- `FIX_RESERVATIONS_STATUS.sql`
- `MIGRATION_20260217.sql`
