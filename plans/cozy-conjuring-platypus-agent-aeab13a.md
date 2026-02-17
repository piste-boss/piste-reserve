# Plan Review Report

## Overview
- Plan: Fix kana search bug after reservation cancellation (switching from physical DELETE to logical delete)
- Files affected: 11 files (5 code files + 6 SQL documentation files)
- Complexity: **Medium-High**

## Strengths

1. **Correct Root Cause Analysis** - The plan correctly identifies that physical deletion removes `name_kana` data from reservations, breaking customer search functionality.

2. **Comprehensive Approach** - Adding both logical delete (status column) AND `name_kana` to profiles table ensures multiple paths for customer data persistence.

3. **Backwards Compatibility Consideration** - The Edge Function approach of using `effectiveType` to treat status changes as DELETE events is clever and minimizes code disruption.

4. **Good Testing Strategy** - The verification steps are comprehensive and cover all critical user journeys.

---

## Critical Issues (must fix before proceeding)

### 1. **AI Chat Function Uses Physical DELETE**

**Location**: `/Users/ishikawasuguru/piste-reserve/supabase/functions/ai-chat/index.ts` line 222

**Problem**: The AI chat's `cancel_reservation` function still uses `.delete()`:

```typescript
const { error: delError, status } = await supabase.from('reservations').delete().eq('id', args.id);
```

**Impact**: When customers cancel reservations via AI chat, it will still physically delete the record, breaking kana search.

**Fix Required**: Change line 213-230 to use logical delete:
```typescript
else if (call.name === "cancel_reservation") {
    const { error, status } = await supabase
        .from('reservations')
        .update({
            status: 'cancelled',
            cancel_reason: args.cancel_reason || null
        })
        .eq('id', args.id);
    // ... handle response
}
```

**Note**: Remove the separate cancel_reason update (lines 216-220) since it's now combined.

---

### 2. **Missing Filter in Multiple Query Locations**

**Locations**:
- `/Users/ishikawasuguru/piste-reserve/supabase/functions/ai-chat/index.ts` line 145 (`get_booked_times`)
- `/Users/ishikawasuguru/piste-reserve/supabase/functions/ai-chat/index.ts` line 172 (`add_reservation` double-booking check)
- `/Users/ishikawasuguru/piste-reserve/src/components/ReservationTime.tsx` line 38-41
- `/Users/ishikawasuguru/piste-reserve/src/components/admin/CustomerList.tsx` line 13

**Problem**: These queries fetch reservations but don't filter out cancelled ones. This means:
- Cancelled reservations will still block time slots (appear as "booked")
- AI will think cancelled times are unavailable
- Customer list will include duplicates from cancelled reservations

**Fix Required**: Add `.neq('status', 'cancelled')` or `.eq('status', 'active')` to all these queries.

**Example for ai-chat/index.ts line 145**:
```typescript
const { data } = await supabase
    .from('reservations')
    .select('reservation_time, reservation_end_time')
    .eq('reservation_date', args.date)
    .neq('status', 'cancelled');  // ADD THIS
```

---

### 3. **ReservationManager Calendar Display Still Shows Cancelled**

**Location**: `/Users/ishikawasuguru/piste-reserve/src/components/admin/ReservationManager.tsx` line 38-41

**Problem**: The plan says to split queries (lines 35-88), but the current code fetches ALL reservations without filtering. The calendar's green dots (line 298) will show on dates with only cancelled reservations.

**Fix Required**:
```typescript
const fetchReservations = async () => {
    setLoading(true);

    // Calendar display - active only
    const { data: activeData, error: resvError } = await supabase
        .from('reservations')
        .select('*')
        .neq('status', 'cancelled')  // ADD THIS
        .order('reservation_time', { ascending: true });

    // Customer candidates - include all (even cancelled) for search
    const { data: allResvData } = await supabase
        .from('reservations')
        .select('name, name_kana, phone, email, menu_id');

    // ... rest of logic using activeData for display, allResvData for customer list
}
```

---

### 4. **Edge Function: Logical Issue with effectiveType**

**Location**: Plan lines 90-98

**Problem**: The plan describes creating an `effectiveType` variable but doesn't explain how to integrate it with existing logic. The current code structure has many conditional branches checking `type === 'DELETE'` (lines 66, 121, 139, etc.).

**Clarification Needed**: The plan should explicitly state:
- Calculate `effectiveType` at line 32-33 BEFORE the GAS sync block
- Replace ALL instances of `type === 'DELETE'` with `effectiveType === 'DELETE'` throughout the function
- For GAS payload, pass `effectiveType` as the `type` field (or keep original `type` and add `effectiveType` - needs decision)

**Risk**: If not all branches are updated, cancellations won't trigger notifications properly.

---

### 5. **Missing Default Value Handling**

**Problem**: When adding `status` column with default 'active', existing reservations (already in DB) won't automatically get this default.

**Fix Required**: Migration SQL should include:
```sql
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Backfill existing records
UPDATE public.reservations SET status = 'active' WHERE status IS NULL;

-- Add NOT NULL constraint after backfill
ALTER TABLE public.reservations ALTER COLUMN status SET NOT NULL;
```

---

## Recommendations (should consider)

### 1. **Add Database Index on Status Column**

Since every display query will now filter by `status`, add an index for performance:

```sql
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.reservations(status);
```

This is especially important if the reservations table grows large.

---

### 2. **Consider Composite Index for Common Query Pattern**

Many queries filter by both `reservation_date` and `status`:

```sql
CREATE INDEX IF NOT EXISTS idx_reservations_date_status
    ON public.reservations(reservation_date, status);
```

This will significantly speed up calendar/time slot queries.

---

### 3. **Add Status Type Constraint**

Prevent invalid status values:

```sql
ALTER TABLE public.reservations
    ADD CONSTRAINT check_status
    CHECK (status IN ('active', 'cancelled'));
```

---

### 4. **Handle "Uncancellation" Scenario**

**Question**: What if a cancelled reservation needs to be restored (customer calls back to reactivate)?

**Consideration**: The plan doesn't address updating status from 'cancelled' back to 'active'. While rare, this might be needed. Consider:
- Should the Edge Function detect this transition (old_record.status = 'cancelled', new.status = 'active')?
- Should it send a "reservation reactivated" notification?
- Or is it better to just let admins create a new reservation?

**Recommendation**: Document the decision in code comments.

---

### 5. **ReservationManager: Improve Query Separation**

The plan's approach of building `uniqueCustomers` from two separate arrays (profiles + reservations) is correct, but the code could be cleaner:

```typescript
// Instead of checking `seen` in two separate loops, use a Map
const customerMap = new Map();

// Add from profiles
profileData?.forEach(p => {
    const key = (p.name || '') + (p.phone || '');
    if (key && !customerMap.has(key)) {
        customerMap.set(key, {
            name: p.name,
            name_kana: p.name_kana,
            phone: p.phone,
            email: p.email,
            source: 'profile'
        });
    }
});

// Add from ALL reservations (including cancelled) for search
allResvData?.forEach(r => {
    const key = (r.name || '') + (r.phone || '');
    if (key && !customerMap.has(key)) {
        customerMap.set(key, {
            name: r.name,
            name_kana: r.name_kana,
            phone: r.phone,
            email: r.email,
            menu_id: r.menu_id,
            source: 'resv'
        });
    }
});

setCustomers(Array.from(customerMap.values()));
```

---

## Minor Notes (nice to have)

### 1. **TypeScript Types for Status**

Consider adding a type definition:

```typescript
type ReservationStatus = 'active' | 'cancelled';
```

Use this in component state and function parameters for type safety.

---

### 2. **Plan Formatting: Code Block Clarity**

The plan shows "Before/After" code snippets but doesn't always indicate exact line ranges. For example:

**Section 2, line 50**: Says "行30-34" but the actual line numbers in MyPage.tsx are different. This could confuse the implementer.

**Recommendation**: During implementation, verify actual line numbers in real-time since the file might have changed.

---

### 3. **Consider Adding `cancelled_at` Timestamp**

For audit purposes and analytics:

```sql
ALTER TABLE public.reservations ADD COLUMN cancelled_at TIMESTAMP WITH TIME ZONE;
```

Update it when status changes to 'cancelled'. Useful for:
- Tracking when cancellations happened
- Analyzing cancellation patterns
- Customer support inquiries

---

### 4. **SQL Documentation Files: Completeness**

The plan lists 4 SQL doc files to update (lines 110-115), but there are actually 5 `.sql` files in the repo:
- SUPABASE_SCHEMA.sql
- SUPABASE_PROFILES_SCHEMA.sql
- SUPABASE_FULL_SETUP.sql
- SUPABASE_PROFILES_RPC.sql
- **SUPABASE_PROFILE_TRIGGER.sql** ← Missing from plan

Check if SUPABASE_PROFILE_TRIGGER.sql also needs updates (probably not, but verify).

---

## Missing Considerations

### 1. **Google Calendar Sync Impact**

**Issue**: The plan mentions GAS will work with `effectiveType` (line 98), but doesn't explain what happens to cancelled events in Google Calendar.

**Questions**:
- Does the GAS script delete the event from Google Calendar when it receives effectiveType='DELETE'?
- Should cancelled reservations remain visible in Google Calendar (perhaps with a different color/label)?
- What if the admin wants to see cancelled slots to understand capacity?

**Recommendation**: Review the GAS webhook script (referenced at line 4 of handle-reservation/index.ts) to ensure it handles this transition correctly. The current code at line 66 checks `currentRecord.source !== 'google-manual' || type === 'DELETE'`, which should work with `effectiveType`, but verify the GAS-side logic.

---

### 2. **Migration Rollback Plan**

**Issue**: If something goes wrong after deploying, how do you rollback?

**Considerations**:
- Once status column exists, you can't easily revert to physical deletes (already-cancelled records would be lost)
- Need to ensure no data loss during migration

**Recommendation**:
1. Backup the database before running migrations
2. Test thoroughly in a staging environment
3. Document rollback steps (in case status column needs to be removed)

---

### 3. **Real-time Subscription Impact**

**Location**: `/Users/ishikawasuguru/piste-reserve/src/components/admin/ReservationManager.tsx` lines 105-114

**Current behavior**: The component subscribes to ALL reservation changes (`event: '*'`).

**Issue**: When a cancellation happens (UPDATE instead of DELETE), the subscription will fire. The current `fetchReservations()` will be called, which is correct. However, ensure the UI properly removes cancelled reservations from the daily list.

**Verification needed**: Test that real-time updates correctly hide cancelled reservations from the admin calendar view immediately after cancellation (without page refresh).

---

### 4. **Filter Logic for find_user_reservations in AI Chat**

**Location**: `/Users/ishikawasuguru/piste-reserve/supabase/functions/ai-chat/index.ts` lines 148-163

**Current behavior**: Fetches user's reservations with `.gte('reservation_date', todayStr)` (future reservations only).

**Question**: Should cancelled reservations be included in the customer's reservation history when they ask the AI?

**Options**:
1. **Show cancelled** (with status indicated) - more transparent, customer can see their history
2. **Hide cancelled** - cleaner, only shows active reservations

**Current plan doesn't address this**. The AI system prompt (lines 103-130) doesn't mention how to handle cancelled reservations in conversation.

**Recommendation**:
- If showing cancelled: Add `.select('*, status')` and update AI prompt to explain "Your previous reservation on X was cancelled"
- If hiding cancelled: Add `.neq('status', 'cancelled')` to the query (line 150)

I recommend **showing cancelled with status** for better customer experience (they can reference past cancellations).

---

### 5. **Race Condition: Concurrent Cancellations**

**Scenario**: Admin and customer try to cancel the same reservation simultaneously.

**Current behavior**: Both will execute UPDATE, likely succeeding (both set status='cancelled'). This is fine.

**Potential issue**: If one sets a cancel_reason and the other doesn't, the reason might be lost depending on timing.

**Severity**: Low (rare edge case)

**Recommendation**: No action needed unless you want to add a "cancelled_by" field to track who initiated the cancellation (user vs admin).

---

## Alternative Approaches

### Option A: Use Deleted_at Soft Delete Pattern (More Standard)

Instead of a `status` column, use a `deleted_at` timestamp column:

```sql
ALTER TABLE reservations ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
```

**Pros**:
- Industry standard (Rails, Laravel, etc. all use this pattern)
- Automatically captures when deletion happened
- NULL = active, NOT NULL = deleted
- Queries: `WHERE deleted_at IS NULL` for active records

**Cons**:
- Less semantic than 'active'/'cancelled' status
- Can't distinguish different statuses (e.g., future: 'completed', 'no-show')

**Recommendation**: If you might need multiple statuses in the future (e.g., 'completed', 'no-show'), stick with `status` column. Otherwise, `deleted_at` is simpler.

---

### Option B: Separate Cancelled_Reservations Table

Move cancelled reservations to a separate archive table.

**Pros**:
- Keeps main table clean and fast
- Clear separation of active/historical data

**Cons**:
- More complex queries (need to UNION for customer search)
- More complex cancellation logic (move record to another table)
- Database triggers needed

**Recommendation**: Overkill for this use case. The status column approach is much simpler.

---

### Option C: Keep Physical Delete, Add name_kana to Profiles Only

Only do half of the plan - add `name_kana` to profiles table but keep using DELETE.

**Pros**:
- Simpler implementation
- Database stays cleaner (no cancelled records)

**Cons**:
- **Doesn't solve the root problem**: Guest reservations (no profile) will still lose kana data on cancellation
- Relies on customers having profiles, which many don't (guest bookings)

**Recommendation**: Not viable. The plan's approach is better.

---

## Verdict

**APPROVE WITH CHANGES**

The plan is fundamentally sound and addresses the root cause correctly. The logical delete approach is the right solution, and adding `name_kana` to profiles provides redundancy.

However, there are **4 critical issues** that MUST be fixed before implementation:

1. AI chat function still uses physical DELETE
2. Multiple queries missing status filter (will show cancelled slots as booked)
3. ReservationManager needs explicit query splitting
4. Edge Function effectiveType logic needs complete specification

Additionally, I strongly recommend:
- Adding database indexes on status column
- Clarifying GAS webhook behavior with logical deletes
- Deciding whether to show cancelled reservations in AI chat history
- Adding backfill UPDATE for existing records

**Estimated implementation risk**: Medium. The changes touch many critical files, and missing even one query filter could cause user-facing bugs (double bookings, ghost availability). Thorough testing is essential.

**Testing checklist additions** (beyond plan's section):
1. Verify time slots become available immediately after cancellation
2. Test AI chat cancellation flow end-to-end
3. Verify GAS webhook creates/deletes Google Calendar events correctly
4. Test real-time subscription updates in admin dashboard
5. Check that customer list doesn't show duplicates after cancellation
6. Verify kana search works for both profile-based AND guest-based customers

Once these issues are addressed, the plan will be ready for implementation.
