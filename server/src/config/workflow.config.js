/**
 * Nagar Setu Workflow Engine Configuration
 * SINGLE SOURCE OF TRUTH for states, allowed transitions, deadlines, and escalations.
 */

const isDemo = process.env.DEMO_MODE === 'true';

const STATES = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  ACCEPTED: 'Accepted',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  REJECTED: 'Rejected',
  CLOSED: 'Closed',
  REOPENED: 'Reopened'
};

const TRANSITIONS = [
  {
    from: STATES.SUBMITTED,
    to: STATES.UNDER_REVIEW,
    action: 'Start Review',
    allowedRoles: ['reviewer', 'admin'],
    departmentScoped: false,
    requiresReason: false,
    requiresFields: []
  },
  {
    from: STATES.SUBMITTED,
    to: STATES.ACCEPTED,
    action: 'Accept',
    allowedRoles: ['reviewer', 'admin'],
    departmentScoped: false,
    requiresReason: false,
    requiresFields: []
  },
  {
    from: STATES.SUBMITTED,
    to: STATES.REJECTED,
    action: 'Reject',
    allowedRoles: ['reviewer', 'admin'],
    departmentScoped: false,
    requiresReason: true,
    requiresFields: []
  },
  {
    from: STATES.UNDER_REVIEW,
    to: STATES.ACCEPTED,
    action: 'Accept',
    allowedRoles: ['reviewer', 'admin'],
    departmentScoped: false,
    requiresReason: false, // may correct department/category with a reason
    requiresFields: []
  },
  {
    from: STATES.UNDER_REVIEW,
    to: STATES.REJECTED,
    action: 'Reject',
    allowedRoles: ['reviewer', 'admin'],
    departmentScoped: false,
    requiresReason: true, // reason mandatory
    requiresFields: []
  },
  {
    from: STATES.ACCEPTED,
    to: STATES.ACCEPTED,
    action: 'Self Assign',
    allowedRoles: ['officer'],
    departmentScoped: true,
    requiresReason: false,
    requiresFields: []
  },
  {
    from: STATES.ACCEPTED,
    to: STATES.IN_PROGRESS,
    action: 'Start Work',
    allowedRoles: ['officer'],
    departmentScoped: true, // officer of that department only
    requiresReason: false,
    requiresFields: []
  },
  {
    from: STATES.IN_PROGRESS,
    to: STATES.RESOLVED,
    action: 'Resolve',
    allowedRoles: ['officer'],
    departmentScoped: true, // officer of that department only
    requiresReason: false,
    requiresFields: ['resolutionNote'] // resolution note mandatory, after-repair photo optional
  },
  {
    from: STATES.RESOLVED,
    to: 'Closed',
    action: 'Close',
    allowedRoles: ['supervisor', 'admin'],
    departmentScoped: false,
    requiresReason: false,
    requiresFields: []
  },
  {
    from: STATES.RESOLVED,
    to: STATES.UNDER_REVIEW,
    action: 'Reopen',
    allowedRoles: ['reviewer', 'supervisor', 'admin'],
    departmentScoped: false,
    requiresReason: true,
    requiresFields: []
  }
];

/**
 * Deadlines per department and priority:
 * initialResponseHours and resolutionHours.
 * When DEMO_MODE=true, values are converted to MINUTES for rapid hackathon testing.
 * Label: "demo configuration, not an official SLA"
 */
const BASE_DEADLINES = {
  waste: {
    Normal: { initialResponseHours: 12, resolutionHours: 48 },
    High: { initialResponseHours: 4, resolutionHours: 18 },
    Critical: { initialResponseHours: 1, resolutionHours: 6 }
  },
  roads: {
    Normal: { initialResponseHours: 24, resolutionHours: 72 },
    High: { initialResponseHours: 6, resolutionHours: 24 },
    Critical: { initialResponseHours: 2, resolutionHours: 8 }
  },
  water: {
    Normal: { initialResponseHours: 12, resolutionHours: 36 },
    High: { initialResponseHours: 2, resolutionHours: 12 },
    Critical: { initialResponseHours: 1, resolutionHours: 4 }
  },
  others: {
    Normal: { initialResponseHours: 24, resolutionHours: 72 },
    High: { initialResponseHours: 8, resolutionHours: 24 },
    Critical: { initialResponseHours: 2, resolutionHours: 8 }
  }
};

// Escalation rules:
// Level 1: Initial response overdue notifies reviewers and officers of that department
// Level 2: Resolution overdue notifies supervisors
const ESCALATION_RULES = {
  level1: {
    description: 'Initial response overdue',
    targetRoles: ['reviewer', 'officer'],
    departmentScopedForOfficer: true
  },
  level2: {
    description: 'Resolution overdue',
    targetRoles: ['supervisor'],
    departmentScopedForOfficer: false
  }
};

/**
 * Calculates deadline durations in milliseconds according to DEMO_MODE
 * @param {string} department 
 * @param {string} priority 
 */
function getDeadlineDurations(department = 'others', priority = 'Normal') {
  const dept = BASE_DEADLINES[department] || BASE_DEADLINES.others;
  const config = dept[priority] || dept.Normal;

  if (isDemo) {
    // In demo mode: hours are treated as minutes (hours * 60 * 1000 ms)
    return {
      initialResponseMs: config.initialResponseHours * 60 * 1000,
      resolutionMs: config.resolutionHours * 60 * 1000,
      note: 'demo configuration, not an official SLA (converted to minutes)'
    };
  }

  // Standard mode: hours * 3600 * 1000 ms
  return {
    initialResponseMs: config.initialResponseHours * 3600 * 1000,
    resolutionMs: config.resolutionHours * 3600 * 1000,
    note: 'demo configuration, not an official SLA'
  };
}

module.exports = {
  STATES,
  TRANSITIONS,
  BASE_DEADLINES,
  ESCALATION_RULES,
  getDeadlineDurations,
  isDemo
};
