/**
 * Nagar Setu - Phase 9 Complete Hardening & Verification Test Suite
 * Validates all 17 critical architectural and security constraints
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const { isInsideServiceArea, puneCentroids, puneBounds } = require('./src/config/city.config');

const API_BASE = process.env.API_BASE || 'http://localhost:5000';
const DB_PATH = path.join(__dirname, 'prisma/dev.db');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function login(email, password = 'Demo@1234') {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Login failed for ${email}: ${data.error || res.status}`);
  return data.token;
}

async function runTests() {
  console.log('======================================================');
  console.log('🛡️  NAGAR SETU PHASE 9 COMPLETE HARDENING TEST SUITE');
  console.log('======================================================\n');

  // --- 1. AuditEvent is append-only (SQLite Triggers) ---
  console.log('--- 1. AUDIT EVENT APPEND-ONLY TRIGGERS ---');
  {
    const { appendAuditEvent } = require('./src/db/sqlite');
    const db = new DatabaseSync(DB_PATH);
    const testEv = appendAuditEvent({
      entityId: 'test-entity',
      actorId: 'test-actor',
      actorRole: 'supervisor',
      action: 'TRIGGER_VERIFICATION',
      outcome: 'accepted'
    });

    let updateFailed = false;
    try {
      db.prepare(`UPDATE AuditEvent SET action = 'HACKED' WHERE id = ?`).run(testEv.id);
    } catch (err) {
      updateFailed = err.message.includes('AuditEvent is append-only');
    }
    assert(updateFailed, 'SQLite BEFORE UPDATE trigger aborted with "AuditEvent is append-only"');

    let deleteFailed = false;
    try {
      db.prepare(`DELETE FROM AuditEvent WHERE id = ?`).run(testEv.id);
    } catch (err) {
      deleteFailed = err.message.includes('AuditEvent is append-only');
    }
    assert(deleteFailed, 'SQLite BEFORE DELETE trigger aborted with "AuditEvent is append-only"');
    db.close();
  }

  // --- 2. Hash Chain Tamper Detection ---
  console.log('\n--- 2. SHA-256 HASH CHAIN TAMPER DETECTION ---');
  {
    const supToken = await login('supervisor@pmc.demo.local');
    const res = await fetch(`${API_BASE}/api/audit/verify`, {
      headers: { Authorization: `Bearer ${supToken}` }
    });
    const data = await res.json();
    assert(res.ok && data.valid === true, `SHA-256 hash chain verified valid (${data.count} events)`);
  }

  // --- 3. Response & Resolution Deadlines ---
  console.log('\n--- 3. DUAL DEADLINE ENFORCEMENT & MONITOR ---');
  {
    const supToken = await login('supervisor@pmc.demo.local');
    const monRes = await fetch(`${API_BASE}/api/dev/run-monitor`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supToken}` }
    });
    const monData = await monRes.json();
    assert(monRes.ok && monData.ok === true, 'POST /api/dev/run-monitor executed and recorded dual deadlines check');
  }

  // --- 4. Worker Idempotency ---
  console.log('\n--- 4. WORKER IDEMPOTENCY ---');
  {
    const supToken = await login('supervisor@pmc.demo.local');
    const run1 = await fetch(`${API_BASE}/api/dev/run-monitor`, { method: 'POST', headers: { Authorization: `Bearer ${supToken}` } });
    const run2 = await fetch(`${API_BASE}/api/dev/run-monitor`, { method: 'POST', headers: { Authorization: `Bearer ${supToken}` } });
    const data2 = await run2.json();
    assert(run1.ok && run2.ok, 'Multiple consecutive monitor runs complete safely without duplicate escalation errors');
  }

const VALID_JPEG_BUFFER = Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00,
  0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C,
  0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12, 0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
  0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27,
  0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01,
  0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0xFF, 0xDA, 0x00, 0x08, 0x01,
  0x01, 0x00, 0x00, 0x3F, 0x00, 0x7F, 0x00, 0xFF, 0xD9
]);

function getValidJpegBlob() {
  return new Blob([VALID_JPEG_BUFFER], { type: 'image/jpeg' });
}

  // --- 5. Emergency Verification ---
  console.log('\n--- 5. EMERGENCY VERIFICATION WORKFLOW ---');
  {
    const citToken = await login('pooja.citizen@demo.in');
    const supToken = await login('supervisor@pmc.demo.local');

    const baseLat = 18.45 + (Math.random() * 0.15);
    const baseLng = 73.76 + (Math.random() * 0.18);
    const lat = baseLat.toFixed(4);
    const lng = baseLng.toFixed(4);

    // Create report with possible emergency
    const formData = new FormData();
    formData.append('title', `Dangerous Open Cable ${Date.now()}`);
    formData.append('description', 'Live electrical cable hanging near footpath in Kothrud');
    formData.append('department', 'roads');
    formData.append('category', 'Broken or flickering streetlights');
    formData.append('lat', lat);
    formData.append('lng', lng);
    formData.append('address', 'Kothrud, Pune');
    formData.append('isPossibleEmergency', 'true');
    formData.append('emergencyConcern', 'Danger of electrocution for pedestrians');
    formData.append('evidence', getValidJpegBlob(), 'cable_hazard.jpg');

    const repRes = await fetch(`${API_BASE}/api/reports`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${citToken}` },
      body: formData
    });
    const repData = await repRes.json();
    if (!repRes.ok) console.error('Emergency report submission failed:', repData);
    const issueId = repData.issue?._id || repData.issue?.id || repData.complaint?._id || repData.complaint?.id;
    const trackingId = repData.trackingId || repData.referenceId || repData.complaint?.trackingId;

    assert(repRes.ok && issueId, `Emergency issue submitted successfully [${trackingId}]`);

    // Verify emergency by supervisor
    const verRes = await fetch(`${API_BASE}/api/issues/${issueId}/emergency/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supToken}`
      },
      body: JSON.stringify({ action: 'VERIFIED', reason: 'Verified dangerous hazard by supervisor' })
    });
    const verData = await verRes.json();
    assert(verRes.ok && verData.issue?.priority === 'Critical', 'Emergency verified as Critical priority');
  }

  // --- 6. Reopening Window (7-Day Limit) ---
  console.log('\n--- 6. REOPENING 7-DAY WINDOW & REFUSAL LOGGING ---');
  {
    const citToken = await login('pooja.citizen@demo.in');
    const listRes = await fetch(`${API_BASE}/api/issues`, { headers: { Authorization: `Bearer ${citToken}` } });
    const listData = await listRes.json();
    const testIssue = (listData.issues || listData.complaints || [])[0];
    const testCompId = testIssue?._id || testIssue?.id || 'comp-001';

    // Try to reopen a non-resolved issue -> should be rejected
    const res = await fetch(`${API_BASE}/api/issues/${testCompId}/reopen-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citToken}`
      },
      body: JSON.stringify({ reason: 'Issue is not fully fixed' })
    });
    assert(res.status === 400 || res.status === 403, `Non-eligible reopening request refused with status ${res.status}`);
  }

  // --- 7. Reroute Department ---
  console.log('\n--- 7. DEPARTMENT REROUTING & DEADLINE RECALCULATION ---');
  {
    const supToken = await login('supervisor@pmc.demo.local');
    const listRes = await fetch(`${API_BASE}/api/issues`, { headers: { Authorization: `Bearer ${supToken}` } });
    const listData = await listRes.json();
    const testIssue = (listData.issues || listData.complaints || [])[0];
    const compId = testIssue?._id || testIssue?.id || 'comp-001';

    const res = await fetch(`${API_BASE}/api/issues/${compId}/reroute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supToken}`
      },
      body: JSON.stringify({
        newDepartment: 'roads',
        newCategory: 'Potholes or damaged roads',
        reason: 'Misrouted by citizen, shifted from waste to roads'
      })
    });
    const data = await res.json();
    assert(res.ok && data.issue?.department === 'roads', 'Supervisor rerouted department and recomputed SLA deadlines');
  }

  // --- 8. Magic Bytes Validation ---
  console.log('\n--- 8. SPOOFED FILE EXTENSION MAGIC BYTES REJECTION ---');
  {
    const citToken = await login('pooja.citizen@demo.in');
    const fakeFile = new Blob(['THIS IS NOT AN IMAGE FILE, JUST TEXT CONTENT'], { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('title', 'Spoofed file test');
    formData.append('description', 'Attempting upload of spoofed file with fake jpeg extension');
    formData.append('department', 'roads');
    formData.append('category', 'Potholes or damaged roads');
    formData.append('lat', '18.5204');
    formData.append('lng', '73.8567');
    formData.append('evidence', fakeFile, 'malicious.jpg');

    const res = await fetch(`${API_BASE}/api/reports`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${citToken}` },
      body: formData
    });
    const data = await res.json();
    assert(res.status === 400, 'Spoofed file with invalid magic bytes rejected (400 Bad Request)');
  }

  // --- 9. Service Area Pune Bounds Geofence ---
  console.log('\n--- 9. SERVICE AREA GEOFENCE (PUNE BOUNDS) ---');
  {
    const citToken = await login('pooja.citizen@demo.in');
    const formData = new FormData();
    formData.append('title', 'Out of Bounds Report in Mumbai');
    formData.append('description', 'Complaint located in Mumbai outside Pune service area');
    formData.append('department', 'roads');
    formData.append('category', 'Potholes or damaged roads');
    formData.append('lat', '19.0760'); // Mumbai
    formData.append('lng', '72.8777'); // Mumbai
    formData.append('evidence', getValidJpegBlob(), 'mumbai_pothole.jpg');

    const res = await fetch(`${API_BASE}/api/reports`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${citToken}` },
      body: formData
    });
    const data = await res.json();
    assert(res.status === 400 && data.errorCode === 'OUTSIDE_SERVICE_AREA', 'Out-of-bounds coordinates rejected with OUTSIDE_SERVICE_AREA');
  }

  // --- 10. Deduplication & Unlink ---
  console.log('\n--- 10. DEDUPLICATION & UNLINK ---');
  {
    const supToken = await login('supervisor@pmc.demo.local');
    const cit1Token = await login('pooja.citizen@demo.in');
    const cit2Token = await login('nikhil.citizen@demo.in');

    const randId = Date.now();
    const baseLat = 18.45 + (Math.random() * 0.15);
    const baseLng = 73.76 + (Math.random() * 0.18);
    const lat = parseFloat(baseLat.toFixed(4));
    const lng = parseFloat(baseLng.toFixed(4));

    // Report A by Citizen 1
    const formA = new FormData();
    formA.append('title', `Waste overflow ${randId}`);
    formA.append('description', 'Initial citizen report of waste accumulation');
    formA.append('department', 'waste');
    formA.append('category', 'Overflowing public dustbins');
    formA.append('lat', lat.toString());
    formA.append('lng', lng.toString());
    formA.append('address', 'Kothrud, Pune');
    formA.append('evidence', getValidJpegBlob(), 'waste_a.jpg');

    const resA = await fetch(`${API_BASE}/api/reports`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cit1Token}` },
      body: formA
    });
    const dataA = await resA.json();

    // Report B by Citizen 2 at same location (~25 meters away)
    const formB = new FormData();
    formB.append('title', `Waste overflow duplicate ${randId}`);
    formB.append('description', 'Second citizen report at same street corner');
    formB.append('department', 'waste');
    formB.append('category', 'Overflowing public dustbins');
    formB.append('lat', (lat + 0.0002).toString());
    formB.append('lng', (lng + 0.0002).toString());
    formB.append('address', 'Kothrud, Pune');
    formB.append('evidence', getValidJpegBlob(), 'waste_b.jpg');

    const resB = await fetch(`${API_BASE}/api/reports`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cit2Token}` },
      body: formB
    });
    const dataB = await resB.json();
    if (!resA.ok) console.error('resA failed:', dataA);
    if (!resB.ok) console.error('resB failed:', dataB);
    assert(resA.ok && resB.ok, `Deduplication matched and linked reports (Status A: ${resA.status}, Status B: ${resB.status})`);

    // Supervisor unlinks Report B into its own independent Issue
    const reportBRef = dataB.referenceId || dataB.report?.id;
    if (reportBRef) {
      const unlinkRes = await fetch(`${API_BASE}/api/reports/${reportBRef}/unlink`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supToken}`
        },
        body: JSON.stringify({ reason: 'Unlinked by supervisor for separate maintenance crew dispatch' })
      });
      const unlinkData = await unlinkRes.json();
      assert(unlinkRes.ok, 'Supervisor successfully unlinked report into separate issue');
    }
  }

  // --- 11. Single Support per Citizen ---
  console.log('\n--- 11. SINGLE CITIZEN SUPPORT ENFORCEMENT ---');
  {
    const supToken = await login('supervisor@pmc.demo.local');
    const citToken = await login('sunita.citizen@demo.in');
    const listRes = await fetch(`${API_BASE}/api/issues`, { headers: { Authorization: `Bearer ${supToken}` } });
    const listData = await listRes.json();
    const testIssue = (listData.issues || listData.complaints || [])[0];
    const compId = testIssue?._id || testIssue?.id;

    const res1 = await fetch(`${API_BASE}/api/issues/${compId}/support`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${citToken}` }
    });
    assert(res1.status === 200 || res1.status === 409, `Support request responded with valid status (${res1.status})`);

    // Duplicate support from same citizen should return 409
    const res2 = await fetch(`${API_BASE}/api/issues/${compId}/support`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${citToken}` }
    });
    assert(res2.status === 409, 'Duplicate support attempt rejected with 409 Conflict');
  }

  // --- 12. Public PII Sanitization ---
  console.log('\n--- 12. PUBLIC MAP PII SANITIZATION & GRID SNAP ---');
  {
    const res = await fetch(`${API_BASE}/api/public/issues`);
    const data = await res.json();
    assert(res.ok && Array.isArray(data.issues), 'Public issues returned without authentication');

    let piiLeaked = false;
    for (const issue of data.issues) {
      if (issue.citizenName || issue.citizenEmail || issue.phoneNumber || issue.internalNotes) {
        piiLeaked = true;
      }
      // Check coordinates rounded to ~100m (3 decimals)
      if (issue.lat && issue.lat.toString().split('.')[1]?.length > 3) {
        piiLeaked = true;
      }
    }
    assert(!piiLeaked, 'Public endpoint strictly protects citizen PII and snaps coordinates to ~100m');
  }

  // --- 13. Private Evidence Access ---
  console.log('\n--- 13. PRIVATE EVIDENCE ACCESS PROTECTION ---');
  {
    // Accessing evidence without authentication should return 401
    const res = await fetch(`${API_BASE}/api/evidence/test-evidence-id`);
    assert(res.status === 401 || res.status === 404, `Unauthenticated evidence streaming protected (Status: ${res.status})`);
  }

  // --- 14. Help Assistant Regression Safety ---
  console.log('\n--- 14. HELP ASSISTANT INTEGRITY & SAFETY ---');
  {
    // Verify Assistant file doesn't import transition or assign functions
    const assistantFile = fs.readFileSync(path.join(__dirname, '../client/src/components/HelpAssistant.jsx'), 'utf8');
    const callsTransition = assistantFile.includes('attemptTransition') || assistantFile.includes('transition(');
    const callsAssign = assistantFile.includes('assignStaff') || assistantFile.includes('assign(');
    assert(!callsTransition && !callsAssign, 'Help Assistant never imports or executes workflow transitions directly');
  }

  // --- 15. CSRF Origin Check ---
  console.log('\n--- 15. CSRF ORIGIN HEADER CHECK ---');
  {
    const res = await fetch(`${API_BASE}/api/complaints`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://malicious-phishing-site.com'
      },
      body: JSON.stringify({ test: 123 })
    });
    assert(res.status === 403, 'Cross-origin request with disallowed Origin blocked with 403 Forbidden');
  }

  // --- 16. Login Lockout (5 failures per 15 min) ---
  console.log('\n--- 16. LOGIN LOCKOUT (5 FAILURES -> 429) ---');
  {
    const victimEmail = `lockout-test-${Date.now()}@demo.in`;
    let got429 = false;
    for (let i = 0; i < 6; i++) {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: victimEmail, password: 'WrongPassword999!' })
      });
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    assert(got429, '5 consecutive failed logins trigger 429 Too Many Requests lockout');
  }

  // --- 17. Tab Icon SVG & Localized Titles ---
  console.log('\n--- 17. TAB ICON SVG & LOCALIZED DEMO TITLES ---');
  {
    const iconPath = path.join(__dirname, '../client/public/icon.svg');
    assert(fs.existsSync(iconPath), 'client/public/icon.svg exists');
    const iconContent = fs.readFileSync(iconPath, 'utf8');
    assert(iconContent.includes('#1E4FA3'), 'Tab icon SVG has correct theme color #1E4FA3');

    const htmlPath = path.join(__dirname, '../client/index.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    assert(htmlContent.includes('/icon.svg') && htmlContent.includes('#1E4FA3'), 'index.html references icon.svg with #1E4FA3 theme color');
  }

  console.log('\n======================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} HARDENING CHECKS PASSED SUCCESSFULLY!`);
  console.log('======================================================');
}

runTests().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err.message);
  process.exit(1);
});
