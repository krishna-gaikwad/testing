// Set server process timezone
process.env.TZ = process.env.CITY_TIMEZONE || 'Asia/Kolkata';

require('dotenv').config();
const { STATES, TRANSITIONS } = require('../config/workflow.config');
const { attemptTransition } = require('../services/workflowEngine');
const { calculateDeadlines, updatePriorityWithDeadlines } = require('../services/deadlineService');
const { ComplaintStore, WorkflowEventStore, UserStore } = require('../services/memoryStore');
const { seedDatabase } = require('../seed/seedUsers');

async function runWorkflowTests() {
  console.log('\n======================================================');
  console.log('🧪 NAGAR SETU WORKFLOW ENGINE TEST SUITE');
  console.log('======================================================\n');

  // 1. Seed users to ensure all test roles exist
  await seedDatabase();

  const reviewer = await UserStore.findOne({ role: 'reviewer' });
  const roadsOfficer = await UserStore.findOne({ role: 'officer', department: 'roads' });
  const wasteOfficer = await UserStore.findOne({ role: 'officer', department: 'waste' });
  const citizen = await UserStore.findOne({ role: 'citizen' });

  // Create a sample complaint in department 'roads'
  const deadlines = calculateDeadlines('roads', 'Normal');
  let testComplaint = await ComplaintStore.create({
    trackingId: 'NS-2026-TEST01',
    citizen: citizen._id || citizen.id,
    department: 'roads',
    category: 'Pothole',
    title: 'Huge pothole on FC Road',
    description: 'Dangerous pothole near Fergusson College gate',
    area: 'Shivajinagar',
    status: STATES.SUBMITTED,
    priority: 'Normal',
    initialResponseDue: deadlines.initialResponseDue,
    resolutionDue: deadlines.resolutionDue,
    location: { lat: 18.5204, lng: 73.8567, address: 'FC Road, Pune' }
  });

  console.log('📦 Test Complaint initialized:');
  console.log(`   ID: ${testComplaint.trackingId} | Status: ${testComplaint.status} | Dept: ${testComplaint.department}\n`);

  let passedTests = 0;
  let totalTests = 5;

  // TEST 1: Skipped state (Submitted -> Resolved directly)
  console.log('TEST 1: Skipped State Attempt (Submitted → Resolved)');
  const res1 = await attemptTransition({
    complaint: testComplaint,
    toStatus: STATES.RESOLVED,
    actor: reviewer,
    payload: {}
  });

  if (!res1.success && res1.statusCode === 400 && res1.message.includes('Cannot move from Submitted to Resolved')) {
    console.log('   ✅ REFUSED as expected with status 400:');
    console.log(`      Reason: "${res1.message}"`);
    passedTests++;
  } else {
    console.error('   ❌ FAILED: Expected refusal on skipped state', res1);
  }

  // TEST 2: Wrong Role (Citizen tries to move Submitted -> Under Review)
  console.log('\nTEST 2: Wrong Role Attempt (Citizen tries to Start Review)');
  const res2 = await attemptTransition({
    complaint: testComplaint,
    toStatus: STATES.UNDER_REVIEW,
    actor: citizen,
    payload: {}
  });

  if (!res2.success && res2.statusCode === 403 && res2.message.includes('Role citizen is not permitted')) {
    console.log('   ✅ REFUSED as expected with status 403:');
    console.log(`      Reason: "${res2.message}"`);
    passedTests++;
  } else {
    console.error('   ❌ FAILED: Expected 403 on wrong role', res2);
  }

  // First advance legitimately to Under Review & Accepted for next tests
  await attemptTransition({
    complaint: testComplaint,
    toStatus: STATES.UNDER_REVIEW,
    actor: reviewer
  });

  await attemptTransition({
    complaint: testComplaint,
    toStatus: STATES.ACCEPTED,
    actor: reviewer,
    payload: { reason: 'Verified road issue' }
  });

  console.log(`\n(Advanced complaint legally to: ${testComplaint.status})`);

  // TEST 3: Wrong Department (Waste officer tries to work on Roads complaint)
  console.log('\nTEST 3: Wrong Department Scope (Waste Officer tries to take Roads complaint)');
  const res3 = await attemptTransition({
    complaint: testComplaint,
    toStatus: STATES.IN_PROGRESS,
    actor: wasteOfficer,
    payload: {}
  });

  if (!res3.success && res3.statusCode === 403 && res3.message.includes('does not match complaint department')) {
    console.log('   ✅ REFUSED as expected with status 403:');
    console.log(`      Reason: "${res3.message}"`);
    passedTests++;
  } else {
    console.error('   ❌ FAILED: Expected 403 on mismatched department', res3);
  }

  // Advance complaint legitimately with roadsOfficer to In Progress
  await attemptTransition({
    complaint: testComplaint,
    toStatus: STATES.IN_PROGRESS,
    actor: roadsOfficer
  });

  console.log(`(Roads Officer advanced complaint legally to: ${testComplaint.status})`);

  // TEST 4: Missing Required Reason / Field (Resolve without resolutionNote)
  console.log('\nTEST 4: Missing Required Field (Resolve without resolutionNote)');
  const res4 = await attemptTransition({
    complaint: testComplaint,
    toStatus: STATES.RESOLVED,
    actor: roadsOfficer,
    payload: {} // missing resolutionNote
  });

  if (!res4.success && res4.statusCode === 400 && res4.message.includes("Field 'resolutionNote' is mandatory")) {
    console.log('   ✅ REFUSED as expected with status 400:');
    console.log(`      Reason: "${res4.message}"`);
    passedTests++;
  } else {
    console.error('   ❌ FAILED: Expected 400 on missing resolutionNote', res4);
  }

  // TEST 5: Valid Transition Path (In Progress -> Resolved with resolutionNote)
  console.log('\nTEST 5: Valid Transition (In Progress → Resolved with resolutionNote)');
  const res5 = await attemptTransition({
    complaint: testComplaint,
    toStatus: STATES.RESOLVED,
    actor: roadsOfficer,
    payload: {
      resolutionNote: 'Pothole asphalt laid and steam-rolled at FC road.',
      reason: 'Work completed by PMC road crew'
    }
  });

  if (res5.success && res5.statusCode === 200 && testComplaint.status === STATES.RESOLVED) {
    console.log('   ✅ ACCEPTED as expected:');
    console.log(`      Status: ${testComplaint.status}`);
    console.log(`      Resolution Note: "${testComplaint.resolutionNote}"`);
    console.log(`      Resolved At: ${testComplaint.resolvedAt}`);
    passedTests++;
  } else {
    console.error('   ❌ FAILED: Expected transition success', res5);
  }

  // Verify Audit Log contains all events including REFUSED attempts
  const complaintId = testComplaint._id ? testComplaint._id.toString() : testComplaint.id;
  const auditEvents = await WorkflowEventStore.find({ complaint: complaintId });

  console.log('\n======================================================');
  console.log(`📋 AUDIT LOG VERIFICATION (${auditEvents.length} events logged):`);
  console.log('======================================================');
  const refusedEvents = auditEvents.filter(e => e.outcome === 'refused');
  const acceptedEvents = auditEvents.filter(e => e.outcome === 'accepted');

  auditEvents.forEach((ev, idx) => {
    const outcomeBadge = ev.outcome === 'refused' ? '🚫 REFUSED' : '✅ ACCEPTED';
    console.log(`${idx + 1}. [${outcomeBadge}] Action: "${ev.action}" | ActorRole: ${ev.actorRole}`);
    console.log(`   From: ${ev.fromStatus} → To: ${ev.toStatus || 'N/A'}`);
    if (ev.refusalReason) {
      console.log(`   Refusal Reason: "${ev.refusalReason}"`);
    }
  });

  console.log('\n------------------------------------------------------');
  console.log(`Summary: ${acceptedEvents.length} Accepted Events, ${refusedEvents.length} Refused Events recorded.`);
  console.log(`Test Pass Rate: ${passedTests}/${totalTests}`);
  console.log('------------------------------------------------------\n');

  if (passedTests === totalTests && refusedEvents.length === 4) {
    console.log('🎉 ALL WORKFLOW ENGINE INTEGRITY TESTS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  } else {
    console.error(`⚠️ Some workflow test criteria were not met: passedTests=${passedTests}/${totalTests}, refusedEvents=${refusedEvents.length}/4.`);
    process.exit(1);
  }
}

runWorkflowTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
