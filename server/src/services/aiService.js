/**
 * AI Service for Nagar Setu
 * 
 * HARD ARCHITECTURAL LIMITS ENFORCED IN CODE:
 * - This service ONLY READS complaint text and RETURNS suggestions.
 * - It contains NO functions, database mutations, or imports that can change:
 *   status, assignedTo, priority, or deadlines.
 * - All suggestions are returned as text for human review.
 * - Human officials and the backend workflow engine are the ONLY authorities
 *   that execute transitions.
 */

const { CATEGORIES } = require('../config/categories');

// Multilingual keywords for rule-based fallback
const KEYWORD_RULES = [
  // Specific Solid Waste
  {
    department: 'waste',
    category: 'Overflowing public dustbins',
    regex: /\b(dustbin|dustbins|bin|garbage|trash|kachra|waste|overflowing|smell|stink|कचरा|डस्टबिन|दुर्गंधी)\b/i,
    urgencyRegex: /\b(stray dogs|disease|flies|maggots|school)\b/i
  },
  {
    department: 'waste',
    category: 'Missed garbage collection',
    regex: /\b(missed garbage|ghantagadi|van|truck|uncollected|segregation|घंटागाडी|कचरा गोळा)\b/i,
    urgencyRegex: /\b(days|week|accumulated)\b/i
  },
  {
    department: 'waste',
    category: 'Dead animal removal',
    regex: /\b(dead animal|carcass|dead dog|dead cat|animal body|मृत प्राणी)\b/i,
    urgencyRegex: /\b(decay|smell|disease|infection)\b/i
  },
  {
    department: 'waste',
    category: 'Public toilet maintenance',
    regex: /\b(toilet|shauchalaya|urinal|washroom|flush|शौचालय)\b/i,
    urgencyRegex: /\b(health hazard|unhygienic|choked)\b/i
  },
  // Specific Water Supply & Drainage
  {
    department: 'water',
    category: 'Major pipe leaks or bursts',
    regex: /\b(pipe burst|pipeline|pipe leak|water leak|gushing water|flooding|pani गळती|पाईप|पाणी गळती)\b/i,
    urgencyRegex: /\b(gushing|flood|submerged|drinking water loss)\b/i
  },
  {
    department: 'water',
    category: 'Contaminated or muddy water supply',
    regex: /\b(dirty water|muddy water|smelly water|tap water|contaminated|yellow water|दूषित पाणी)\b/i,
    urgencyRegex: /\b(illness|cholera|stomach|children drinking)\b/i
  },
  {
    department: 'water',
    category: 'Overflowing sewage or blocked storm drains',
    regex: /\b(sewage|drain|gutter|gutar|blocked drain|choked manhole|chamber|गटार|सांडपाणी|ड्रेनेज)\b/i,
    urgencyRegex: /\b(backflow|entering houses|mosquitoes|foul)\b/i
  },
  // Roads & Streetlights
  {
    department: 'roads',
    category: 'Potholes or damaged roads',
    regex: /\b(pothole|potholes|khadda|khadde|damaged road|bad road|broken road|crater|asphalt damage|खड्डा|खड्डे|खराब रस्ता)\b/i,
    urgencyRegex: /\b(accident|skid|dangerous|injury|traffic|peak)\b/i
  },
  {
    department: 'roads',
    category: 'Broken or flickering streetlights',
    regex: /\b(streetlight|street light|light pole|lamp post|flickering light|dark street|pole wire|diva|diwa|दिवा)\b/i,
    urgencyRegex: /\b(live wire|shock|darkness|night|theft)\b/i
  },
  {
    department: 'roads',
    category: 'Damaged footpaths or sidewalks',
    regex: /\b(footpath|sidewalk|pavement|paver block|curb|pedestrian path|फुटपाथ)\b/i,
    urgencyRegex: /\b(senior citizen|wheelchair|fall|broken concrete)\b/i
  }
];

/**
 * Rule-based fallback classifier with best-match scoring
 */
function ruleBasedClassify(text) {
  const content = (text || '').toLowerCase();

  let bestRule = null;
  let maxScore = 0;

  for (const rule of KEYWORD_RULES) {
    const match = content.match(rule.regex);
    if (match) {
      const score = match[0].length;
      if (score > maxScore) {
        maxScore = score;
        bestRule = rule;
      }
    }
  }

  if (bestRule) {
    const hasUrgency = bestRule.urgencyRegex && bestRule.urgencyRegex.test(content);
    return {
      department: bestRule.department,
      category: bestRule.category,
      urgencyCue: hasUrgency ? 'High urgency cues detected in description' : 'Standard priority cues',
      matched: true
    };
  }

  return {
    department: 'others',
    category: 'Others',
    urgencyCue: 'General civic request',
    matched: false
  };
}

/**
 * Citizen Suggestion Generator
 * Suggests department, category, and summary without modifying original text
 */
async function generateCitizenSuggestion(description, language = 'en') {
  const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY;
  const isMarathi = language === 'mr';

  // If AI API Key is present, attempt LLM call
  if (apiKey) {
    try {
      const prompt = `You are a municipal grievance classifier for Pune Municipal Corporation.
Analyze this civic issue description: "${description}"
Classify into ONE department (waste, roads, water, others) and select the most accurate category from:
- waste: Missed garbage collection, Overflowing public dustbins, Dead animal removal, Public toilet maintenance, Others
- roads: Potholes or damaged roads, Broken or flickering streetlights, Damaged footpaths or sidewalks, Others
- water: Contaminated or muddy water supply, Major pipe leaks or bursts, Overflowing sewage or blocked storm drains, Others
- others: Others

${isMarathi ? 'Write the "shortSummary" in Marathi.' : 'Write the "shortSummary" in English.'}
Return ONLY valid JSON:
{"department": "...", "category": "...", "shortSummary": "..."}`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (jsonText) {
          const parsed = JSON.parse(jsonText);
          return {
            suggestedDepartment: parsed.department || 'others',
            suggestedCategory: parsed.category || 'Others',
            shortSummary: parsed.shortSummary || description.slice(0, 100),
            isAiGenerated: true
          };
        }
      }
    } catch (err) {
      console.warn('Gemini API call failed, using rule-based fallback:', err.message);
    }
  }

  // Graceful rule-based fallback
  const classified = ruleBasedClassify(description);
  const cleanSummary = description.trim().length > 90 
    ? `${description.trim().slice(0, 87)}...` 
    : description.trim();

  return {
    suggestedDepartment: classified.department,
    suggestedCategory: classified.category,
    shortSummary: cleanSummary || (isMarathi ? 'नोंदवलेली नागरी समस्या' : 'Reported municipal issue'),
    isAiGenerated: false
  };
}

/**
 * Official Triage Analyzer
 * Generates structured key details and a draft response for official review
 */
async function generateOfficialAnalysis(complaint, language = 'en') {
  const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY;
  const description = complaint.description || complaint.title || '';
  const area = complaint.area || 'Pune';
  const isMarathi = language === 'mr';

  // If AI API Key is present, attempt LLM call
  if (apiKey) {
    try {
      const prompt = `You are a municipal assistant for Pune Municipal Corporation officials.
Analyze this complaint:
Title: "${complaint.title}"
Description: "${description}"
Area: "${area}"
Department: "${complaint.department}"

${isMarathi ? 'Provide the "keyDetails" values and "draftResponse" in Marathi.' : 'Provide the "keyDetails" values and "draftResponse" in English.'}
Return ONLY valid JSON in this exact structure:
{
  "suggestedDepartment": "...",
  "suggestedCategory": "...",
  "keyDetails": {
    "location": "${area}",
    "issue": "brief description of core defect",
    "urgencyCues": "safety hazards or risk factors",
    "affectedPeople": "residents, commuters, pedestrians etc."
  },
  "draftResponse": "polite official resolution or progress draft for PMC officer"
}`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (jsonText) {
          const parsed = JSON.parse(jsonText);
          return {
            ...parsed,
            isAiGenerated: true,
            disclaimer: isMarathi
              ? 'AI सूचना, अधिकृत निर्णय नाही. केवळ कार्यप्रणाली आणि अधिकृत अधिकारी स्थिती किंवा मुदत बदलू शकतात.'
              : 'AI suggestion, not a decision. Only the workflow and authorized staff change status, assignment or deadline.'
          };
        }
      }
    } catch (err) {
      console.warn('Gemini triage analysis failed, using rule-based fallback:', err.message);
    }
  }

  // Rule-based fallback
  const classified = ruleBasedClassify(description);
  const draftResponse = isMarathi
    ? `पुणे महानगरपालिका ${complaint.department || 'नागरी'} विभागाने ${area} येथील समस्येची पाहणी केली आहे. मानक कार्यप्रणालीनुसार (SLA) दुरुस्तीचे काम नियोजित करण्यात आले आहे.`
    : `PMC ${complaint.department?.toUpperCase() || 'Municipal'} Team has inspected the reported defect in ${area}. Necessary field maintenance work has been scheduled under the standard workflow SLA.`;

  return {
    suggestedDepartment: classified.department,
    suggestedCategory: classified.category,
    keyDetails: {
      location: area,
      issue: complaint.title || classified.category,
      urgencyCues: complaint.isPossibleEmergency
        ? (isMarathi ? 'नागरिकाने संभाव्य आणीबाणी नोंदवली आहे' : 'Citizen flagged possible emergency')
        : (isMarathi ? 'मानक प्राधान्य' : classified.urgencyCue),
      affectedPeople: isMarathi ? 'परिसरातील स्थानिक नागरिक व प्रवासी' : 'Local residents and daily commuters in the vicinity'
    },
    draftResponse,
    isAiGenerated: false,
    disclaimer: isMarathi
      ? 'AI सूचना, अधिकृत निर्णय नाही. केवळ कार्यप्रणाली आणि अधिकृत अधिकारी स्थिती किंवा मुदत बदलू शकतात.'
      : 'AI suggestion, not a decision. Only the workflow and authorized staff change status, assignment or deadline.'
  };
}

module.exports = {
  generateCitizenSuggestion,
  generateOfficialAnalysis,
  ruleBasedClassify
};
