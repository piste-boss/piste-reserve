# Plan Review Report

## Overview
- **Plan**: Fix bug where booking "無料体験" (free trial) shows correct menu name in LINE notifications but shows "パーソナルトレーニング" (personal training) on My Page and Google Calendar
- **Root Cause**: Hardcoded menu ID mappings ('trial-60', 'personal-20', etc.) no longer match database UUIDs after menus were recreated via admin interface
- **Files affected**: 6 files (4 to be modified, 2 explicitly excluded)
- **Complexity**: Medium

## Strengths

1. **Accurate Root Cause Analysis**: The plan correctly identifies that the issue stems from UUID generation when `DEFAULT_MENUS` in MenuManager.tsx doesn't include `id` field (line 91)
2. **Comprehensive Scope**: Covers all locations with hardcoded menu IDs (MyPage.tsx, handle-reservation, send-reminders, ai-chat)
3. **Clear Exclusions**: Explicitly documents what won't be changed (LP.tsx, App.tsx) with reasoning
4. **Follows Existing Pattern**: Proposes using the same pattern as ReservationManager.tsx (line 561: `menus.find(m => m.id === r.menu_id)?.label || r.menu_id`)
5. **Includes Verification Steps**: Has basic build and display checks

## Issues Found

### Critical Issues (must fix before proceeding)

1. **Missing Database Schema Context**
   - The plan assumes the `menus` table structure but doesn't verify if there are any database constraints that could affect the migration
   - **Recommendation**: Verify that existing reservations in the database reference valid menu IDs. If the menu table was recreated, there may be orphaned references in the `reservations` table that won't match any menu

2. **GAS Payload Change Impact Not Fully Assessed**
   - Adding `menu_name` to GAS payload (modification #2) requires understanding if GAS script expects/uses this field
   - The plan states "GAS側で利用可能に" but also says "GAS側スクリプト: 外部のGoogle Apps Scriptのため今回は修正しない"
   - **Issue**: If GAS doesn't use `menu_name`, this is unnecessary. If it should use it, GAS must be modified too
   - **Recommendation**: Check the actual GAS webhook script to understand if it currently extracts menu_name from menu_id, and whether adding the field would break anything

3. **Menu Fetch Timing in MyPage.tsx Not Specified**
   - Plan says "コンポーネントマウント時にmenusテーブルからメニュー一覧を取得" but doesn't specify whether to:
     - Fetch in the existing `fetchData()` function
     - Create a separate `useEffect`
     - Use a shared context (like App.tsx does)
   - **Recommendation**: Be explicit about implementation approach - likely add to existing `fetchData()` similar to how profiles are fetched

4. **Potential Race Condition in handle-reservation**
   - Plan says "処理順序を変更: メニュー名のDB取得をGAS送信より前に移動"
   - Current code (lines 77-100) already fetches menu name before GAS, so this might be confusing
   - **Issue**: The plan description doesn't match current reality - menu fetch already happens before GAS send
   - **Recommendation**: Clarify that you're just adding `menu_name` to the GAS payload object (around line 41), not reordering

### Recommendations (should consider)

1. **Caching Strategy for Edge Functions**
   - Edge functions (handle-reservation, send-reminders, ai-chat) will query the `menus` table on every invocation
   - For send-reminders, plan says "リマインダー送信前にmenusテーブルからメニュー一覧を一括取得" which is good
   - **Recommendation**: Consider whether a global variable or module-level cache is appropriate for menus (they rarely change) to reduce database queries

2. **Error Handling for Missing Menus**
   - Plan uses fallback patterns like `menus.find(m => m.id === menuId)?.label || menuId`
   - **Recommendation**: Add logging when fallback is used to detect data inconsistencies. Consider whether showing UUID to users is acceptable or if a better fallback like "不明なメニュー" is needed

3. **ai-chat System Prompt Dynamic Construction**
   - Plan says "システムプロンプト内のハードコードされたメニューID・所要時間を、DBから取得したデータで動的に構築"
   - Current system prompt (lines 104-130) has complex hardcoded mappings that include menu names, IDs, and durations
   - **Issue**: This requires fetching menus outside the request handler (or caching) since system prompt is built on every chat message
   - **Recommendation**: Fetch menus once at module level or at the start of the serve function, then build the system prompt dynamically. This adds complexity and should be carefully designed

4. **Migration Strategy**
   - Plan doesn't address what happens to existing reservations with old hardcoded IDs like 'trial-60'
   - **Recommendation**: Either:
     - Add a migration script to update old reservation records to use new UUIDs
     - Keep the fallback mappings indefinitely to handle legacy data
     - Document that this fix only applies to new reservations going forward

### Minor Notes (nice to have)

1. **Verification Steps Could Be More Comprehensive**
   - Consider adding:
     - Check reminder function with actual test reservation
     - Verify AI chat can correctly identify and use menus
     - Test admin bulk import still works with menus from database

2. **Type Safety**
   - Consider defining a `Menu` interface that's shared across components and Edge Functions
   - Currently `MyPage.tsx` uses `const menus: any` (line 144) which loses type safety

3. **LP.tsx Exclusion Justification**
   - Plan excludes LP.tsx as "別途対応が必要な場合は別チケット"
   - LP.tsx only uses `TRIAL_MENU.id = 'trial-60'` for a single menu
   - **Consideration**: This could cause the same issue on LP if the trial menu was recreated with a UUID. Consider if this should be fixed now or if it's truly out of scope

## Missing Considerations

1. **Testing Data Consistency**
   - No mention of verifying that all menu IDs referenced in existing `reservations` table actually exist in `menus` table
   - A simple SQL query could identify orphaned references:
     ```sql
     SELECT DISTINCT menu_id FROM reservations
     WHERE menu_id NOT IN (SELECT id FROM menus)
     ```

2. **Admin MenuManager Enhancement**
   - Root cause is that `handleSeedDefaults` (MenuManager.tsx line 88-95) doesn't include `id` in `DEFAULT_MENUS`
   - **Missing**: Should the plan also fix MenuManager to insert menus WITH stable IDs to prevent this issue in the future?
   - Otherwise, if admin recreates menus again, the same bug returns

3. **Deployment/Rollout Plan**
   - Edge Functions and frontend components must be deployed in the right order
   - If Edge Functions are deployed first, old frontend will still work
   - If frontend is deployed first with old Edge Functions, there could be mismatches
   - **Recommendation**: Document deployment order

4. **Backward Compatibility**
   - If old hardcoded IDs like 'trial-60' still exist in some reservations, removing the fallback mappings entirely could break display
   - Consider keeping fallback mappings as a safety net

## Alternative Approaches

### Alternative 1: Use Stable Hardcoded IDs (Simpler)
Instead of fetching from database dynamically, fix the root cause in MenuManager:
- Modify `DEFAULT_MENUS` to include stable IDs: `{ id: 'trial-60', label: '無料体験', duration: 60, price: 0 }`
- Update `handleSeedDefaults` to use `.upsert()` instead of `.insert()` with `onConflict: 'id'`
- This way menus always have predictable IDs and no database queries are needed

**Pros**:
- Simpler implementation
- No additional database queries
- Works with existing code patterns
- Backward compatible

**Cons**:
- Less flexible if menus need to be managed entirely through UI
- Requires migration of existing UUID-based menus back to stable IDs

### Alternative 2: Hybrid Approach
- Keep hardcoded fallbacks for the 5 standard menus
- Use database lookup only for custom menus added through admin interface
- This gives best of both worlds: performance + flexibility

## Verdict

**APPROVE WITH CHANGES**

The plan correctly identifies the root cause and proposes a reasonable solution. However, there are several critical gaps that must be addressed:

1. **Clarify GAS integration** - Either remove the GAS payload change or explain why it's needed without modifying GAS
2. **Address data migration** - Decide how to handle existing reservations with old IDs (migration script vs. permanent fallbacks)
3. **Fix the root cause** - Consider updating MenuManager to prevent UUIDs in the first place by using stable IDs
4. **Specify implementation details** - Be more precise about where menu fetch happens in MyPage.tsx and how ai-chat builds dynamic prompts

The current approach will work but adds complexity (multiple database queries) to solve a problem that could be prevented at the source. Consider the "Alternative 1" approach of using stable hardcoded IDs with upsert logic in MenuManager - it's simpler, more performant, and prevents the issue from recurring.

If you proceed with the dynamic database approach, you must also:
- Add proper error handling and logging
- Consider caching strategies for Edge Functions
- Create a data migration plan for existing reservations
- Document deployment order

**Recommendation**: Either simplify by fixing MenuManager to use stable IDs, or enhance the current plan with the missing considerations listed above.
