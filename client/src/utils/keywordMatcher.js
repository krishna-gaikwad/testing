/**
 * Local keyword dictionary matching English + Marathi (Roman & Devanagari)
 * Examples:
 * khadda / खड्डा / pothole -> roads: Potholes or damaged roads
 * kachra / कचरा / garbage -> waste: Missed garbage collection or Overflowing public dustbins
 * pani / पाणी / water -> water: Contaminated or muddy water supply or Major pipe leaks or bursts
 * gutar / गटार / sewage / drain -> water: Overflowing sewage or blocked storm drains
 * diva / दिवा / streetlight / light -> roads: Broken or flickering streetlights
 */

const KEYWORD_RULES = [
  {
    keywords: ['khadda', 'khadde', 'खड्डा', 'खड्डे', 'pothole', 'potholes', 'crater', 'asphalt', 'road damage'],
    department: 'roads',
    category: 'Potholes or damaged roads',
    confidence: 'high'
  },
  {
    keywords: ['diva', 'dive', 'दिवा', 'दिवे', 'streetlight', 'street light', 'flickering', 'batti', 'बत्ती', 'dark road'],
    department: 'roads',
    category: 'Broken or flickering streetlights',
    confidence: 'high'
  },
  {
    keywords: ['footpath', 'sidewalk', 'पादचारी', 'रस्ता'],
    department: 'roads',
    category: 'Damaged footpaths or sidewalks',
    confidence: 'medium'
  },
  {
    keywords: ['kachra', 'कचरा', 'garbage', 'dustbin', 'trash', 'waste', 'dumper', 'कचराकुंडी'],
    department: 'waste',
    category: 'Overflowing public dustbins',
    confidence: 'high'
  },
  {
    keywords: ['dead animal', 'dead dog', 'जनावर', 'मृत जनावर'],
    department: 'waste',
    category: 'Dead animal removal',
    confidence: 'high'
  },
  {
    keywords: ['toilet', 'shauchalay', 'शौचालय'],
    department: 'waste',
    category: 'Public toilet maintenance',
    confidence: 'high'
  },
  {
    keywords: ['gutar', 'गटार', 'sewage', 'drain', 'storm drain', 'नाला', 'nalah', 'overflowing sewage'],
    department: 'water',
    category: 'Overflowing sewage or blocked storm drains',
    confidence: 'high'
  },
  {
    keywords: ['pipe leak', 'burst', 'पाईप', 'गळती', 'pipe burst', 'water leak'],
    department: 'water',
    category: 'Major pipe leaks or bursts',
    confidence: 'high'
  },
  {
    keywords: ['pani', 'पाणी', 'muddy water', 'contaminated', 'yellow water', 'drinking water', 'गढूळ पाणी'],
    department: 'water',
    category: 'Contaminated or muddy water supply',
    confidence: 'high'
  }
];

/**
 * Evaluates text for category suggestions.
 * Returns suggestion object or null.
 * Note: Only a suggestion; the citizen must confirm before submitting.
 * TODO: In Prompt 8, augment or complement this with backend AI suggestion API.
 */
export function getKeywordSuggestion(text) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();

  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return {
          department: rule.department,
          category: rule.category,
          matchedKeyword: kw,
          confidence: rule.confidence,
          note: "Keyword suggestion (English/Marathi). Accept or change."
        };
      }
    }
  }

  return null;
}
