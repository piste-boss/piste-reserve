# customers テーブル追加と予約候補リスト改善

## Context
現在、管理画面の予約候補リストは `profiles` テーブルと `reservations` テーブルの両方からフロントエンドで顧客データを重複排除して構築している。RLSの影響で profiles が取得できない問題や、パフォーマンス・保守性の課題がある。専用の `customers` テーブルを設けることで、シンプルかつ確実に顧客候補を管理する。

## 変更ファイル一覧

1. `supabase/migrations/20260222000000_create_customers_table.sql` - **新規作成**
2. `src/components/admin/ReservationManager.tsx` - **修正**

---

## Step 1: customers テーブル作成 + トリガー + バックフィル（SQL）

ファイル: `supabase/migrations/20260222000000_create_customers_table.sql`

### 1-1. テーブル作成

```sql
CREATE TABLE public.customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  name_kana TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  phone_normalized TEXT GENERATED ALWAYS AS (
    regexp_replace(phone, '[-\s\u3000]', '', 'g')
  ) STORED,
  email TEXT DEFAULT '',
  user_id UUID,
  line_user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 重複判定用ユニーク制約（名前 + 正規化電話番号）
CREATE UNIQUE INDEX idx_customers_name_phone ON public.customers (name, phone_normalized);

-- カタカナ検索用インデックス
CREATE INDEX idx_customers_name_kana ON public.customers (name_kana);

-- 権限設定（reservationsと同様、RLS無効）
GRANT SELECT ON public.customers TO authenticated;
GRANT SELECT ON public.customers TO anon;
```

- `phone_normalized` は GENERATED ALWAYS AS (STORED) で自動正規化
- ON CONFLICT は `(name, phone_normalized)` で正確にマッチ可能

### 1-2. 予約INSERT/UPDATE時の自動顧客同期トリガー

```sql
CREATE OR REPLACE FUNCTION public.sync_customer_from_reservation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.name IS NULL OR NEW.name = '' THEN
    RETURN NEW;
  END IF;

  -- UPDATE時はuser_id/line_user_idの変更のみ対象
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.user_id IS NOT DISTINCT FROM OLD.user_id)
       AND (NEW.line_user_id IS NOT DISTINCT FROM OLD.line_user_id) THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.customers (name, name_kana, phone, email, user_id, line_user_id)
  VALUES (
    NEW.name,
    COALESCE(NEW.name_kana, ''),
    COALESCE(NEW.phone, ''),
    COALESCE(NEW.email, ''),
    NEW.user_id,
    NEW.line_user_id
  )
  ON CONFLICT (name, phone_normalized) DO UPDATE SET
    name_kana = CASE WHEN EXCLUDED.name_kana != '' THEN EXCLUDED.name_kana ELSE customers.name_kana END,
    email = CASE WHEN EXCLUDED.email != '' THEN EXCLUDED.email ELSE customers.email END,
    user_id = COALESCE(EXCLUDED.user_id, customers.user_id),
    line_user_id = COALESCE(EXCLUDED.line_user_id, customers.line_user_id),
    updated_at = now();

  RETURN NEW;
END;
$$;

-- INSERT + UPDATE(user_id/line_user_id変更)の両方で発火
CREATE TRIGGER trg_sync_customer_after_reservation
  AFTER INSERT OR UPDATE OF user_id, line_user_id ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_customer_from_reservation();
```

- Edge Function が予約の user_id/line_user_id を後から更新するケースにも対応

### 1-3. 既存データのバックフィル

```sql
-- profiles から投入（先に実行）
INSERT INTO public.customers (name, name_kana, phone, email, user_id, line_user_id)
SELECT DISTINCT ON (p.name, regexp_replace(COALESCE(p.phone,''), '[-\s\u3000]','','g'))
  COALESCE(p.name,''), COALESCE(p.name_kana,''), COALESCE(p.phone,''),
  COALESCE(p.email,''), p.id, p.line_user_id
FROM public.profiles p
WHERE p.name IS NOT NULL AND p.name != ''
ORDER BY p.name, regexp_replace(COALESCE(p.phone,''), '[-\s\u3000]','','g'), p.updated_at DESC
ON CONFLICT DO NOTHING;

-- reservations から投入（profilesにない顧客を追加）
INSERT INTO public.customers (name, name_kana, phone, email, user_id, line_user_id)
SELECT DISTINCT ON (r.name, regexp_replace(COALESCE(r.phone,''), '[-\s\u3000]','','g'))
  COALESCE(r.name,''), COALESCE(r.name_kana,''), COALESCE(r.phone,''),
  COALESCE(r.email,''), r.user_id, r.line_user_id
FROM public.reservations r
WHERE r.name IS NOT NULL AND r.name != ''
ORDER BY r.name, regexp_replace(COALESCE(r.phone,''), '[-\s\u3000]','','g'), r.created_at DESC
ON CONFLICT DO NOTHING;
```

---

## Step 2: ReservationManager.tsx の変更

ファイル: `src/components/admin/ReservationManager.tsx`

### 2-1. fetchReservations 関数の簡略化

**変更前（L44-112）：** profiles RPC + allResvData + フロント重複排除（約70行）
**変更後：**

```typescript
// customers テーブルから取得（約5行）
const { data: customerData, error: customerError } = await supabase
    .from('customers')
    .select('name, name_kana, phone, email, user_id, line_user_id');
if (customerError) console.error('customers fetch error:', customerError);
setCustomers(customerData || []);
```

- profiles RPC呼び出し、allResvDataクエリ、重複排除ロジックをすべて削除
- admin_fetch_all_profiles RPCは不要になるが、他で使う可能性があるため残す

### 2-2. 候補UI の source バッジ調整

`user_id` の有無で「会員」判定に変更：

```typescript
// 変更前: s.source === 'profile' ? '会員' : '予約履歴'
// 変更後:
{s.user_id ? '会員' : ''}
```

---

## 検証方法

1. Supabase SQLエディタでマイグレーションSQLを実行
2. `SELECT count(*) FROM customers;` でバックフィルデータ確認
3. 管理画面でカタカナ入力 → 候補が全顧客（予約なし含む）表示されることを確認
4. 新規予約登録後 → `SELECT * FROM customers ORDER BY created_at DESC LIMIT 5;` で自動追加確認
5. ↑↓キー + Enterキーで候補選択動作を確認
