/**
 * Official Category Configuration for Nagar Setu (Pune)
 * Exposed at GET /api/categories
 * 
 * Any "Others" category REQUIRES a custom title and a description.
 * No other categories should be added.
 */

const CATEGORIES = {
  waste: [
    'Missed garbage collection',
    'Overflowing public dustbins',
    'Dead animal removal',
    'Public toilet maintenance',
    'Others'
  ],
  roads: [
    'Potholes or damaged roads',
    'Broken or flickering streetlights',
    'Damaged footpaths or sidewalks',
    'Others'
  ],
  water: [
    'Contaminated or muddy water supply',
    'Major pipe leaks or bursts',
    'Overflowing sewage or blocked storm drains',
    'Others'
  ],
  others: [
    'Others'
  ]
};

/**
 * Validates if category belongs to the specified department
 */
function isValidCategory(department, category) {
  if (!CATEGORIES[department]) return false;
  return CATEGORIES[department].includes(category);
}

module.exports = {
  CATEGORIES,
  isValidCategory
};
