import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const enPath = path.join(__dirname, '../src/locales/en.json');
const mrPath = path.join(__dirname, '../src/locales/mr.json');
const hiPath = path.join(__dirname, '../src/locales/hi.json');

const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

// Build complete Hindi translations preserving exact key structure
const hi = {
  common: {
    appName: "Nagar Setu",
    cityAuthority: "पुणे नगर निगम (डेमो प्रोटोटाइप)",
    govOfMaharashtra: "नागरिक प्रौद्योगिकी मूल्यांकन",
    portalBadge: "नागरिक शिकायत निवारण मंच (डेमो)",
    demoDisclaimer: "पुणे नगर निगम मूल्यांकन सैंडबॉक्स • स्वचालित कार्यप्रवाह इंजन",
    language: "भाषा",
    selectLanguage: "भाषा चुनें",
    loading: "लोड हो रहा है...",
    submitting: "दर्ज हो रहा है...",
    processing: "प्रक्रिया जारी है...",
    success: "सफल",
    error: "त्रुटि",
    warning: "चेतावनी",
    info: "सूचना",
    cancel: "रद्द करें",
    confirm: "पुष्टि करें",
    save: "सहेजें",
    submit: "जमा करें",
    close: "बंद करें",
    back: "वापस जाएं",
    viewDetails: "विवरण देखें",
    actions: "कार्रवाई",
    search: "खोजें",
    filter: "फ़िल्टर",
    all: "सभी",
    none: "कोई नहीं",
    yes: "हाँ",
    no: "नहीं",
    date: "दिनांक",
    time: "समय",
    days: "दिन",
    hours: "घंटे",
    today: "आज",
    daysLeft: "{{count}} दिन शेष",
    hoursLeft: "{{count}} घंटे शेष",
    overdueBy: "{{count}} दिन का विलंब",
    overdue: "समय-सीमा समाप्त",
    onTrack: "समय पर",
    roles: {
      citizen: "नागरिक",
      reviewer: "समीक्षक",
      officer: "विभाग अधिकारी",
      supervisor: "पर्यवेक्षक"
    },
    outcomes: {
      accepted: "स्वीकृत",
      refused: "अस्वीकृत"
    }
  },
  home: {
    heroBadge: "नागरिक शिकायत निवारण मंच",
    heroTitle: "पारदर्शी और समयबद्ध नागरिक शिकायत निवारण",
    heroDescription: "पुणे शहर के लिए सटीक जीपीएस सत्यापन, निश्चित समय-सीमा, 100 मीटर दोहराव जांच और अपरिवर्तनीय ऑडिट ट्रेल।",
    raiseGrievance: "शिकायत दर्ज करें",
    trackPlaceholder: "ट्रैकिंग आईडी दर्ज करें (उदा. NS-YYYY-...)",
    trackButton: "ट्रैक करें",
    commissionerOffice: "नगर निगम आयुक्त कार्यालय",
    commissionerQuote: "\"नागरिक सेवा में पारदर्शिता और जवाबदेही हमारी सर्वोच्च प्राथमिकता है।\"",
    citizenCharter: "नागरिक अधिकार पत्र समय-सीमा लागू",
    statRegistered: "दर्ज शिकायतें",
    statResolved: "सफलतापूर्वक निस्तारित",
    statResolutionRate: "निस्तारण दर",
    statAvgDays: "औसत समय",
    statDepartments: "सक्रिय विभाग",
    statPuneZones: "पुणे प्रशासनिक क्षेत्र",
    servicesTitle: "नागरिक शिकायत श्रेणियां",
    servicesSubtitle: "पुणे नगर निगम के सभी प्रमुख विभागों में त्वरित समाधान",
    reportIssueAction: "शिकायत दर्ज करें →",
    featuresTitle: "नागर सेतु की प्रमुख विशेषताएं",
    feature1Title: "सटीक जीपीएस सत्यापन",
    feature1Desc: "तस्वीर के मेटाडेटा से सटीक स्थान सत्यापन और 100 मीटर ग्रिड स्नैपिंग के साथ निजता सुरक्षा।",
    feature2Title: "सख्त समय-सीमा और एस्केलेशन",
    feature2Desc: "प्रतिक्रिया (48 घंटे) और समाधान (7 दिन) की स्वचालित निगरानी। विलंब होने पर स्वतः एस्केलेशन।",
    feature3Title: "अपरिवर्तनीय ऑडिट बहीखाता",
    feature3Desc: "SHA-256 क्रिप्टोग्राफिक हैश श्रृंखला द्वारा संरक्षित। कोई भी बदलाव छिपाया नहीं जा सकता।"
  },
  nav: {
    home: "होम",
    fileGrievance: "शिकायत दर्ज करें",
    myComplaints: "मेरी शिकायतें",
    publicMap: "सार्वजनिक मानचित्र",
    officialPortal: "अधिकारी पोर्टल",
    login: "लॉग इन",
    register: "पंजीकरण",
    logout: "लॉग आउट",
    notifications: "सूचनाएं",
    markAllRead: "सभी पढ़ी गईं मार्क करें",
    noNotifications: "कोई नई सूचना नहीं",
    searchPlaceholder: "ट्रैकिंग आईडी से खोजें...",
    allDepartments: "सभी विभाग"
  },
  auth: {
    loginTitle: "पोर्टल में लॉग इन करें",
    loginSubtitle: "अपने पंजीकृत क्रेडेंशियल्स दर्ज करें",
    registerTitle: "नागरिक खाता बनाएं",
    registerSubtitle: "पुणे शहर के नागरिक पोर्टल पर त्वरित पंजीकरण",
    fullName: "पूरा नाम",
    emailAddress: "ईमेल पता",
    password: "पासवर्ड",
    confirmPassword: "पासवर्ड की पुष्टि करें",
    signInButton: "लॉग इन करें",
    registerButton: "खाता बनाएं",
    haveAccount: "पहले से खाता है?",
    noAccount: "खाता नहीं है?",
    demoAccountsTitle: "त्वरित परीक्षण डेमो खाते (एक क्लिक लॉगिन):",
    demoReviewer: "समीक्षक (सुरेश देशमुख)",
    demoSupervisor: "पर्यवेक्षक (डॉ. राजेश गायकवाड़)",
    demoRoads: "सड़क अधिकारी (रोहन पाटिल)",
    demoWaste: "स्वच्छता अधिकारी (अंजलि कुलकर्णी)",
    demoCitizen: "नागरिक (पूजा कदम)"
  },
  report: {
    title: "नागरिक शिकायत दर्ज करें",
    subtitle: "पुणे नगर निगम सीमा के अंतर्गत समस्याओं का त्वरित समाधान",
    tabQuick: "त्वरित फॉर्म",
    tabWizard: "चरणबद्ध सहायता",
    safetyWarning: "सुरक्षा चेतावनी: साक्ष्य एकत्र करने के लिए किसी भी खतरनाक या असुरक्षित स्थान पर न जाएं।",
    deptLabel: "विभाग",
    selectDept: "विभाग चुनें",
    categoryLabel: "श्रेणी",
    selectCategory: "श्रेणी चुनें",
    titleLabel: "शीर्षक",
    titlePlaceholder: "समस्या का संक्षिप्त विवरण (कम से कम 5 अक्षर)",
    descLabel: "विस्तृत विवरण",
    descPlaceholder: "समस्या का सटीक स्थान, गंभीरता और विवरण लिखें...",
    photoLabel: "तस्वीर साक्ष्य (वैकल्पिक)",
    choosePhoto: "फ़ोटो चुनें या यहाँ खींचें",
    photoHint: "मूल तस्वीर चुनें जिसमें जीपीएस मेटाडेटा हो (अधिकतम 15 MB)",
    locationBlockTitle: "स्थान चयन (पुणे नगर निगम क्षेत्र)",
    detectGpsBtn: "तस्वीर से जीपीएस पढ़ें",
    useDeviceBtn: "मेरा वर्तमान स्थान उपयोग करें",
    deviceNote: "नोट: यह आपका वर्तमान स्थान है, जरूरी नहीं कि समस्या यहीं हो।",
    manualAddressLabel: "पता / लैंडमार्क",
    manualAddressPlaceholder: "सड़क, लैंडमार्क, क्षेत्र या पिनकोड...",
    emergencyCheckbox: "संभावित आपातकालीन स्थिति",
    emergencyConcernLabel: "आपातकालीन स्थिति का कारण",
    emergencyConcernPlaceholder: "कृपया बताएं कि तत्काल हस्तक्षेप क्यों आवश्यक है...",
    submitBtn: "शिकायत दर्ज करें",
    submittingBtn: "दर्ज किया जा रहा है...",
    gpsFound: "तस्वीर से जीपीएस प्राप्त हुआ!",
    gpsNotFound: "तस्वीर में जीपीएस मेटाडेटा नहीं मिला। कृपया मानचित्र पर स्थान चुनें या पता लिखें।",
    outsidePune: "चयनित स्थान पुणे नगर निगम सीमा के बाहर है। केवल पुणे शहर की शिकायतें स्वीकार की जाती हैं।"
  },
  wizard: {
    step1Title: "समस्या का प्रकार",
    step1Subtitle: "आप किस प्रकार की समस्या की रिपोर्ट करना चाहते हैं?",
    step2Title: "स्थान",
    step2Subtitle: "समस्या कहाँ स्थित है?",
    step3Title: "विवरण",
    step3Subtitle: "समस्या के बारे में अधिक जानकारी दें",
    step4Title: "साक्ष्य",
    step4Subtitle: "तस्वीर या वीडियो संलग्न करें",
    step5Title: "समीक्षा और पुष्टि",
    step5Subtitle: "प्रस्तुत करने से पहले सभी विवरण जांचें",
    nextBtn: "आगे बढ़ें →",
    backBtn: "← वापस",
    confirmSubmitBtn: "पुष्टि करें और शिकायत दर्ज करें",
    aiSuggestionTitle: "सुझाव — स्वीकार करें या बदलें",
    aiSuggestionAccept: "सुझाव स्वीकार करें",
    aiSuggestionDecline: "मेरी पसंद बनाए रखें"
  },
  map: {
    title: "पुणे सार्वजनिक समस्या मानचित्र",
    subtitle: "पुणे शहर भर में दर्ज सभी नागरिक समस्याओं की सार्वजनिक स्थिति",
    filterDept: "विभाग द्वारा फ़िल्टर",
    filterStatus: "स्थिति द्वारा फ़िल्टर",
    filterPriority: "प्राथमिकता द्वारा फ़िल्टर",
    privacyNotice: "नागरिक निजता सूचना: नागरिकों की सुरक्षा के लिए स्थान निर्देशांक ~100 मीटर ग्रिड पर स्नैप किए गए हैं और व्यक्तिगत विवरण छिपाए गए हैं।",
    activeIssues: "सक्रिय समस्याएं",
    verifiedCritical: "पुष्ट आपातकाल",
    highSupport: "सामुदायिक समर्थन",
    supportButton: "समर्थन करें (+1)",
    supported: "समर्थित ✓",
    viewTimeline: "समय-रेखा देखें"
  },
  community: {
    supportCount: "{{count}} नागरिकों ने समर्थन किया",
    supportAction: "इस समस्या का समर्थन करें",
    supportSuccess: "समर्थन दर्ज किया गया! जब 5+ नागरिक समर्थन करते हैं, तो प्राथमिकता स्वतः बढ़ जाती है।",
    duplicateFoundNotice: "आपके क्षेत्र में मिलती-जुलती समस्या पहले से दर्ज है। क्या आप इसका समर्थन करना चाहेंगे?",
    linkAsDuplicate: "मौजूदा समस्या से जोड़ें",
    submitAnyway: "नई शिकायत के रूप में दर्ज करें"
  },
  complaint: {
    grievanceDetails: "शिकायत विवरण",
    trackingId: "ट्रैकिंग आईडी",
    submittedOn: "दर्ज करने की तारीख",
    currentStatus: "वर्तमान स्थिति",
    department: "विभाग",
    category: "श्रेणी",
    priority: "प्राथमिकता",
    deadlinesTitle: "एसएलए समय-सीमा",
    responseDeadline: "प्रतिक्रिया समय-सीमा",
    resolutionDeadline: "समाधान समय-सीमा",
    assignedTo: "नियुक्त अधिकारी",
    unassigned: "अभी नियुक्त नहीं",
    emergencyFlagged: "आपातकालीन स्थिति चिन्हित",
    emergencyVerified: "सत्यापित आपातकाल (उच्च प्राथमिकता)",
    timelineTitle: "कार्यप्रवाह एवं ऑडिट इतिहास",
    evidenceTitle: "संलग्न साक्ष्य",
    ratingTitle: "समाधान संतुष्टि रेटिंग",
    ratingPrompt: "कृपया इस शिकायत के समाधान से अपनी संतुष्टि रेटिंग दें:",
    ratingSubmitted: "रेटिंग दर्ज करने के लिए धन्यवाद!",
    reopenTitle: "शिकायत पुनः खोलने का अनुरोध",
    reopenDesc: "यदि समस्या का समाधान संतोषजनक नहीं है, तो आप समाधान के 7 दिनों के भीतर पुनः खोलने का अनुरोध कर सकते हैं।",
    reopenReasonLabel: "पुनः खोलने का कारण",
    reopenReasonPlaceholder: "कृपया विस्तार से बताएं कि समस्या का पूर्ण समाधान क्यों नहीं हुआ...",
    requestReopenBtn: "पुनः खोलने का अनुरोध करें",
    reopenExpired: "समाधान को 7 दिन से अधिक हो चुके हैं। पुनः खोलने की अवधि समाप्त हो चुकी है।"
  },
  status: {
    Submitted: "दर्ज की गई",
    "Under Review": "समीक्षाधीन",
    Accepted: "स्वीकृत",
    "In Progress": "प्रगति पर",
    Resolved: "निस्तारित",
    Closed: "बंद",
    Rejected: "अस्वीकृत"
  },
  priority: {
    Low: "कम",
    Medium: "मध्यम",
    High: "उच्च",
    Critical: "गंभीर"
  },
  department: {
    waste: "ठोस अपशिष्ट प्रबंधन",
    roads: "सड़क एवं आधारभूत संरचना",
    water: "जल आपूर्ति एवं जल निकासी",
    others: "सामान्य नागरिक सेवाएं"
  },
  category: {
    waste: {
      "Garbage Dump": "कचरा डंप",
      "Overflowing Bin": "अतिप्रवाहित कचरा पेटी",
      "Dead Animal": "मृत पशु",
      "Street Cleaning": "सड़क सफाई",
      Others: "अन्य स्वच्छता समस्याएं"
    },
    roads: {
      Pothole: "सड़क का गड्ढा",
      "Damaged Footpath": "क्षतिग्रस्त फुटपाथ",
      "Broken Streetlight": "खराब स्ट्रीट लाइट",
      "Water Logging": "जलभराव",
      Others: "अन्य सड़क समस्याएं"
    },
    water: {
      "Pipe Leakage": "पाइप लीकेज",
      "No Water Supply": "जल आपूर्ति ठप",
      "Contaminated Water": "दूषित पेयजल",
      "Open Manhole": "खुला मैनहोल",
      Others: "अन्य जल समस्याएं"
    },
    others: {
      "Illegal Encroachment": "अवैध अतिक्रमण",
      "Noise Complaint": "ध्वनि प्रदूषण",
      "Stray Cattle": "आवारा मवेशी",
      Others: "अन्य नागरिक समस्याएं"
    }
  },
  official: {
    dashboardTitle: "अधिकारी कार्यप्रवाह कंसोल",
    dashboardSubtitle: "पुणे नगर निगम शिकायत प्रसंस्करण एवं स्थिति संक्रमण",
    reviewerQueue: "समीक्षक कतार (नई प्रस्तुतियां)",
    officerQueue: "विभाग कार्य कतार",
    supervisorQueue: "पर्यवेक्षक एवं लेखापरीक्षा कंसोल",
    acceptAction: "शिकायत स्वीकार करें",
    rejectAction: "शिकायत अस्वीकार करें",
    assignAction: "कर्मचारी नियुक्त करें",
    startWorkAction: "कार्य प्रारंभ करें (प्रगति पर)",
    resolveAction: "शिकायत निस्तारित करें",
    correctionReasonLabel: "विभाग/श्रेणी सुधार का कारण",
    rejectionReasonLabel: "अस्वीकृति का अनिवार्य कारण",
    resolutionNoteLabel: "समाधान विवरण टिप्पणी",
    afterRepairPhoto: "मरम्मत उपरांत फ़ोटो (वैकल्पिक)",
    aiAssistanceTitle: "एआई सुझाव (केवल संदर्भ हेतु)",
    aiDisclaimer: "यह केवल एक सुझाव है, कोई आधिकारिक निर्णय नहीं। केवल प्राधिकृत कर्मचारी ही स्थिति बदल सकते हैं।",
    workerHeartbeat: "निगरानी कार्यकर्ता अंतिम निष्पादन:",
    unlinkReportBtn: "रिपोर्ट अलग करें (अलग समस्या बनाएं)"
  },
  supervisor: {
    title: "पर्यवेक्षक एवं ऑडिट डैशबोर्ड",
    subtitle: "निगरानी, एसएलए नियंत्रण और अपरिवर्तनीय कार्यप्रवाह ऑडिट",
    auditFilterOutcome: "परिणाम फ़िल्टर",
    allOutcomes: "सभी परिणाम",
    acceptedOnly: "केवल स्वीकृत घटनाएं",
    refusedOnly: "केवल अस्वीकृत प्रयास",
    overdueQueue: "विलंबित एवं एस्केलेटेड शिकायतें",
    reassignAction: "विभाग पुनर्नियुक्त करें",
    escalationDetails: "एस्केलेशन नीति: 5+ समर्थक स्वतः उच्च प्राथमिकता में बदलते हैं। समय-सीमा उल्लंघन पर स्वतः विलंब दर्ज होता है।"
  },
  errors: {
    requiredField: "यह फ़ील्ड अनिवार्य है",
    invalidEmail: "कृपया एक वैध ईमेल पता दर्ज करें",
    passwordTooShort: "पासवर्ड कम से कम 8 अक्षर का होना चाहिए",
    serverError: "सर्वर से संपर्क करने में त्रुटि। कृपया पुनः प्रयास करें।",
    outsidePune: "चयनित स्थान पुणे नगर निगम सीमा के बाहर है।",
    fileTooLarge: "फ़ाइल का आकार 15 MB से कम होना चाहिए।",
    invalidFileType: "केवल जेपीजी, पीएनजी या वेबपी फ़ाइलें ही स्वीकार की जाती हैं।"
  },
  notifications: {
    title: "अधिसूचनाएं",
    STATUS_CHANGED: "शिकायत [{{trackingId}}] की स्थिति बदलकर {{status}} कर दी गई है।",
    STATUS_UPDATED: "शिकायत [{{trackingId}}] में नया अपडेट: {{action}}।",
    ASSIGNED: "शिकायत [{{trackingId}}] आपको आवंटित की गई है।",
    PRIORITY_CHANGED: "शिकायत [{{trackingId}}] की प्राथमिकता बदलकर {{priority}} कर दी गई है।",
    EMERGENCY_VERIFIED: "शिकायत [{{trackingId}}] का आपातकालीन ध्वज सत्यापित हुआ।",
    REOPEN_REQUESTED: "नागरिक ने शिकायत [{{trackingId}}] को पुनः खोलने का अनुरोध किया है।",
    REOPEN_DECIDED: "शिकायत [{{trackingId}}] के पुनः खोलने का अनुरोध {{decision}} हुआ।"
  },
  footer: {
    authority: "पुणे नगर निगम (PMC)",
    address: "पीएमसी मुख्य भवन, शिवाजीनगर, पुणे, महाराष्ट्र 411005",
    helplineTitle: "पीएमसी नागरिक हेल्पलाइन",
    tollFree: "टोल-फ्री हेल्पलाइन: 112 (डेमो हेल्पलाइन)",
    emergency112: "राष्ट्रीय आपातकाल: 112",
    quickLinks: "त्वरित लिंक",
    privacyPolicy: "गोपनीयता नीति",
    termsOfUse: "उपयोग की शर्तें",
    copyright: "© 2026 नगर सेतु नागरिक प्रौद्योगिकी प्रोटोटाइप (पुणे डेमो)।",
    disclaimer: "पुणे नगर निगम शिकायत निवारण हेतु नागरिक प्रौद्योगिकी मूल्यांकन सैंडबॉक्स।"
  }
};

fs.writeFileSync(hiPath, JSON.stringify(hi, null, 2), 'utf8');
console.log('✅ client/src/locales/hi.json generated successfully!');
