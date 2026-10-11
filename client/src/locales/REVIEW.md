# Marathi Translations Review (मराठी भाषांतर पुनरावलोकन)

This document lists terms and phrases in `client/src/locales/mr.json` that a native Marathi speaker or municipal domain expert should review for tone, municipal terminology accuracy, and readability.

| Area / Key | Current Marathi Text | English Reference | Reviewer Note / Suggestion |
|---|---|---|---|
| `common.roles.reviewer` | छाननी अधिकारी | Reviewer | Alternative: 'तपासणी अधिकारी' or 'प्रथम छाननी अधिकारी' |
| `common.roles.supervisor` | मुख्य पर्यवेक्षक | Supervisor | Standard municipal designation in Maharashtra state administration |
| `common.outcomes.refused` | नाकारले | Refused | Workflow engine refused action. Alternative: 'अमान्य केले' |
| `report.sourceExif` | फोटो जीपीएस | Photo GPS | Retained 'जीपीएस' as commonly understood technical term |
| `report.category.roads.Potholes or damaged roads` | खड्डे किंवा खराब रस्ते | Potholes or damaged roads | Colloquially 'खड्डे' is universally recognized by citizens |
| `report.category.water.Overflowing sewage or blocked storm drains` | तुंबलेली गटारे किंवा सांडपाणी वाहिनी | Overflowing sewage or blocked storm drains | 'गटारे / सांडपाणी वाहिनी' is the standard PMC civic term |
| `complaint.aiPanelTitle` | कृत्रिम बुद्धिमत्ता सहाय्य व सूचना | AI Assistance & Triage Insights | 'कृत्रिम बुद्धिमत्ता' is official Marathi term for AI |
| `errors.INVALID_TRANSITION` | स्थिती बदलता येत नाही: {{from}} वरून {{to}}. पुढील वैध स्थिती: {{allowed}}. | Cannot move from {{from}} to {{to}} | Explains state transition failure clearly to the user |
| `errors.REOPEN_WINDOW_EXPIRED` | निवारणानंतर तक्रार पुन्हा उघडण्याची ७ दिवसांची मुदत संपली आहे. | The 7-day reopening window has expired | Polite, formal civic timeline message |
| `official.labels.resolutionNote` | निवारण कामाची नोंद | Resolution Summary Note | Used when department officer logs repair completion |
