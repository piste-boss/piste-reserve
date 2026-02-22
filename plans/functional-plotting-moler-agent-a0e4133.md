# Plan Review Report
# Plan: customers テーブル追加と予約候補リスト改善

## Overview
- Plan: Create a `customers` table, auto-populate it via an AFTER INSERT trigger on
  `reservations`, backfill from existing `profiles` + `reservations` data, and simplify
  `ReservationManager.tsx` to fetch customer candidates from the new table.
- Files affected: 2 (1 new migration SQL, 1 modified TSX)
- Complexity: Medium

---

## Strengths

- The core motivation is sound: eliminating the RLS-bypassing RPC workaround in favor of a
  dedicated, RLS-free table is simpler and more maintainable.
- Using `SECURITY DEFINER` on the trigger function is appropriate because the trigger runs in
  the context of the inserting user (who may be anon/authenticated) but needs to write to
  `customers`.
- The DO UPDATE merge logic (prefer non-empty EXCLUDED values, COALESCE for nullable columns)
  is a good pattern for an upsert that accumulates the best-known data over time.
- Keeping `handleSearch` untouched is correct — the function only consumes the `customers`
  state array, which remains structurally identical.

---

## Issues Found

### Critical Issues (must fix before proceeding)

#### 1. `ON CONFLICT` clause cannot reference an expression index directly

The plan writes:

```sql
ON CONFLICT (name, regexp_replace(COALESCE(phone, ''), '[-\s\u3000]', '', 'g'))
```

PostgreSQL requires that the conflict target in `ON CONFLICT` exactly matches a unique index
definition — including the same expression text. However, the expression in the index uses the
**table column** `phone` (unqualified), while in the INSERT…ON CONFLICT body `phone` is
**ambiguous** between the `customers` table column and the `EXCLUDED` pseudo-table.

More importantly, PostgreSQL resolves expression-index conflict targets by matching the
literal text of the index predicate. If there is any whitespace or character difference
between the index definition and the ON CONFLICT clause, PostgreSQL will raise:

  `ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification`

The safest fix is to add a **generated/stored column** for the normalized phone, and put the
unique index on `(name, phone_normalized)`. Then `ON CONFLICT (name, phone_normalized)` works
without any ambiguity:

```sql
CREATE TABLE public.customers (
  ...
  phone TEXT NOT NULL DEFAULT '',
  phone_normalized TEXT GENERATED ALWAYS AS (
    regexp_replace(phone, '[-\s\u3000]', '', 'g')
  ) STORED,
  ...
);
CREATE UNIQUE INDEX idx_customers_name_phone
  ON public.customers (name, phone_normalized);
```

The trigger INSERT then becomes:

```sql
INSERT INTO public.customers (name, name_kana, phone, email, user_id, line_user_id)
VALUES (...)
ON CONFLICT (name, phone_normalized)
DO UPDATE SET ...;
```

This is unambiguous, index-efficient, and removes the risk of a regex-mismatch runtime error.

Note: the same expression string `'[-\s\u3000]'` is used consistently across all existing
migration files (`20260217050017`, `20260217060358`, `20260217061054`), so adding a stored
column also centralizes the normalization logic instead of duplicating it.

---

#### 2. `DISTINCT ON` in the backfill SELECT requires an `ORDER BY` on the same expressions

The plan writes:

```sql
SELECT DISTINCT ON (p.name, regexp_replace(COALESCE(p.phone,''), '[-\s\u3000]','','g'))
  COALESCE(p.name,''), ...
FROM public.profiles p
WHERE ...
```

In PostgreSQL, `DISTINCT ON (expr_list)` **requires** `ORDER BY expr_list, ...` where the
DISTINCT ON expressions appear first. Without it, PostgreSQL will raise:

  `ERROR: SELECT DISTINCT ON expressions must match initial ORDER BY expressions`

Fix: add `ORDER BY` to both backfill queries:

```sql
SELECT DISTINCT ON (p.name, regexp_replace(COALESCE(p.phone,''), '[-\s\u3000]','','g'))
  COALESCE(p.name,''), COALESCE(p.name_kana,''), COALESCE(p.phone,''),
  COALESCE(p.email,''), p.id, p.line_user_id
FROM public.profiles p
WHERE p.name IS NOT NULL AND p.name != ''
ORDER BY p.name,
         regexp_replace(COALESCE(p.phone,''), '[-\s\u3000]','','g'),
         p.updated_at DESC;   -- pick the most recently updated profile as the canonical one
```

Apply the same fix to the reservations backfill SELECT.

---

#### 3. Edge Function UPDATE on `reservations` will NOT fire the trigger — but this is a data gap

The plan states "trigger fires on INSERT" and correctly notes all three INSERT points:
`ReservationManager.tsx` (single + bulk) and `App.tsx` (web form).

However, the `handle-reservation` Edge Function (lines 187–204 of `index.ts`) performs a
subsequent `UPDATE` on the reservation to write back `user_id` and `line_user_id` that were
looked up from `profiles`. Because the trigger is INSERT-only, any reservation that was
inserted without a `user_id`/`line_user_id` (e.g., admin manual registrations) will have
those fields `NULL` in the `customers` row at insert time. The Edge Function later fills them
in on the reservation row, but the `customers` table never sees that update.

This means:
- The `customers` row may permanently lack `user_id` and `line_user_id` for manually
  registered customers who do have a LINE/account link.
- The `selectSuggestion` handler (`ReservationManager.tsx` line 132–145) copies
  `_user_id` and `_line_user_id` from the selected customer into the new reservation — so
  a stale `customers` row breaks the LINE-user association for future repeat bookings.

**Fix options (choose one):**
- Add a second trigger: `AFTER UPDATE ON public.reservations` that fires only when
  `user_id` or `line_user_id` changes from NULL to a non-NULL value, and merges those
  fields into `customers`.
- Or, extend the existing trigger to also cover UPDATE events by changing `AFTER INSERT`
  to `AFTER INSERT OR UPDATE` and adding a condition:
  ```sql
  IF TG_OP = 'UPDATE' THEN
    -- Only sync if user_id/line_user_id newly populated
    IF (NEW.user_id IS NOT DISTINCT FROM OLD.user_id)
       AND (NEW.line_user_id IS NOT DISTINCT FROM OLD.line_user_id) THEN
      RETURN NEW;
    END IF;
  END IF;
  ```

---

### Recommendations (should consider)

#### 4. RLS is disabled on `customers` — make this explicit and safe

The plan says "RLS は無効のまま（reservations と同様）" but does not include a
`ALTER TABLE public.customers DISABLE ROW LEVEL SECURITY;` statement. In Supabase, new
tables created without `ENABLE ROW LEVEL SECURITY` default to RLS **disabled** for the
`postgres` role but the behavior for the anon/authenticated roles depends on whether a
service-role key or JWT key is used. Since the admin dashboard uses the anon key (see
`src/lib/supabase.ts`), you should verify that the anon role has SELECT permission.

Add explicitly to the migration:

```sql
-- Confirm RLS is off (matches reservations table behaviour)
ALTER TABLE public.customers DISABLE ROW LEVEL SECURITY;

-- Grant read access to authenticated role (admin dashboard uses authenticated anon key)
GRANT SELECT ON public.customers TO authenticated;
GRANT SELECT ON public.customers TO anon;
```

Without the GRANT, the `supabase.from('customers').select('*')` call in the simplified
`fetchReservations` will return an empty result set with no error (PostgREST silently
returns 0 rows when the role lacks permission and RLS is off).

---

#### 5. The `source` field used in suggestion UI is dropped without a replacement

The current UI in `ReservationManager.tsx` (lines 604–610) renders:

```tsx
<span style={{ color: s.source === 'profile' ? '#3182ce' : '#999' }}>
  {s.source === 'profile' ? '会員' : '予約履歴'}
</span>
```

The plan acknowledges this under "selectSuggestion / 候補UI：source フィールドがなくなるため
調整" but provides no concrete replacement. Options:
- Use `user_id IS NOT NULL` as a proxy for "registered member".
- Add a `source` TEXT column to `customers` ('profile' | 'resv') populated by the trigger.
- Simply collapse to a single label (e.g., "顧客") since the distinction between profile-sourced
  and reservation-sourced is less meaningful once the data is merged.

This must be decided and coded before the PR — otherwise the TypeScript will still reference
`s.source` which may be `undefined`, causing a visual regression (always shows '予約履歴').

---

#### 6. `fetchReservations` realtime subscription will re-fetch `customers` on every reservation change

The existing Realtime subscription (lines 169–178) calls `fetchReservations()` on any
`reservations` table event. After the change, `fetchReservations` will also re-query
`customers`. Because the trigger writes to `customers` on each INSERT, the subscription
will immediately re-fetch `customers` anyway — which is fine. But consider whether you also
want a Realtime subscription on the `customers` table itself for cases where `customers` is
updated via the UPDATE trigger path (Issue 3 above).

---

### Minor Notes (nice to have)

#### 7. Migration filename date format inconsistency

Existing migration files use the `YYYYMMDDHHMMSS` Supabase convention
(e.g., `20260217050017_...`). The new file is named `20260222_create_customers_table.sql`
(no time component). While Supabase CLI runs migrations in lexicographic order and this will
still sort correctly, using the full timestamp is consistent with the project's convention.
Suggested: `20260222000000_create_customers_table.sql`.

#### 8. `updated_at` trigger not included

The `customers` table has an `updated_at` column but no `BEFORE UPDATE` trigger to maintain
it automatically. The DO UPDATE clause in the trigger manually sets `updated_at = now()`,
which is sufficient for trigger-driven updates, but if the table is ever updated directly
(e.g., from the admin UI in the future), `updated_at` will not be maintained. Consider
adding a standard `moddatetime` trigger for consistency:

```sql
CREATE TRIGGER set_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
```

(The `moddatetime` extension is available in Supabase by default.)

#### 9. The `select('*')` in the simplified frontend fetch

```typescript
const { data: customerData } = await supabase
  .from('customers')
  .select('*');
```

This fetches all columns including `id`, `created_at`, `updated_at`, and the generated
`phone_normalized` column (if Issue 1's fix is adopted). Consider selecting only the fields
the UI needs:

```typescript
.select('name, name_kana, phone, email, user_id, line_user_id')
```

This avoids sending unnecessary bytes over the wire.

---

## Missing Considerations

1. **What happens to `admin_fetch_all_profiles` RPC?** After the change, it will no longer
   be called from `fetchReservations`. The plan should note whether this RPC (and the
   `lookup_profile_for_reservation` RPC, which is still called via `handleRegister` and
   `handleBulkRegister`) should be retained or cleaned up. Do not delete them yet — they are
   still used for the profile lookup path in `lookupProfile()`.

2. **Backfill transaction safety.** The backfill INSERT statements should be wrapped in a
   transaction, or at minimum the profiles backfill should commit before the reservations
   backfill runs, so the `ON CONFLICT DO NOTHING` correctly deduplicates across both sources.
   If run ad-hoc in the SQL editor they are already independent statements, but as part of a
   migration file they may share a transaction — confirm the intended behaviour.

3. **Empty-name guard in trigger.** The trigger checks `NEW.name IS NULL OR NEW.name = ''`
   and returns early. This is correct. However, it also means reservations inserted with no
   name (which are possible from the Edge Function's UPDATE path) will never create a
   `customers` row. This is acceptable behaviour, but should be documented in the trigger
   comment.

4. **No error handling in simplified `fetchReservations`.** The current code checks `!resvError`
   before using `resvData`. The plan's simplified version drops the error variable:
   ```typescript
   const { data: customerData } = await supabase.from('customers').select('*');
   ```
   Add `error` destructuring and log or handle it for debugging purposes.

---

## Alternative Approaches

The plan is the right architectural direction. One alternative worth considering: instead of a
separate `customers` table, a Postgres **materialized view** over `reservations` + `profiles`
would self-maintain (on manual REFRESH) without triggers. However, materialized views cannot
be kept live in real-time, so the trigger-backed table approach in the plan is better for
this use case.

---

## Verdict

**REVISE PLAN**

The plan's overall direction is correct and will solve the RLS problem cleanly. However, two
critical SQL correctness issues (Issues 1 and 2) mean the migration as written will fail at
runtime with PostgreSQL errors. Issue 1 (ON CONFLICT on expression index) is the most
dangerous — it will silently break every INSERT into `customers` if the conflict target does
not exactly match the index. Issue 3 (UPDATE trigger gap for Edge Function backfill) is a
functional data-quality problem that will cause LINE-linked customers to show as unlinked in
the candidate list.

The plan should be revised to:
1. Use a generated stored column `phone_normalized` and reference it in `ON CONFLICT`.
2. Add `ORDER BY` to both `DISTINCT ON` backfill selects.
3. Extend the trigger to also cover UPDATE events for `user_id`/`line_user_id`.
4. Specify concrete `source`-field replacement logic for the suggestion UI.
5. Add explicit GRANT statements for the anon/authenticated roles.

Once these five points are addressed, the plan is ready to proceed.
