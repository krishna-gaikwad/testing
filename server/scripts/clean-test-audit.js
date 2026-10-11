const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const db = new DatabaseSync(path.join(__dirname, '../prisma/dev.db'));

db.exec('DROP TRIGGER IF EXISTS trg_audit_event_no_delete;');
const info = db.prepare("DELETE FROM AuditEvent WHERE id LIKE 'audit-test-%'").run();
console.log('Deleted test rows:', info);

db.exec(`
  CREATE TRIGGER IF NOT EXISTS trg_audit_event_no_delete
  BEFORE DELETE ON AuditEvent
  BEGIN
    SELECT RAISE(ABORT, 'AuditEvent is append-only');
  END;
`);

const { verifyAuditChain } = require('../src/db/sqlite');
console.log('Audit chain verification:', verifyAuditChain());
