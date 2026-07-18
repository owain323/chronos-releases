-- Migration v4.1: backfill amount_cents from amount REAL (T4 float→cents)
-- MUST be run AFTER the schema columns are created (ALTER TABLE or drizzle-kit push)
PRAGMA journal_mode = WAL;

-- costEntries
UPDATE costEntries SET amount_cents = ROUND(amount * 100) WHERE amount IS NOT NULL AND amount_cents IS NULL;
-- revenueEntries
UPDATE revenueEntries SET amount_cents = ROUND(amount * 100) WHERE amount IS NOT NULL AND amount_cents IS NULL;
-- expenseEntries
UPDATE expenseEntries SET amount_cents = ROUND(amount * 100) WHERE amount IS NOT NULL AND amount_cents IS NULL;
-- journalEntries
UPDATE journalEntries SET debit_amount_cents = ROUND(debitAmount * 100) WHERE debitAmount IS NOT NULL AND debit_amount_cents IS NULL;
UPDATE journalEntries SET credit_amount_cents = ROUND(creditAmount * 100) WHERE creditAmount IS NOT NULL AND credit_amount_cents IS NULL;
-- budgets
UPDATE budgets SET amount_cents = ROUND(amount * 100) WHERE amount IS NOT NULL AND amount_cents IS NULL;
-- closings
UPDATE closings SET net_income_cents = ROUND(netIncome * 100) WHERE netIncome IS NOT NULL AND net_income_cents IS NULL;
