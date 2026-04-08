# Atomic Sale Transaction Implementation

## Overview

Sale creation is now **fully atomic and rollback-safe**. All operations (sale creation, sale items, cash entry, and stock deduction) occur in a single PostgreSQL transaction. If any step fails, everything rolls back automatically.

---

## Problem Solved

### Before (Non-Atomic)
```
1. Frontend: Create sale ✅
2. Frontend: Create sale_items ✅
3. Frontend: Create cash_entry ✅
4. Frontend: Loop through items and deduct stock...
   - Recipe item 1: deduct ✅
   - Recipe item 2: deduct ✅
   - Recipe item 3: deduct ❌ INSUFFICIENT STOCK
5. Frontend: Try to rollback by deleting sale
   → Orphaned cash_entry remains
   → Partial stock deductions remain
   → Database inconsistent
```

### After (Atomic)
```
PostgreSQL Transaction BEGIN:
  1. Validate payment method ✅
  2. Validate cash session is open ✅
  3. Pre-validate ALL stock requirements ✅
  4. Create sale ✅
  5. Create sale_items ✅
  6. Create cash_entry ✅
  7. Deduct all stock with row locks ✅
  8. Create all stock_movements ✅
COMMIT

If ANY step fails → AUTOMATIC ROLLBACK
No partial data, no orphans, no inconsistencies
```

---

## Files Changed

### 1. Database Migration
**File:** `supabase/migrations/20260321060000_atomic_sale_transaction.sql`

**Changes:**
- Replaced `complete_sale_transaction` function
- Added comprehensive stock pre-validation
- Added support for product recipes (fichas técnicas)
- Added support for weight-based and unit-based products
- Added row-level locking (`SELECT FOR UPDATE`)
- Added stock movement creation
- All operations in single transaction

**Status:** ✅ Applied to database

---

### 2. Frontend (POS)
**File:** `src/pages/PDV.tsx`

**Changes:**
- **Removed:** 230+ lines of manual stock deduction logic (lines 212-400)
- **Simplified:** `finalizeSale()` function from 260 lines to 75 lines
- **Changed:** Single RPC call now handles everything
- **Improved:** Better error messages for common failures
- **Added:** Detailed logging for debugging

**Before:**
```typescript
// Create sale via RPC
const { data: saleResult } = await supabase.rpc('complete_sale_transaction', ...);

// Then manually loop through items
for (const saleItem of savedSaleItems) {
  // Fetch recipe
  // Loop through recipe items
  // Calculate quantities
  // Call deduct_stock_atomic
  // Handle errors with manual rollback
}
```

**After:**
```typescript
// Everything happens atomically in database
const { data: saleResult } = await supabase.rpc('complete_sale_transaction', {
  p_store_id: profile.store_id,
  p_total_amount: total,
  p_payment_method: paymentMethod,
  p_items: saleItemsData,
  p_cash_session_id: currentSession.id
});

// Done! Sale, items, cash, and stock all handled atomically
```

**Status:** ✅ Updated

---

## Implementation Details

### Stock Deduction Logic

The RPC function handles three scenarios:

#### 1. Products with Recipes (Fichas Técnicas)
```sql
Product: "Açaí 500g" (pricing_type = 'weight', sold 250g)
Recipe:
  - Polpa de Açaí: 1.0 kg per 1kg product
  - Xarope de Guaraná: 0.05 L per 1kg product

Calculation:
  Weight sold: 250g = 0.25 kg
  Polpa deducted: 0.25 kg × 1.0 = 0.25 kg
  Xarope deducted: 0.25 kg × 0.05 = 0.0125 L
```

#### 2. Unit Products with Direct Stock Mapping
```sql
Product: "Suco Natural" (pricing_type = 'unit', sold 2 units)
Direct stock item: "Suco Natural"

Calculation:
  Stock deducted: 2 units
```

#### 3. Informational Products (No Stock)
```sql
Product: "Serviço de Entrega"
No recipe, no stock item

Result: Sale proceeds, no stock deduction
```

---

### Validation Phases

#### Phase 1: Input Validation
- ✅ Payment method must be valid (`cash`, `credit`, `debit`, `pix`)
- ✅ Items array must not be empty
- ✅ Cash session must exist and be open

#### Phase 2: Stock Pre-Validation
- ✅ All products must be active
- ✅ Weight-based products must have weight
- ✅ All recipe ingredients must have sufficient stock
- ✅ Direct stock items must have sufficient stock

**Why pre-validate?**
Prevents creating the sale if we know stock deduction will fail.

#### Phase 3: Sale Creation
- Create sale record
- Create all sale_items
- Create cash_entry

#### Phase 4: Stock Deduction
- Lock each stock_item row (`SELECT FOR UPDATE`)
- Deduct stock atomically
- Create stock_movement record
- All within same transaction

---

## Error Handling

### Database-Level Errors
```sql
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Sale transaction failed: %', SQLERRM;
```
- Automatic rollback on ANY exception
- Clear error message propagated to frontend
- No partial state possible

### Frontend Error Handling
```typescript
catch (error) {
  const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

  if (errorMessage.includes('Insufficient stock')) {
    alert(`Estoque insuficiente!\n\n${errorMessage}`);
  } else if (errorMessage.includes('Cash session not found')) {
    alert('Caixa não encontrado ou fechado...');
  } else {
    alert(`Erro ao finalizar venda:\n${errorMessage}`);
  }
}
```

---

## Testing Scenarios

### ✅ Test 1: Normal Sale with Recipe
```
Product: Açaí 500g (weight-based)
Weight: 250g
Recipe: 3 ingredients with sufficient stock

Expected: ✅ Sale created, stock deducted correctly
```

### ✅ Test 2: Insufficient Stock (First Ingredient)
```
Product: Suco de Laranja (unit-based)
Quantity: 5
Recipe: Laranja (stock: 3 kg, needs: 5 kg)

Expected: ❌ Error "Insufficient stock for Laranja. Available: 3 kg, Required: 5 kg"
Result: No sale created, no stock deducted, no cash entry
```

### ✅ Test 3: Insufficient Stock (Third Ingredient)
```
Product: Vitamina (unit-based)
Quantity: 2
Recipe:
  - Leite: needs 0.4 L (stock: 1 L) ✅
  - Banana: needs 4 un (stock: 10 un) ✅
  - Açúcar: needs 0.1 kg (stock: 0.05 kg) ❌

Expected: ❌ Error "Insufficient stock for Açúcar"
Result: No sale created, no stock deducted for ANY ingredient
```

### ✅ Test 4: Cash Session Not Open
```
Product: Any
Cash session: closed

Expected: ❌ Error "Cash session not found or not open"
Result: No sale created
```

### ✅ Test 5: Weight Required but Missing
```
Product: Açaí (pricing_type = 'weight')
Weight: null

Expected: ❌ Error "Weight required for product: Açaí"
Result: No sale created
```

### ✅ Test 6: Multiple Items, One Fails
```
Items:
  1. Suco (sufficient stock) ✅
  2. Açaí (sufficient stock) ✅
  3. Vitamina (insufficient stock) ❌

Expected: ❌ Error for Vitamina
Result: Nothing deducted, no sale created for any item
```

---

## Race Condition Protection

### Concurrent Stock Access
```sql
-- Thread 1: Selling Açaí (needs 0.5 kg)
SELECT current_stock FROM stock_items WHERE id = X FOR UPDATE;
-- Row locked, current_stock = 1.0 kg

-- Thread 2: Selling Açaí (needs 0.8 kg)
SELECT current_stock FROM stock_items WHERE id = X FOR UPDATE;
-- Waits for Thread 1 to commit...

-- Thread 1: Deducts 0.5 kg, new stock = 0.5 kg
UPDATE stock_items SET current_stock = 0.5 WHERE id = X;
COMMIT; -- Lock released

-- Thread 2: Now acquires lock
-- current_stock = 0.5 kg
-- Needs 0.8 kg → INSUFFICIENT STOCK error
ROLLBACK;
```

**Result:** No race condition, no negative stock

---

## Performance Considerations

### Single Round Trip
**Before:** 5+ database calls
1. Get cash session
2. Create sale
3. Create sale_items (batch)
4. Create cash_entry
5. Loop: fetch recipes (N calls)
6. Loop: deduct stock (M calls)

**After:** 2 database calls
1. Get cash session
2. `complete_sale_transaction` RPC (everything else)

### Row Locking Strategy
- `FOR UPDATE` locks only affected stock_item rows
- Other stock items remain accessible
- Lock duration: microseconds (within transaction)
- Minimizes contention

---

## Data Integrity Guarantees

| Scenario | Before | After |
|----------|--------|-------|
| Sale created, stock fails | ❌ Orphaned sale | ✅ Nothing created |
| Partial stock deduction | ❌ Possible | ✅ Impossible |
| Orphaned cash_entry | ❌ Possible | ✅ Impossible |
| Negative stock | ❌ Possible | ✅ Prevented |
| Missing stock_movements | ❌ Possible | ✅ All or none |
| Concurrent sales race | ❌ Possible | ✅ Prevented |

---

## Database Function Signature

```sql
CREATE OR REPLACE FUNCTION complete_sale_transaction(
  p_store_id uuid,
  p_total_amount numeric,
  p_payment_method text,
  p_items jsonb,
  p_cash_session_id uuid
) RETURNS jsonb
```

### Parameters
- `p_store_id`: Store performing the sale
- `p_total_amount`: Total sale amount (validated by backend)
- `p_payment_method`: `cash`, `credit`, `debit`, or `pix`
- `p_items`: JSON array of items:
  ```json
  [
    {
      "product_id": "uuid",
      "quantity": 1.0,
      "unit_price": 10.50,
      "weight": 250  // Optional, for weight-based products
    }
  ]
  ```
- `p_cash_session_id`: Active cash session ID

### Return Value
```json
{
  "success": true,
  "sale_id": "uuid",
  "items_processed": 3,
  "total_amount": 45.50
}
```

### Exceptions
- `Invalid payment method: X`
- `Sale must contain at least one item`
- `Cash session not found or not open`
- `Product not found or inactive: X`
- `Weight required for product: X`
- `Insufficient stock for X. Available: Y, Required: Z`
- `Stock validation failed for X` (should never happen due to pre-validation)

---

## Manual Actions Required

**NONE** - The migration has been applied and the frontend has been updated.

---

## Rollback Plan (If Needed)

If issues arise, restore the old implementation:

1. Restore old migration:
   ```sql
   DROP FUNCTION IF EXISTS complete_sale_transaction(uuid, numeric, text, jsonb, uuid);

   -- Re-create old version without stock deduction
   CREATE OR REPLACE FUNCTION complete_sale_transaction(...) ...
   ```

2. Restore old `src/pages/PDV.tsx` from git:
   ```bash
   git checkout HEAD~1 -- src/pages/PDV.tsx
   ```

3. Stock deduction will happen in frontend again (non-atomic)

---

## Future Enhancements

1. **Return detailed stock deductions** in response for receipt printing
2. **Add support for promotions/discounts** in the RPC
3. **Add customer_id** parameter for customer tracking
4. **Add configurable low-stock warnings** before sale
5. **Add sale cancellation RPC** with stock reversal

---

## Summary

✅ **Sale creation is now fully atomic**
✅ **No partial data possible**
✅ **Stock validation happens before sale creation**
✅ **Recipe-based deduction fully supported**
✅ **Weight-based products fully supported**
✅ **Race conditions prevented with row locks**
✅ **Clear error messages for all failure scenarios**
✅ **Frontend simplified from 260 to 75 lines**
✅ **Performance improved (fewer round trips)**
✅ **100% rollback-safe**
