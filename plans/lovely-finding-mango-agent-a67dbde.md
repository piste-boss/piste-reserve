# Plan Review Report

## Overview
- Plan: Fix LINE integration bugs (missing RPC functions, incorrect LIFF API usage, error handling)
- Files affected: 5 files (1 new SQL file + 4 TypeScript files)
- Complexity: Medium

## Strengths

1. **Root cause analysis is thorough**: The plan correctly identifies that RPC functions are being called but don't exist in the database
2. **SECURITY DEFINER approach is appropriate**: Using RPC functions with SECURITY DEFINER to bypass RLS is the correct pattern for system-level operations
3. **Multiple LINE linking flows are addressed**: The plan covers App.tsx, LP.tsx, and MyPage.tsx comprehensively
4. **Error handling improvements**: Adding detailed error messages will help with debugging
5. **Test scenarios are well-defined**: The verification section covers key flows

## Issues Found

### Critical Issues (must fix before proceeding)

#### 1. RPC Function Signature Mismatch in `create_profile_securely`

**Problem**: The plan's RPC function returns `SETOF public.profiles` but the calling code expects a single row:

**Plan (lines 31-42)**:
```sql
CREATE OR REPLACE FUNCTION public.create_profile_securely(
  _id UUID, _name TEXT, _phone TEXT, _email TEXT
)
RETURNS SETOF public.profiles AS $$
```

**App.tsx (line 103)**:
```typescript
const { data: newProfile, error } = await supabase.rpc('create_profile_securely', {
  _id: userId, _name: name, _phone: phone, _email: email
});
if (!error && newProfile) {
  data = newProfile;  // Expects single object, not array
```

**Fix**: Change return type to `TABLE` with single-row semantics, or update calling code to handle array. Recommend changing SQL to:
```sql
RETURNS public.profiles AS $$
DECLARE
  result public.profiles;
BEGIN
  -- existing logic
  SELECT * INTO result FROM public.profiles WHERE id = _id;
  RETURN result;
END;
```

#### 2. Missing INSERT Policy Still Blocks Direct Fallback

**Problem**: The plan mentions "profiles テーブルに INSERT ポリシーがない" as a problem (line 9), but **doesn't actually add an INSERT policy**. The RPC functions use SECURITY DEFINER to bypass RLS, which is good, but the fallback code in App.tsx (lines 114-116) and the direct update approach won't work if the profile doesn't exist.

**Context**: Looking at SUPABASE_FULL_SETUP.sql, there are only SELECT and UPDATE policies for users, no INSERT policy.

**Fix**: Either:
- Add INSERT policy: `CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);`
- OR remove fallback code that attempts direct INSERT (not just UPDATE)
- OR document that the trigger `handle_new_user` creates the row, so INSERT should never be needed from client

**Recommendation**: Add the INSERT policy for safety, as the trigger might not always fire in edge cases.

#### 3. LP.tsx LINE ID Logic Contradicts Plan's Stated Goal

**Problem**: The plan says to set `line_user_id: null` in LP.tsx (line 56) with the reasoning "予約作成時に無理にセットするのではなく、明示的な LINE 連携フローに任せる" (don't force-set during reservation, leave it to explicit LINE linking flow).

**However**: This misses a valid use case. If a user:
1. Opens LP.tsx in LINE browser (LIFF context active)
2. Is already logged into LIFF
3. Makes a reservation

In this scenario, `liff.getProfile().userId` IS available and valid, but the plan throws it away. The user then has to click "LINE連携する" button unnecessarily.

**Better approach**:
```typescript
// Try to get LINE ID if in LIFF context, but don't use getContext()
const getLiffLineId = async (): Promise<string | null> => {
  if (!liff.isLoggedIn()) return null;
  try {
    const profile = await liff.getProfile();
    return profile.userId;
  } catch {
    return null;
  }
};

// In reservation object:
line_user_id: await getLiffLineId()
```

The issue isn't with getting the LINE ID during reservation - it's with using `getContext()?.userId` which only works in LINE app. Using `getProfile()` works in both LINE app and external browser with LIFF login.

### Recommendations (should consider)

#### 4. Error Handling Could Be More Specific

**Lines 62-79 (App.tsx, MyPage.tsx, LP.tsx error messages)**: The plan suggests showing error details, which is good, but consider:

- Supabase errors might contain sensitive information (e.g., SQL details)
- User-facing errors should be friendly, technical details should go to console only

**Suggested pattern**:
```typescript
catch (err: any) {
  console.error("LINE Linking Error:", err);
  const userMessage = err.message?.includes('RPC')
    ? '連携に失敗しました。しばらくしてから再度お試しください。'
    : '連携に失敗しました。';
  alert(userMessage);
}
```

#### 5. Missing Consideration: What if LINE ID Already Exists on Different User?

**Security concern**: The RPC functions don't check for conflicts. What if:
1. User A links LINE ID "U123456"
2. User A deletes account (or unlinks)
3. User B tries to link the same LINE ID "U123456"

The `UPDATE profiles SET line_user_id = ...` will succeed, but now you might have duplicate LINE IDs in your database (depending on constraints).

**Fix**: Add UNIQUE constraint on `line_user_id` column:
```sql
ALTER TABLE public.profiles ADD CONSTRAINT unique_line_user_id UNIQUE (line_user_id);
```

Then handle the conflict in RPC functions or client code.

#### 6. Race Condition in App.tsx useEffect B (syncLineId)

**Lines 206-229**: The useEffect runs when `session`, `profile`, or `liffLineUserId` change. But it doesn't prevent duplicate execution if rapid re-renders occur.

**Problem scenario**:
1. Session loads → trigger
2. Profile loads 100ms later → trigger again
3. liffLineUserId loads 50ms later → trigger again

Result: Multiple simultaneous RPC calls updating the same profile.

**Fix**: Add a ref to track execution:
```typescript
const syncingRef = useRef(false);
useEffect(() => {
  if (!session || !profile || !liffLineUserId || profile.line_user_id || syncingRef.current) return;
  syncingRef.current = true;
  // ... rest of logic
  // In finally block: syncingRef.current = false;
}, [session, profile, liffLineUserId]);
```

#### 7. Fallback Code Swallows Errors

**App.tsx lines 216-221** (in plan):
```typescript
if (error) {
  console.warn("RPC failed, trying direct update:", error);
  await supabase.from('profiles')
    .update({ line_user_id: liffLineUserId })
    .eq('id', session.user.id);
}
```

The direct update error is not checked. Plan mentions "フォールバックの直接updateの結果もチェックする" but doesn't show the actual code change.

**Fix**: Plan should include explicit code:
```typescript
if (error) {
  console.warn("RPC failed, trying direct update:", error);
  const { error: directError } = await supabase
    .from('profiles')
    .update({ line_user_id: liffLineUserId })
    .eq('id', session.user.id);
  if (directError) {
    console.error("Profile update failed:", directError);
    alert(`LINE連携に失敗しました。\nエラー: ${directError.message}`);
    return; // Don't update local state if both failed
  }
}
```

### Minor Notes (nice to have)

#### 8. SQL File Naming Convention

New file is `SUPABASE_RPC_FUNCTIONS.sql` but existing files use `SUPABASE_PROFILES_SCHEMA.sql`, `SUPABASE_PROFILE_TRIGGER.sql`, etc.

Consider naming it `SUPABASE_PROFILES_RPC.sql` to clarify it's for profile-related RPC functions.

#### 9. Missing GRANT Statements

The RPC functions are created but no explicit GRANT statement for authenticated users. Supabase usually auto-grants to authenticated role, but for explicitness:

```sql
GRANT EXECUTE ON FUNCTION public.update_profile_line_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_profile_securely TO authenticated;
```

#### 10. ON CONFLICT in create_profile_securely Might Be Unnecessary

**Line 38-40**:
```sql
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, phone = EXCLUDED.phone, email = EXCLUDED.email, updated_at = NOW();
```

If the function is only called when profile doesn't exist (line 101-106 in App.tsx checks `!data`), the ON CONFLICT is dead code. Either:
- Remove it for simplicity
- OR make the function truly upsert and simplify calling code

## Missing Considerations

### 1. Transaction Safety

The RPC functions perform updates but don't use transactions. If an error occurs midway, partial state could persist. Consider:

```sql
BEGIN
  UPDATE public.profiles SET line_user_id = _line_user_id, updated_at = NOW()
  WHERE id = _id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', _id;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
```

### 2. Logging/Audit Trail

LINE linking is a critical operation. Consider adding audit logging:
- When was LINE ID linked?
- What was the previous value?
- From which flow (App, MyPage, LP)?

Could add columns: `line_linked_at TIMESTAMP`, `line_link_source TEXT`.

### 3. What Happens to Existing Reservations When User Links LINE?

Currently, the plan updates the profile's `line_user_id`, but **existing reservations without LINE ID remain unlinked**.

**User journey**:
1. User makes 5 reservations as guest (no LINE ID)
2. User logs in and links LINE account
3. New reservations get LINE reminders
4. Old 5 reservations still have `line_user_id: null` → no reminders

**Consider**: Should linking LINE account backfill `line_user_id` on all user's existing reservations?

```sql
-- In update_profile_line_id function:
UPDATE public.reservations
SET line_user_id = _line_user_id
WHERE user_id = _id AND line_user_id IS NULL;
```

### 4. LP.tsx Email/Phone Duplication with Existing Users

LP.tsx creates reservations without `user_id` (line 154). If the same person:
1. Makes reservation via LP with email "test@example.com"
2. Later signs up with same email

Now there are disconnected reservations. The plan doesn't address linking orphaned LP reservations to authenticated users.

## Alternative Approaches

### Simpler Approach: Eliminate Fallback Code Entirely

Instead of RPC + fallback, just add the INSERT policy and let RLS handle everything. RPC functions add complexity.

**Pros**:
- Simpler code
- Fewer moving parts
- Standard Supabase patterns

**Cons**:
- RLS policies become more complex
- Less control over edge cases

### Use Supabase Edge Functions Instead of SQL RPC

For complex operations like LINE linking (especially if you want to add backfilling, conflict checking, etc.), consider a Supabase Edge Function:

**Pros**:
- TypeScript instead of PL/pgSQL (easier to maintain)
- Can make external API calls (e.g., verify LINE ID with LINE API)
- Better error handling and logging

**Cons**:
- Extra infrastructure
- Network hop

## Verdict

**REVISE PLAN**

The plan addresses the core issues but has several critical problems that must be fixed:

1. **RPC function return type mismatch** will cause runtime errors when profile creation succeeds
2. **Missing INSERT policy** means the problem isn't fully solved (fallback still won't work in edge cases)
3. **LP.tsx LINE ID logic** throws away valid LINE IDs unnecessarily - the issue is `getContext()`, not getting LINE ID during reservation

The plan also has important missing considerations around security (unique constraint), race conditions, and user experience (backfilling existing reservations).

**Recommended changes before implementation**:
- Fix `create_profile_securely` return type
- Add INSERT policy for profiles table
- Revise LP.tsx approach to use `liff.getProfile()` instead of always setting null
- Add unique constraint on `line_user_id`
- Add proper error checking to all fallback code
- Consider backfilling reservations when user links LINE

The plan is on the right track, but these issues would cause bugs or incomplete functionality if implemented as-is.
