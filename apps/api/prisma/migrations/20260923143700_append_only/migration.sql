-- Audit log and stock ledger are append-only: no UPDATE, no DELETE, for anyone.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER stock_ledger_append_only
  BEFORE UPDATE OR DELETE ON "StockLedger"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER stock_ledger_no_truncate
  BEFORE TRUNCATE ON "StockLedger"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
