const mongoose = require('mongoose');
const { ComplaintStore, WorkflowEventStore, SupportStore, UserStore, memoryStore } = require('../services/memoryStore');
const { calculateDeadlines } = require('../services/deadlineService');

// 10 realistic sample complaints within Pune localities
const sampleComplaints = [
  // 1. Shivajinagar - Roads - In Progress (High Priority)
  {
    trackingId: 'NS-2026-101001',
    title: 'Monsoon pothole cluster on FC Road near Goodluck Chowk',
    description: 'Dangerous deep potholes formed after heavy monsoon shower on Fergusson College Road causing serious two-wheeler skid hazards (demo data).',
    department: 'roads',
    category: 'Potholes or damaged roads',
    area: 'Shivajinagar',
    status: 'In Progress',
    priority: 'High',
    supportCount: 6,
    isPossibleEmergency: false,
    isCriticalVerified: false,
    location: {
      lat: 18.5284,
      lng: 73.8436,
      address: 'Near Goodluck Chowk, FC Road, Shivajinagar, Pune',
      source: 'map'
    }
  },
  // 2. Kothrud - Waste - Under Review (Normal Priority, exactly 4 supporters -> ready for 5th live demo support!)
  {
    trackingId: 'NS-2026-101002',
    title: 'Overflowing public dustbin on Karve Road',
    description: 'Community garbage container overflowing onto pedestrian sidewalk. Stray animals scattering plastic bags (demo data).',
    department: 'waste',
    category: 'Overflowing public dustbins',
    area: 'Kothrud',
    status: 'Under Review',
    priority: 'Normal',
    supportCount: 4, // 4 supporters! 5th supporter pushes it to High!
    isPossibleEmergency: false,
    isCriticalVerified: false,
    location: {
      lat: 18.5074,
      lng: 73.8077,
      address: 'Karve Road near Kothrud Stand, Pune',
      source: 'device'
    }
  },
  // 3. Hadapsar - Water - Accepted (Possible Emergency unverified)
  {
    trackingId: 'NS-2026-101003',
    title: 'Major water pipeline burst on Magarpatta Road',
    description: 'Pressurized municipal water supply line burst causing high volume street flooding and loss of drinking water supply to local housing societies (demo data).',
    department: 'water',
    category: 'Major pipe leaks or bursts',
    area: 'Hadapsar',
    status: 'Accepted',
    priority: 'High',
    supportCount: 3,
    isPossibleEmergency: true,
    isCriticalVerified: false,
    emergencyConcern: 'High pressure water gushing onto moving traffic near highway junction.',
    location: {
      lat: 18.5089,
      lng: 73.9260,
      address: 'Magarpatta Road Junction, Hadapsar, Pune',
      source: 'exif'
    }
  },
  // 4. Swargate - Roads - In Progress (Critical Verified Emergency)
  {
    trackingId: 'NS-2026-101004',
    title: 'Snapped streetlight with exposed live wire',
    description: 'Lamppost damaged with live wires dangling into waterlogged pedestrian path near state transport bus terminus. Immediate electrocution risk (demo data).',
    department: 'roads',
    category: 'Broken or flickering streetlights',
    area: 'Swargate',
    status: 'In Progress',
    priority: 'Critical',
    supportCount: 8,
    isPossibleEmergency: true,
    isCriticalVerified: true,
    emergencyConcern: 'Exposed 230V live cable submerged in roadside puddle.',
    location: {
      lat: 18.5018,
      lng: 73.8636,
      address: 'Swargate Bus Depot Chowk, Pune',
      source: 'device'
    }
  },
  // 5. Kasba Peth - Water - Resolved (within 7 days for reopening demo)
  {
    trackingId: 'NS-2026-101005',
    title: 'Clogged storm drain during pre-monsoon shower',
    description: 'Monsoon stormwater drain blocked by silt and plastic waste causing street backflow near historic wada (demo data).',
    department: 'water',
    category: 'Overflowing sewage or blocked storm drains',
    area: 'Kasba Peth',
    status: 'Resolved',
    priority: 'Normal',
    supportCount: 2,
    isPossibleEmergency: false,
    isCriticalVerified: false,
    resolutionNote: 'PMC drainage maintenance unit deployed high-pressure suction machine and cleared debris blockage.',
    resolvedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago (eligible for 7-day reopening!)
    location: {
      lat: 18.5195,
      lng: 73.8553,
      address: 'Kasba Ganpati Chowk, Kasba Peth, Pune',
      source: 'map'
    }
  },
  // 6. Viman Nagar - Roads - Submitted
  {
    trackingId: 'NS-2026-101006',
    title: 'Water-logged road with damaged footpaths',
    description: 'Broken concrete pavers and uneven sidewalk slabs outside commercial complex causing elderly citizens to stumble (demo data).',
    department: 'roads',
    category: 'Damaged footpaths or sidewalks',
    area: 'Viman Nagar',
    status: 'Submitted',
    priority: 'Normal',
    supportCount: 1,
    isPossibleEmergency: false,
    isCriticalVerified: false,
    location: {
      lat: 18.5679,
      lng: 73.9143,
      address: 'Viman Nagar Main Road, Pune',
      source: 'manual'
    }
  },
  // 7. Katraj - Water - Under Review (Overdue Escalation Level 1)
  {
    trackingId: 'NS-2026-101007',
    title: 'Contaminated muddy tap water supply in residential ward',
    description: 'Brown muddy tap water being received across apartment societies in Katraj area. Smells like drainage contamination (demo data).',
    department: 'water',
    category: 'Contaminated or muddy water supply',
    area: 'Katraj',
    status: 'Under Review',
    priority: 'High',
    supportCount: 5,
    isPossibleEmergency: false,
    isCriticalVerified: false,
    isOverdue: true,
    escalationLevel: 1, // Overdue SLA Level 1!
    initialResponseDue: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours overdue
    location: {
      lat: 18.4575,
      lng: 73.8677,
      address: 'Katraj Chowk, Pune',
      source: 'device'
    }
  },
  // 8. Baner - Waste - Submitted
  {
    trackingId: 'NS-2026-101008',
    title: 'Missed door-to-door garbage collection in Balewadi High Street sector',
    description: 'Sanitation van has not arrived for 3 days in residential layout. Unsegregated garbage accumulating on street corners (demo data).',
    department: 'waste',
    category: 'Missed garbage collection',
    area: 'Baner',
    status: 'Submitted',
    priority: 'Normal',
    supportCount: 1,
    isPossibleEmergency: false,
    isCriticalVerified: false,
    location: {
      lat: 18.5590,
      lng: 73.7868,
      address: 'Baner-Balewadi Link Road, Pune',
      source: 'map'
    }
  },
  // 9. Aundh - Others - In Progress
  {
    trackingId: 'NS-2026-101009',
    title: 'Abandoned construction debris obstructing storm water channel',
    description: 'Large mound of gravel and building waste dumped illegally along storm drainage channel (demo data).',
    department: 'others',
    category: 'Others',
    area: 'Aundh',
    status: 'In Progress',
    priority: 'Normal',
    supportCount: 2,
    isPossibleEmergency: false,
    isCriticalVerified: false,
    location: {
      lat: 18.5580,
      lng: 73.8075,
      address: 'ITI Road, Aundh, Pune',
      source: 'manual'
    }
  },
  // 10. Wakad - Roads - Rejected
  {
    trackingId: 'NS-2026-101010',
    title: 'Flickering private society internal compound light',
    description: 'Light flickering inside private gated society driveway (demo data).',
    department: 'roads',
    category: 'Broken or flickering streetlights',
    area: 'Wakad',
    status: 'Rejected',
    priority: 'Normal',
    supportCount: 1,
    isPossibleEmergency: false,
    isCriticalVerified: false,
    location: {
      lat: 18.5975,
      lng: 73.7600,
      address: 'Datta Mandir Road, Wakad, Pune',
      source: 'map'
    }
  }
];

// Sample refused attempts to showcase audit log integrity
const sampleRefusedEvents = [
  {
    complaintTracking: 'NS-2026-101001',
    actorRole: 'officer',
    action: 'Change Department',
    outcome: 'refused',
    fromStatus: 'In Progress',
    toStatus: 'In Progress',
    reason: 'Roads officer tried re-allocating complaint to water department without supervisor authorization.',
    refusalReason: 'Department re-allocation requires supervisor override or reviewer reassignment.'
  },
  {
    complaintTracking: 'OUT_OF_BOUNDS_DEMO',
    actorRole: 'citizen',
    action: 'Submit Complaint',
    outcome: 'refused',
    fromStatus: 'None',
    toStatus: 'Submitted',
    reason: 'Citizen attempted dropping pin at [19.0760, 72.8777] (Mumbai).',
    refusalReason: 'This location is outside the Pune service area. Please correct the pin.'
  },
  {
    complaintTracking: 'NS-2026-101002',
    actorRole: 'officer',
    action: 'Direct Status Jump',
    outcome: 'refused',
    fromStatus: 'Under Review',
    toStatus: 'Resolved',
    reason: 'Officer attempted marking Under Review complaint directly as Resolved.',
    refusalReason: 'Invalid state transition: Under Review -> Resolved is not an allowed workflow transition.'
  },
  {
    complaintTracking: 'NS-2026-101005',
    actorRole: 'citizen',
    action: 'Request Reopening',
    outcome: 'refused',
    fromStatus: 'Resolved',
    toStatus: 'Resolved',
    reason: 'Citizen reopening request submitted after 7-day window on legacy complaint.',
    refusalReason: 'Reopening request window expired. Reopening requests must be submitted within 7 days of resolution.'
  }
];

async function seedComplaints() {
  try {
    const isMongo = mongoose.connection.readyState === 1;
    const users = isMongo
      ? await require('../models/User').find({ role: 'citizen' })
      : memoryStore.users.filter((u) => u.role === 'citizen');

    const defaultCitizenId = users[0]?._id?.toString() || 'citizen_demo_id';

    for (const sc of sampleComplaints) {
      const deadlines = calculateDeadlines(sc.department, sc.priority);
      const complaintData = {
        ...sc,
        citizen: defaultCitizenId,
        reopenCount: 0,
        initialResponseDue: sc.initialResponseDue || deadlines.initialResponseDue,
        resolutionDue: sc.resolutionDue || deadlines.resolutionDue,
        isOverdue: Boolean(sc.isOverdue),
        escalationLevel: sc.escalationLevel || 0,
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 86400000 * 3)),
        updatedAt: new Date()
      };

      let createdId = null;
      if (isMongo) {
        const Complaint = require('../models/Complaint');
        const c = await Complaint.findOneAndUpdate(
          { trackingId: sc.trackingId },
          { $set: complaintData },
          { upsert: true, new: true }
        );
        createdId = c._id.toString();
      } else {
        const existing = memoryStore.complaints.find((c) => c.trackingId === sc.trackingId);
        if (!existing) {
          const created = await ComplaintStore.create(complaintData);
          createdId = created._id || created.id;
        } else {
          createdId = existing._id || existing.id;
          Object.assign(existing, complaintData);
        }
      }

      // Check if workflow history already exists for this complaint to avoid duplicates
      const existingEvents = memoryStore.workflowEvents.filter(
        (e) => e.complaint === createdId && e.outcome === 'accepted'
      );

      if (existingEvents.length === 0) {
        // Step 1: Initial submission
        await WorkflowEventStore.create({
          complaint: createdId,
          actor: defaultCitizenId,
          actorRole: 'citizen',
          action: 'Complaint Submitted',
          outcome: 'accepted',
          fromStatus: 'None',
          toStatus: 'Submitted',
          reason: 'Seeded Pune demo complaint'
        });

        // Step 2..N: Sequential workflow progression so latest toStatus strictly matches current status
        if (sc.status === 'Under Review') {
          await WorkflowEventStore.create({
            complaint: createdId,
            actor: 'reviewer_demo_id',
            actorRole: 'reviewer',
            action: 'Start Review',
            outcome: 'accepted',
            fromStatus: 'Submitted',
            toStatus: 'Under Review',
            reason: 'Reviewer commenced jurisdictional verification'
          });
        } else if (sc.status === 'Accepted') {
          await WorkflowEventStore.create({
            complaint: createdId,
            actor: 'reviewer_demo_id',
            actorRole: 'reviewer',
            action: 'Start Review',
            outcome: 'accepted',
            fromStatus: 'Submitted',
            toStatus: 'Under Review',
            reason: 'Reviewer commenced jurisdictional verification'
          });
          await WorkflowEventStore.create({
            complaint: createdId,
            actor: 'reviewer_demo_id',
            actorRole: 'reviewer',
            action: 'Accept Complaint',
            outcome: 'accepted',
            fromStatus: 'Under Review',
            toStatus: 'Accepted',
            reason: 'Verified within Pune municipal bounds'
          });
        } else if (sc.status === 'In Progress') {
          await WorkflowEventStore.create({
            complaint: createdId,
            actor: 'reviewer_demo_id',
            actorRole: 'reviewer',
            action: 'Start Review',
            outcome: 'accepted',
            fromStatus: 'Submitted',
            toStatus: 'Under Review',
            reason: 'Reviewer commenced jurisdictional verification'
          });
          await WorkflowEventStore.create({
            complaint: createdId,
            actor: 'reviewer_demo_id',
            actorRole: 'reviewer',
            action: 'Accept Complaint',
            outcome: 'accepted',
            fromStatus: 'Under Review',
            toStatus: 'Accepted',
            reason: 'Verified within Pune municipal bounds'
          });
          await WorkflowEventStore.create({
            complaint: createdId,
            actor: 'officer_demo_id',
            actorRole: 'officer',
            action: 'Start Work',
            outcome: 'accepted',
            fromStatus: 'Accepted',
            toStatus: 'In Progress',
            reason: 'Field maintenance team deployed on-site'
          });
        } else if (sc.status === 'Resolved') {
          await WorkflowEventStore.create({
            complaint: createdId,
            actor: 'reviewer_demo_id',
            actorRole: 'reviewer',
            action: 'Start Review',
            outcome: 'accepted',
            fromStatus: 'Submitted',
            toStatus: 'Under Review',
            reason: 'Reviewer commenced jurisdictional verification'
          });
          await WorkflowEventStore.create({
            complaint: createdId,
            actor: 'reviewer_demo_id',
            actorRole: 'reviewer',
            action: 'Accept Complaint',
            outcome: 'accepted',
            fromStatus: 'Under Review',
            toStatus: 'Accepted',
            reason: 'Verified within Pune municipal bounds'
          });
          await WorkflowEventStore.create({
            complaint: createdId,
            actor: 'officer_demo_id',
            actorRole: 'officer',
            action: 'Start Work',
            outcome: 'accepted',
            fromStatus: 'Accepted',
            toStatus: 'In Progress',
            reason: 'Field maintenance team deployed on-site'
          });
          await WorkflowEventStore.create({
            complaint: createdId,
            actor: 'officer_demo_id',
            actorRole: 'officer',
            action: 'Resolve',
            outcome: 'accepted',
            fromStatus: 'In Progress',
            toStatus: 'Resolved',
            reason: sc.resolutionNote || 'Issue resolved per PMC maintenance standards'
          });
        } else if (sc.status === 'Rejected') {
          await WorkflowEventStore.create({
            complaint: createdId,
            actor: 'reviewer_demo_id',
            actorRole: 'reviewer',
            action: 'Start Review',
            outcome: 'accepted',
            fromStatus: 'Submitted',
            toStatus: 'Under Review',
            reason: 'Reviewer commenced jurisdictional verification'
          });
          await WorkflowEventStore.create({
            complaint: createdId,
            actor: 'reviewer_demo_id',
            actorRole: 'reviewer',
            action: 'Reject Complaint',
            outcome: 'accepted',
            fromStatus: 'Under Review',
            toStatus: 'Rejected',
            reason: 'Rejected per jurisdictional policy: private society compound'
          });
        }
      }
    }

    // Seed refused audit events to demonstrate transparency
    for (const ev of sampleRefusedEvents) {
      const existing = memoryStore.workflowEvents.find(
        (e) => e.refusalReason === ev.refusalReason && e.action === ev.action
      );
      if (!existing) {
        await WorkflowEventStore.create({
          complaint: ev.complaintTracking,
          actor: defaultCitizenId,
          actorRole: ev.actorRole,
          action: ev.action,
          outcome: 'refused',
          fromStatus: ev.fromStatus,
          toStatus: ev.toStatus,
          reason: ev.reason,
          refusalReason: ev.refusalReason,
          createdAt: new Date(Date.now() - 3600000)
        });
      }
    }

    console.log('✅ 10 realistic Pune demo complaints and refused audit events seeded successfully!');
  } catch (err) {
    console.warn('Complaint seeding note:', err.message);
  }
}

module.exports = { seedComplaints, sampleComplaints, sampleRefusedEvents };
