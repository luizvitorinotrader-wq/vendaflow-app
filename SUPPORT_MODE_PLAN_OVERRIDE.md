# Support Mode Plan Override - Implementation

## Status: ✅ IMPLEMENTED AND STABLE

This document describes the effective plan override feature for system administrators in support mode.

---

## Overview

System administrators can now test Pro/Premium features while in support mode WITHOUT modifying the actual store plan in the database. This allows safe testing and troubleshooting without affecting billing or subscription state.

---

## Key Principles

### 1. Non-Destructive
- **Store plan remains unchanged** in the database
- No modification to subscription_status
- No changes to Stripe data
- Real billing logic unaffected

### 2. Support Mode Only
- Override ONLY active when `isSupportMode === true`
- Requires `is_system_admin === true` in profiles table
- Regular users always see real plan
- Override ends when support mode ends

### 3. Scoped to Session
- Override is session-based
- Not persisted to database
- Ends when support session ends
- Ends when admin logs out

---

## Implementation Details

### Helper Function

**Location:** `src/lib/effectivePlan.ts`

```typescript
export function getEffectivePlan(
  store: Store | null,
  isSystemAdmin: boolean,
  isSupportMode: boolean
): PlanName {
  // System admin in support mode gets premium access
  if (isSystemAdmin && isSupportMode) {
    return 'premium';
  }

  // Everyone else gets real plan
  const realPlan = (store?.plan_name || store?.plan || 'starter').toLowerCase();
  return realPlan as PlanName;
}
```

**Logic:**
1. Check if user is system admin AND in support mode
2. If yes → return 'premium' (highest tier)
3. If no → return actual store plan

### AuthContext Integration

**Location:** `src/contexts/AuthContext.tsx`

**Added:**
- Import: `getEffectivePlan` from effectivePlan.ts
- Context property: `effectivePlan: string`
- Computed value: `const effectivePlan = getEffectivePlan(store, isSystemAdmin, isSupportMode)`
- Exported in provider value

**Usage:**
```typescript
const { effectivePlan } = useAuth();
```

### Plan Limits Update

**Location:** `src/lib/planLimits.ts`

**Changed:**
- Function signatures now accept `string` instead of `string | null`
- All functions use effectivePlan passed from context

**Functions:**
```typescript
getPlanLimits(planName: string): PlanLimits
canCreateTable(currentCount: number, planName: string): boolean
getTableLimitMessage(planName: string): string
```

---

## Files Modified

### 1. `src/lib/effectivePlan.ts` (NEW)
- Created getEffectivePlan helper
- Created getEffectivePlanDisplay for UI
- Handles plan override logic

### 2. `src/contexts/AuthContext.tsx`
- Added import of getEffectivePlan
- Added effectivePlan to context type
- Computed effectivePlan value
- Exported in provider

### 3. `src/lib/planLimits.ts`
- Updated function signatures to accept string
- Removed nullable plan logic (handled by effectivePlan)

### 4. `src/pages/Tables.tsx`
- Uses `effectivePlan` from context
- Replaced all `store?.plan_name || store?.plan` with `effectivePlan`
- Passes effectivePlan to NewTableModal

### 5. `src/components/NewTableModal.tsx`
- Added effectivePlan prop
- Receives effectivePlan from parent

---

## Behavior Matrix

### Non-Admin Users
| Store Plan | Support Mode | Effective Plan | Can Access Tables? |
|------------|--------------|----------------|-------------------|
| Starter    | N/A          | starter        | ❌ No             |
| Pro        | N/A          | pro            | ✅ Yes (10 max)   |
| Premium    | N/A          | premium        | ✅ Yes (30 max)   |

### System Admin Users
| Store Plan | Support Mode | Effective Plan | Can Access Tables? | Database Changed? |
|------------|--------------|----------------|-------------------|-------------------|
| Starter    | ❌ Off       | starter        | ❌ No             | ❌ No             |
| Starter    | ✅ On        | **premium**    | ✅ Yes (30 max)   | ❌ No             |
| Pro        | ❌ Off       | pro            | ✅ Yes (10 max)   | ❌ No             |
| Pro        | ✅ On        | **premium**    | ✅ Yes (30 max)   | ❌ No             |
| Premium    | ❌ Off       | premium        | ✅ Yes (30 max)   | ❌ No             |
| Premium    | ✅ On        | **premium**    | ✅ Yes (30 max)   | ❌ No             |

**Key Points:**
- ✅ Support mode override ONLY affects effective plan
- ❌ Database plan NEVER changes
- ✅ Override applies to ALL plan-gated features
- ❌ Billing/Stripe data NEVER affected

---

## Feature Coverage

### Currently Affected
✅ **Tables/Comandas Feature**
- Table creation limits (0/10/30)
- Feature lock for starter plan
- Upgrade prompts

### Future Features (Will Automatically Work)
When new plan-gated features are added, simply:
1. Use `effectivePlan` from context
2. Pass to plan-checking logic
3. Override will automatically apply in support mode

**Example:**
```typescript
const { effectivePlan } = useAuth();
const limits = getFeatureLimits(effectivePlan);

if (!limits.hasFeature) {
  // Show locked state with upgrade prompt
}
```

---

## Testing Guide

### Test Case 1: Non-Admin User (Should NOT See Override)

**Setup:**
1. Login as regular store admin/manager/attendant
2. Store plan = starter

**Expected:**
- Tables feature locked
- Shows "Recurso Bloqueado" message
- Upgrade button shown
- effectivePlan = 'starter'

**Verify:**
```
Database: store.plan = 'starter' (unchanged)
UI: Feature locked
Context: effectivePlan = 'starter'
```

### Test Case 2: System Admin NOT in Support Mode

**Setup:**
1. Login as system admin (is_system_admin = true)
2. NOT in support mode (support session not active)
3. Target store plan = starter

**Expected:**
- Tables feature locked (same as regular user)
- No override applied
- effectivePlan = 'starter'

**Verify:**
```
Database: store.plan = 'starter' (unchanged)
UI: Feature locked
Context: effectivePlan = 'starter'
```

### Test Case 3: System Admin IN Support Mode ✅ OVERRIDE ACTIVE

**Setup:**
1. Login as system admin
2. Start support mode for a store
3. Target store plan = starter

**Expected:**
- ✅ Tables feature UNLOCKED
- ✅ Can create up to 30 tables (premium limit)
- ✅ No "upgrade" prompts shown
- ✅ effectivePlan = 'premium'

**Verify:**
```
Database: store.plan = 'starter' (UNCHANGED!)
UI: Feature unlocked, premium limits
Context: effectivePlan = 'premium'
Support: isSupportMode = true
```

### Test Case 4: End Support Mode (Override Ends)

**Setup:**
1. System admin in support mode (override active)
2. Click "Encerrar Modo Suporte"

**Expected:**
- ✅ Override ends immediately
- ✅ effectivePlan reverts to real plan
- ✅ UI updates to show locked state (if starter)
- ✅ Database still unchanged

**Verify:**
```
Database: store.plan = 'starter' (UNCHANGED)
UI: Feature locked again
Context: effectivePlan = 'starter'
Support: isSupportMode = false
```

---

## Security Considerations

### ✅ Safe
1. Database plan never modified
2. Billing data never touched
3. Stripe integration unaffected
4. Override scoped to session
5. Requires system admin privilege
6. Requires active support session

### ✅ Audit Trail
- Support mode start/end logged in admin_support_sessions
- All actions performed in support mode are traceable
- User's real role preserved

### ✅ No Privilege Escalation
- Regular users cannot activate override
- Override only works for system admins
- Support mode must be explicitly started
- Ends automatically on logout

---

## Maintenance Notes

### Adding New Plan-Gated Features

When adding features with plan restrictions:

1. **Use effectivePlan from context:**
   ```typescript
   const { effectivePlan } = useAuth();
   ```

2. **Pass to plan-checking functions:**
   ```typescript
   const limits = getPlanLimits(effectivePlan);
   ```

3. **Never use store.plan directly:**
   ```typescript
   // ❌ DON'T DO THIS
   const limits = getPlanLimits(store?.plan);

   // ✅ DO THIS
   const { effectivePlan } = useAuth();
   const limits = getPlanLimits(effectivePlan);
   ```

4. **Override will automatically apply**

### Future Enhancements

Possible improvements:
1. Add UI indicator showing override is active
2. Display "Support Mode: Premium Access" badge
3. Log which features were accessed with override
4. Add override duration tracking

---

## Troubleshooting

### Override Not Working

**Check:**
1. Is user system admin? (`is_system_admin = true` in profiles)
2. Is support mode active? (`isSupportMode = true`)
3. Is support session in database? (`admin_support_sessions` table)
4. Is effectivePlan being used? (not store.plan directly)

### Override Persisting After Logout

**Should NOT happen** - verify:
1. Support session marked inactive on logout
2. isSupportMode state cleared
3. effectivePlan recomputed

### Database Plan Changed

**Should NEVER happen** - if it does:
1. Check all plan-update code paths
2. Ensure override only reads, never writes
3. Verify Stripe webhook not triggered

---

## Summary

The effective plan override system provides a safe, non-destructive way for system administrators to test premium features while in support mode.

**Key Features:**
✅ Support mode only (requires active session)
✅ System admin only (requires is_system_admin)
✅ Database never modified
✅ Billing unaffected
✅ Session-scoped (ends with support mode)
✅ All plan-gated features automatically covered

**Implementation:**
- 1 new file (effectivePlan.ts)
- 5 files modified
- Clean, maintainable architecture
- Easy to extend to new features

**Security:**
- No database writes
- Audit trail maintained
- No privilege escalation
- Session-based only

---

**Version:** 1.0
**Date:** 2026-03-21
**Status:** Production Ready
