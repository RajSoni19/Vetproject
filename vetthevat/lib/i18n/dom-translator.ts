"use client";

// High-performance client-side DOM translator for multi-language support (Gujarati, Hindi, Spanish, Arabic)
import type { Locale } from "@/lib/i18n/catalog";

const originalTextMap = new WeakMap<Node, string>();
// The text this translator last wrote into each node. A node whose text differs from it was
// changed by the app (React), so that new text is the new original, never reverted.
const writtenTextMap = new WeakMap<Node, string>();
// Writes only real changes: writing identical text would still notify the observer and loop.
function writeText(node: Text, value: string) {
  writtenTextMap.set(node, value);
  if (node.nodeValue !== value) node.nodeValue = value;
}

const hindiDictionary: Record<string, string> = {
  // Public Marketing & Header/Footer
  "Home": "मुख्य पृष्ठ",
  "Product": "उत्पाद",
  "Benefits": "लाभ",
  "Features": "विशेषताएँ",
  "How it works": "यह कैसे काम करता है",
  "Pricing": "मूल्य",
  "FAQs": "अक्सर पूछे जाने वाले प्रश्न",
  "FAQ": "अक्सर पूछे जाने वाले प्रश्न",
  "Contact": "संपर्क",
  "Support": "सहायता",
  "Mobile app": "मोबाइल ऐप",
  "Mobile App": "मोबाइल ऐप",
  "Sign in": "साइन इन करें",
  "Sign In": "साइन इन करें",
  "Sign out": "साइन आउट करें",
  "Sign Out": "साइन आउट करें",
  "Get Started": "शुरू करें",
  "Download App": "ऐप डाउनलोड करें",
  "Download app": "ऐप डाउनलोड करें",
  "Explore the Product": "उत्पाद देखें",
  "UK-focused invoice capture, VAT review and export workflows": "यूके-केंद्रित चालान कैप्चर, VAT समीक्षा और निर्यात वर्कफ़्लो",
  "Invoice data, simplified": "चालान डेटा, सरल और सुव्यवस्थित",
  "Less paperwork. Smarter VAT management.": "कम कागजी काम। स्मार्ट VAT प्रबंधन।",
  "Capture invoices, extract individual line items, organise net amounts and VAT, and validate supplier VAT registration details through one simple workflow.": "चालान कैप्चर करें, अलग-अलग लाइन आइटम निकालें, शुद्ध राशि और VAT व्यवस्थित करें, और एक सरल वर्कफ़्लो से आपूर्तिकर्ता विवरण सत्यापित करें।",
  "Built to simplify invoice processing for UK and EU business workflows.": "यूके और ईयू व्यापार वर्कफ़्लो के लिए चालान प्रसंस्करण को सरल बनाने के लिए निर्मित।",
  "Built around practical UK invoice review needs: supplier VAT numbers, net amounts, VAT amounts, gross totals and reporting periods.": "व्यावहारिक यूके चालान समीक्षा आवश्यकताओं के अनुसार निर्मित: आपूर्तिकर्ता VAT नंबर, शुद्ध राशि, VAT राशि, सकल योग और रिपोर्टिंग अवधि।",
  "Smart invoice capture": "स्मार्ट चालान कैप्चर",
  "Individual item extraction": "अलग-अलग आइटम निकालना",
  "Supplier VAT validation": "आपूर्तिकर्ता VAT सत्यापन",
  "Reporting and export": "रिपोर्टिंग और निर्यात",
  "Reduce repetitive manual data entry.": "बार-बार होने वाली मैन्युअल डेटा प्रविष्टि को कम करें।",
  "Extract supplier, invoice and individual item information.": "आपूर्तिकर्ता, चालान और व्यक्तिगत आइटम की जानकारी निकालें।",
  "Separate net amounts, VAT and gross totals.": "शुद्ध राशि, VAT और कुल राशि को अलग करें।",
  "Review supplier VAT registration information.": "आपूर्तिकर्ता VAT पंजीकरण जानकारी की समीक्षा करें।",
  "Compile records by month, quarter or year.": "महीने, तिमाही या वर्ष के अनुसार रिकॉर्ड संकलित करें।",
  "Download and share reports in practical formats.": "व्यावहारिक प्रारूपों में रिपोर्ट डाउनलोड और साझा करें।",
  "Capture": "कैप्चर",
  "Extract": "निकालें",
  "Validate and review": "सत्यापित और समीक्षा करें",
  "Export": "निर्यात करें",

  // Home Page (/ and marketing)
  "The problem we solve": "वह समस्या जिसे हम हल करते हैं",
  "Stop spending hours entering invoice data manually.": "चालान डेटा मैन्युअल रूप से दर्ज करने में घंटों बिताना बंद करें।",
  "Managing invoices can involve repetitive data entry, inconsistent formats, missing information and time-consuming VAT checks. Vet the VAT is designed to simplify that process.": "चालान प्रबंधित करने में बार-बार डेटा प्रविष्टि, असंगत प्रारूप, गायब जानकारी और समय लेने वाली VAT जांच शामिल हो सकती है। Vet the VAT उस प्रक्रिया को सरल बनाने के लिए डिज़ाइन किया गया है।",
  "Interactive UK VAT workspace": "इंटरैक्टिव यूके VAT कार्यक्षेत्र",
  "INTERACTIVE UK VAT WORKSPACE": "इंटरैक्टिव यूके VAT कार्यक्षेत्र",
  "Try the numbers, then follow the review steps.": "संख्याओं को आज़माएं, फिर समीक्षा चरणों का पालन करें।",
  "A simple preview of how Vet the VAT turns invoice details into a clearer UK VAT review workflow. This calculator is informational and does not replace accounting advice.": "Vet the VAT चालान विवरण को एक स्पष्ट यूके VAT समीक्षा वर्कफ़्लो में कैसे बदलता है, इसका एक सरल पूर्वावलोकन। यह कैलकुलेटर सूचनात्मक है और लेखांकन सलाह की जगह नहीं लेता है।",
  "VAT calculator": "VAT कैलकुलेटर",
  "Estimate VAT from a net invoice amount.": "शुद्ध चालान राशि से VAT का अनुमान लगाएं।",
  "Net amount": "शुद्ध राशि",
  "VAT rate": "VAT दर",
  "20% standard": "20% मानक",
  "5% reduced": "5% घटाया हुआ",
  "0% zero rated": "0% शून्य दर",
  "Product overview": "उत्पाद अवलोकन",
  "Everything you need to process invoice data in one place.": "चालान डेटा को संसाधित करने के लिए आपकी ज़रूरत की हर चीज़ एक ही स्थान पर।",
  "UK-based company": "यूके-आधारित कंपनी",
  "Clear invoice data for UK businesses and their advisers.": "यूके के व्यवसायों और उनके सलाहकारों के लिए स्पष्ट चालान डेटा।",
  "Vet the VAT is positioned for UK business workflows where invoice accuracy, VAT review, supporting documents and period-based reporting all matter.": "Vet the VAT यूके व्यावसायिक वर्कफ़्लो के लिए स्थित है जहाँ चालान सटीकता, VAT समीक्षा, सहायक दस्तावेज़ और अवधि-आधारित रिपोर्टिंग सभी मायने रखते हैं।",
  "Who it is for": "यह किसके लिए है",
  "Built for the people who handle invoices every week.": "उन लोगों के लिए निर्मित जो हर सप्ताह चालान संभालते हैं।",
  "Make invoice processing simpler with Vet the VAT.": "Vet the VAT के साथ चालान प्रसंस्करण को सरल बनाएं।",
  "Spend less time entering invoice details and more time understanding your business finances.": "चालान विवरण दर्ज करने में कम समय और अपने व्यावसायिक वित्त को समझने में अधिक समय व्यतीत करें।",
  "Explore mobile app": "मोबाइल ऐप देखें",
  "View Pricing": "मूल्य देखें",
  "See How It Works": "देखें यह कैसे काम करता है",
  "Scan or upload invoices": "चालान स्कैन या अपलोड करें",
  "Organise invoice data": "चालान डेटा व्यवस्थित करें",
  "Download reports": "रिपोर्ट डाउनलोड करें",
  "Small businesses, accountants and bookkeepers": "छोटे व्यवसाय, एकाउंटेंट और बुककीपर",
  "Small and medium-sized businesses": "लघु और मध्यम आकार के व्यवसाय",
  "Finance teams": "वित्त टीमें",

  // How it works
  "WORKFLOW": "वर्कफ़्लो",
  "Workflow": "वर्कफ़्लो",
  "Capture, extract, validate and export.": "कैप्चर करें, निकालें, सत्यापित करें और निर्यात करें।",
  "A four-step workflow for turning invoice documents into structured records that can be reviewed, corrected and prepared for reporting.": "चालान दस्तावेज़ों को संरचित रिकॉर्ड में बदलने के लिए चार-चरणीय वर्कफ़्लो, जिनकी समीक्षा, सुधार और रिपोर्टिंग के लिए तैयारी की जा सकती है।",
  "Step 1 - Capture": "चरण 1 - कैप्चर",
  "Upload, scan or photograph an invoice.": "चालान अपलोड करें, स्कैन करें या फ़ोटो लें।",
  "Step 2 - Extract": "चरण 2 - निकालें",
  "Extract and organise supplier, item and financial information.": "आपूर्तिकर्ता, वस्तु और वित्तीय जानकारी निकालें और व्यवस्थित करें।",
  "Step 3 - Validate": "चरण 3 - सत्यापित करें",
  "Review extracted values and check supplier VAT information.": "निकाले गए मूल्यों की समीक्षा करें और आपूर्तिकर्ता VAT जानकारी जांचें।",
  "Step 4 - Export": "चरण 4 - निर्यात करें",
  "Download or share structured invoice records and reports.": "संरचित चालान रिकॉर्ड और रिपोर्ट डाउनलोड या साझा करें।",
  "Review remains essential.": "समीक्षा हमेशा आवश्यक है।",
  "Users remain responsible for reviewing extracted information, resolving exceptions and ensuring that accounting and VAT records are accurate before relying on them.": "निकाली गई जानकारी की समीक्षा करने, अपवादों को हल करने और उन पर भरोसा करने से पहले लेखांकन और VAT रिकॉर्ड सटीक हैं यह सुनिश्चित करने के लिए उपयोगकर्ता ज़िम्मेदार हैं।",

  // Service Status
  "Web service availability": "वेब सेवा उपलब्धता",
  "Web accounts": "वेब खाते",
  "Invoices and VAT": "चालान और VAT",
  "Available for local development": "स्थानीय विकास के लिए उपलब्ध",
  "Manual workflows available for local development": "स्थानीय विकास के लिए मैन्युअल वर्कफ़्लो उपलब्ध",
  "Not configured": "कॉन्फ़िगर नहीं किया गया",
  "Separate service": "अलग सेवा",
  "Email handoff only": "केवल ईमेल अग्रेषण",
  "Billing and payments": "बिलिंग और भुगतान",
  "Online enquiries": "ऑनलाइन पूछताछ",
  "Mobile applications": "मोबाइल एप्लिकेशन",

  // Workspace & Navigation
  "Workspace": "कार्यक्षेत्र",
  "Insights": "इनसाइट्स",
  "Organisation": "संगठन",
  "Purchasing": "खरीद",
  "Stock": "स्टॉक / इन्वेंटरी",
  "Sales": "बिक्री",
  "Dashboard": "डैशबोर्ड",
  "Invoices": "चालान",
  "Upload & OCR": "अपलोड और OCR",
  "Create Invoice": "चालान बनाएँ",
  "OCR Review": "OCR समीक्षा",
  "Documents": "दस्तावेज़",
  "Customers": "ग्राहक",
  "Suppliers": "आपूर्तिकर्ता",
  "Analytics": "विश्लेषण",
  "Reports": "रिपोर्ट",
  "Bank Reconciliation": "बैंक मिलान",
  "POS Invoice": "POS चालान",
  "Companies": "कंपनियाँ",
  "Team": "टीम",
  "Audit Log": "ऑडिट लॉग",
  "Settings": "सेटिंग्स",
  "Lead Enquiries": "लीड पूछताछ",
  "Subscription": "सदस्यता",
  "Administration": "प्रशासन",
  "All Orders": "सभी ऑर्डर",
  "Create Order": "ऑर्डर बनाएँ",
  "Purchase Orders": "खरीद ऑर्डर",
  "Supplier Invoices": "आपूर्तिकर्ता चालान",
  "Product Catalogue": "उत्पाद कैटलॉग",
  "Inventory": "इन्वेंटरी",
  "Goods Receipts": "माल प्राप्ति",
  "Sales Orders": "बिक्री ऑर्डर",
  "Marketplace": "मार्केटप्लेस",
  "VAT Management": "VAT प्रबंधन",
  "ORS Mode": "ORS मोड",
  "Search invoices, suppliers, orders...": "चालान, आपूर्तिकर्ता, ऑर्डर खोजें...",
  "Manual entry": "मैन्युअल प्रविष्टि",
  "Upload Supplier Invoice": "आपूर्तिकर्ता चालान अपलोड करें"
};

const gujaratiDictionary: Record<string, string> = {
  // Public Marketing & Header/Footer
  "Home": "મુખ્ય પૃષ્ઠ",
  "Product": "ઉત્પાદન",
  "Benefits": "લાભો",
  "Features": "વિશેષતાઓ",
  "How it works": "તે કેવી રીતે કાર્ય કરે છે",
  "Pricing": "કિંમત",
  "FAQs": "વારંવાર પૂછાતા પ્રશ્નો",
  "FAQ": "વારંવાર પૂછાતા પ્રશ્નો",
  "Contact": "સંપર્ક",
  "Support": "સહાય",
  "Mobile app": "મોબાઇલ એપ",
  "Mobile App": "મોબાઇલ એપ",
  "Sign in": "સાઇન ઇન",
  "Sign In": "સાઇન ઇન",
  "Sign out": "સાઇન આઉટ",
  "Sign Out": "સાઇન આઉટ",
  "Get Started": "શરૂ કરો",
  "Download App": "એપ ડાઉનલોડ કરો",
  "Download app": "એપ ડાઉનલોડ કરો",
  "Explore the Product": "ઉત્પાદન જુઓ",
  "UK-focused invoice capture, VAT review and export workflows": "યુકે-કેન્દ્રિત ઇન્વૉઇસ કેપ્ચર, VAT સમીક્ષા અને નિકાસ વર્કફ્લો",
  "Invoice data, simplified": "ઇન્વૉઇસ ડેટા, સરળ અને વ્યવસ્થિત",
  "Less paperwork. Smarter VAT management.": "ઓછું કાગળકામ. સ્માર્ટ VAT મેનેજમેન્ટ.",
  "Capture invoices, extract individual line items, organise net amounts and VAT, and validate supplier VAT registration details through one simple workflow.": "ઇન્વૉઇસ કેપ્ચર કરો, અલગ-અલગ લાઇન આઇટમ્સ મેળવો, ચોખ્ખી રકમ અને VAT ગોઠવો, અને એક સરળ વર્કફ્લો દ્વારા સપ્લાયર વિગતો ચકાસો.",
  "Built to simplify invoice processing for UK and EU business workflows.": "યુકે અને ઇયુ બિઝનેસ વર્કફ્લો માટે ઇન્વૉઇસ પ્રોસેસિંગ સરળ બનાવવા માટે બનાવેલ છે.",
  "Smart invoice capture": "સ્માર્ટ ઇન્વૉઇસ કેપ્ચર",
  "Individual item extraction": "વ્યક્તિગત આઇટમ એક્સટ્રેક્શન",
  "Supplier VAT validation": "સપ્લાયર VAT માન્યતા",
  "Reporting and export": "રિપોર્ટિંગ અને નિકાસ",
  "Reduce repetitive manual data entry.": "વારંવાર થતી મેન્યુઅલ ડેટા એન્ટ્રી ઘટાડો.",
  "Extract supplier, invoice and individual item information.": "સપ્લાયર, ઇન્વૉઇસ અને વ્યક્તિગત આઇટમની માહિતી મેળવો.",
  "Separate net amounts, VAT and gross totals.": "ચોખ્ખી રકમ, VAT અને કુલ રકમ અલગ કરો.",
  "Review supplier VAT registration information.": "સપ્લાયર VAT નોંધણી માહિતીની સમીક્ષા કરો.",
  "Compile records by month, quarter or year.": "મહિના, ક્વાર્ટર અથવા વર્ષ પ્રમાણે રેકોર્ડ્સ કમ્પાઇલ કરો.",
  "Download and share reports in practical formats.": "વ્યવહારુ ફોર્મેટ્સમાં રિપોર્ટ્સ ડાઉનલોડ અને શેર કરો.",

  // Home Page (/ and marketing)
  "The problem we solve": "અમે જે સમસ્યા હલ કરીએ છીએ",
  "Stop spending hours entering invoice data manually.": "મેન્યુઅલી ઇન્વૉઇસ ડેટા દાખલ કરવામાં કલાકો વિતાવવાનું બંધ કરો.",
  "Managing invoices can involve repetitive data entry, inconsistent formats, missing information and time-consuming VAT checks. Vet the VAT is designed to simplify that process.": "ઇન્વૉઇસનું સંચાલન કરવામાં વારંવાર ડેટા એન્ટ્રી, અસંગત ફોર્મેટ્સ, ગુમ થયેલી માહિતી અને સમય માંગી લેતી VAT તપાસ શામેલ હોઈ શકે છે. Vet the VAT એ પ્રક્રિયાને સરળ બનાવવા માટે રચાયેલ છે.",
  "Interactive UK VAT workspace": "ઇન્ટરેક્ટિવ યુકે VAT વર્કસ્પેસ",
  "INTERACTIVE UK VAT WORKSPACE": "ઇન્ટરેક્ટિવ યુકે VAT વર્કસ્પેસ",
  "Try the numbers, then follow the review steps.": "સંખ્યાઓ અજમાવી જુઓ, પછી સમીક્ષાના પગલાં અનુસરો.",
  "A simple preview of how Vet the VAT turns invoice details into a clearer UK VAT review workflow. This calculator is informational and does not replace accounting advice.": "Vet the VAT કેવી રીતે ઇન્વૉઇસ વિગતોને સ્પષ્ટ યુકે VAT સમીક્ષા વર્કફ્લોમાં ફેરવે છે તેનું એક સરળ પૂર્વાવલોકન. આ કેલ્ક્યુલેટર માહિતીપ્રદ છે અને એકાઉન્ટિંગ સલાહનું સ્થાન લેતું નથી.",
  "VAT calculator": "VAT કેલ્ક્યુલેટર",
  "Estimate VAT from a net invoice amount.": "ચોખ્ખી ઇન્વૉઇસ રકમ પરથી VAT નો અંદાજ લગાવો.",
  "Net amount": "ચોખ્ખી રકમ",
  "VAT rate": "VAT દર",
  "20% standard": "20% પ્રમાણભૂત",
  "5% reduced": "5% ઘટાડેલ",
  "0% zero rated": "0% શૂન્ય રેટ કરેલ",
  "Product overview": "ઉત્પાદન વિહંગાવલોકન",
  "Everything you need to process invoice data in one place.": "ઇન્વૉઇસ ડેટા પર પ્રક્રિયા કરવા માટે તમને જોઈતી દરેક વસ્તુ એક જ જગ્યાએ.",
  "UK-based company": "યુકે-સ્થિત કંપની",
  "Clear invoice data for UK businesses and their advisers.": "યુકે વ્યવસાયો અને તેમના સલાહકારો માટે સ્પષ્ટ ઇન્વૉઇસ ડેટા.",
  "Vet the VAT is positioned for UK business workflows where invoice accuracy, VAT review, supporting documents and period-based reporting all matter.": "Vet the VAT યુકે બિઝનેસ વર્કફ્લો માટે સ્થાન ધરાવે છે જ્યાં ઇન્વૉઇસ સચોટતા, VAT સમીક્ષા, સહાયક દસ્તાવેજો અને સમયગાળા આધારિત રિપોર્ટિંગ બધું મહત્વપૂર્ણ છે.",
  "Who it is for": "આ કોના માટે છે",
  "Built for the people who handle invoices every week.": "દર અઠવાડિયે ઇન્વૉઇસનું સંચાલન કરતા લોકો માટે બનાવેલ છે.",
  "Make invoice processing simpler with Vet the VAT.": "Vet the VAT સાથે ઇન્વૉઇસ પ્રોસેસિંગ સરળ બનાવો.",
  "Spend less time entering invoice details and more time understanding your business finances.": "ઇન્વૉઇસ વિગતો દાખલ કરવામાં ઓછો સમય અને તમારા વ્યવસાયના નાણાં સમજવામાં વધુ સમય વિતાવો.",
  "Explore mobile app": "મોબાઇલ એપ જુઓ",
  "View Pricing": "કિંમત જુઓ",
  "See How It Works": "તે કેવી રીતે કાર્ય કરે છે તે જુઓ",
  "Scan or upload invoices": "ઇન્વૉઇસ સ્કેન કરો અથવા અપલોડ કરો",
  "Organise invoice data": "ઇન્વૉઇસ ડેટા ગોઠવો",
  "Download reports": "અહેવાલો ડાઉનલોડ કરો",
  "Small businesses, accountants and bookkeepers": "નાના વ્યવસાયો, એકાઉન્ટન્ટ્સ અને બુકકીપર્સ",
  "Small and medium-sized businesses": "નાના અને મધ્યમ કદના વ્યવસાયો",
  "Finance teams": "નાણાકીય ટીમો",

  // How it works (/how-it-works)
  "WORKFLOW": "વર્કફ્લો",
  "Workflow": "વર્કફ્લો",
  "Capture, extract, validate and export.": "કેપ્ચર કરો, મેળવો, માન્ય કરો અને નિકાસ કરો.",
  "A four-step workflow for turning invoice documents into structured records that can be reviewed, corrected and prepared for reporting.": "ઇન્વૉઇસ દસ્તાવેજોને સંરચિત રેકોર્ડ્સમાં ફેરવવા માટે ચાર-પગલાંનો વર્કફ્લો, જેની સમીક્ષા, સુધારો અને રિપોર્ટિંગ માટે તૈયારી કરી શકાય છે.",
  "Step 1 - Capture": "પગલું 1 - કેપ્ચર",
  "Upload, scan or photograph an invoice.": "ઇન્વૉઇસ અપલોડ કરો, સ્કેન કરો અથવા ફોટો પાડો.",
  "Step 2 - Extract": "પગલું 2 - એક્સટ્રેક્ટ",
  "Extract and organise supplier, item and financial information.": "પુરવઠાકર્તા, વસ્તુ અને નાણાકીય માહિતી મેળવો અને ગોઠવો.",
  "Step 3 - Validate": "પગલું 3 - માન્ય કરો",
  "Review extracted values and check supplier VAT information.": "મેળવેલ મૂલ્યોની સમીક્ષા કરો અને પુરવઠાકર્તાની VAT માહિતી તપાસો.",
  "Step 4 - Export": "પગલું 4 - નિકાસ કરો",
  "Download or share structured invoice records and reports.": "સંરચિત ઇન્વૉઇસ રેકોર્ડ્સ અને રિપોર્ટ્સ ડાઉનલોડ અથવા શેર કરો.",
  "Review remains essential.": "સમીક્ષા હંમેશા મહત્વપૂર્ણ રહે છે.",
  "Users remain responsible for reviewing extracted information, resolving exceptions and ensuring that accounting and VAT records are accurate before relying on them.": "મેળવેલી માહિતીની સમીક્ષા કરવા, ભૂલો સુધારવા અને તેના પર આધાર રાખતા પહેલાં એકાઉન્ટિંગ અને VAT રેકોર્ડ્સ સચોટ છે તેની ખાતરી કરવા માટે વપરાશકર્તાઓ જવાબદાર રહે છે.",

  // Features (/features)
  "Core features for invoice data and VAT workflows.": "ઇન્વૉઇસ ડેટા અને VAT વર્કફ્લો માટે મુખ્ય વિશેષતાઓ.",
  "A focused feature set for capturing invoice information, validating supplier VAT details where supported, and exporting organised records.": "ઇન્વૉઇસ માહિતી મેળવવા, સમર્થિત હોય ત્યાં સપ્લાયર VAT વિગતો માન્ય કરવા અને વ્યવસ્થિત રેકોર્ડ્સ નિકાસ કરવા માટે કેન્દ્રિત સુવિધાઓ.",
  "Easy data extraction": "સરળ ડેટા એક્સટ્રેક્શન",
  "Reduce manual entry by extracting invoice information into structured records.": "ઇન્વૉઇસ માહિતીને સંરચિત રેકોર્ડ્સમાં ફેરવીને મેન્યુઅલ એન્ટ્રી ઘટાડો.",
  "Company and supplier records": "કંપની અને સપ્લાયર રેકોર્ડ્સ",
  "Organise captured invoice data around the appropriate company and supplier.": "મેળવેલા ઇન્વૉઇસ ડેટાને સંબંધિત કંપની અને સપ્લાયર આસપાસ ગોઠવો.",
  "VAT validation": "VAT માન્યતા",
  "Review supplier VAT registration details through supported validation services.": "સમર્થિત માન્યતા સેવાઓ દ્વારા સપ્લાયર VAT નોંધણી વિગતોની સમીક્ષા કરો.",
  "Email sharing": "ઇમેઇલ શેરિંગ",
  "Send processed invoices or records to designated email addresses, where supported.": "પ્રક્રિયા કરેલા ઇન્વૉઇસ અથવા રેકોર્ડ્સ નિયુક્ત ઇમેઇલ સરનામાં પર મોકલો.",
  "Excel and PDF exports": "એક્સેલ અને PDF નિકાસ",
  "Download supported formats for reporting and further processing.": "રિપોર્ટિંગ અને વધુ પ્રક્રિયા માટે સમર્થિત ફોર્મેટ્સ ડાઉનલોડ કરો.",
  "Period-based reporting": "સમયગાળા આધારિત રિપોર્ટિંગ",
  "Compile records for monthly, quarterly and annual reporting periods.": "માસિક, ત્રિમાસિક અને વાર્ષિક રિપોર્ટિંગ સમયગાળા માટે રેકોર્ડ્સ તૈયાર કરો.",
  "Security and data protection": "સુરક્ષા અને ડેટા સંરક્ષણ",

  // Benefits (/benefits)
  "For accountants and bookkeepers": "એકાઉન્ટન્ટ્સ અને બુકકીપર્સ માટે",
  "Simplify client invoice processing.": "ક્લાયંટ ઇન્વૉઇસ પ્રક્રિયા સરળ બનાવો.",
  "For business owners": "બિઝનેસ માલિકો માટે",
  "Keep invoice records organised without unnecessary administration.": "બિનજરૂરી વહીવટ વિના ઇન્વૉઇસ રેકોર્ડ્સ વ્યવસ્થિત રાખો.",
  "For finance teams": "ફાઇનાન્સ ટીમો માટે",
  "Improve consistency and visibility across financial records.": "નાણાકીય રેકોર્ડ્સમાં સુસંગતતા અને દૃશ્યતામાં સુધારો કરો.",

  // Service Status
  "Web service availability": "વેબ સેવા ઉપલબ્ધતા",
  "Web accounts": "વેબ ખાતાઓ",
  "Invoices and VAT": "ઇન્વૉઇસ અને VAT",
  "Available for local development": "સ્થાનિક વિકાસ માટે ઉપલબ્ધ",
  "Manual workflows available for local development": "સ્થાનિક વિકાસ માટે મેન્યુઅલ વર્કફ્લો ઉપલબ્ધ",
  "Not configured": "ગોઠવેલ નથી",
  "Separate service": "અલગ સેવા",
  "Email handoff only": "માત્ર ઇમેઇલ ફોરવર્ડિંગ",
  "Billing and payments": "બિલિંગ અને ચુકવણીઓ",
  "Online enquiries": "ઓનલાઇન પૂછપરછ",
  "Mobile applications": "મોબાઇલ એપ્લિકેશન્સ",

  // Workspace & Navigation
  "Workspace": "કાર્યસ્થળ",
  "Insights": "અંતર્દૃષ્ટિ",
  "Organisation": "સંસ્થા",
  "Purchasing": "ખરીદી",
  "Stock": "સ્ટોક / ઇન્વેન્ટરી",
  "Sales": "વેચાણ",
  "Dashboard": "ડેશબોર્ડ",
  "Invoices": "ઇન્વૉઇસ",
  "Upload & OCR": "અપલોડ અને OCR",
  "Create Invoice": "ઇન્વૉઇસ બનાવો",
  "OCR Review": "OCR સમીક્ષા",
  "Documents": "દસ્તાવેજો",
  "Customers": "ગ્રાહકો",
  "Suppliers": "પુરવઠાકર્તાઓ",
  "Analytics": "વિશ્લેષણ",
  "Reports": "અહેવાલો",
  "Bank Reconciliation": "બેંક મેળવણી",
  "POS Invoice": "POS ઇન્વૉઇસ",
  "Companies": "કંપનીઓ",
  "Team": "ટીમ",
  "Audit Log": "ઓડિટ લોગ",
  "Settings": "સેટિંગ્સ",
  "Lead Enquiries": "લીડ પૂછપરછ",
  "Subscription": "સબ્સ્ક્રિપ્શન",
  "Administration": "વહીવટ",
  "All Orders": "બધા ઓર્ડર્સ",
  "Create Order": "ઓર્ડર બનાવો",
  "Purchase Orders": "ખરીદ ઓર્ડર",
  "Supplier Invoices": "સપ્લાયર ઇન્વૉઇસ",
  "Product Catalogue": "ઉત્પાદન સૂચિ",
  "Inventory": "ઇન્વેન્ટરી",
  "Goods Receipts": "માલની રસીદો",
  "Sales Orders": "વેચાણ ઓર્ડર",
  "Marketplace": "માર્કેટપ્લેસ",
  "VAT Management": "VAT વ્યવસ્થાપન",
  "ORS Mode": "ORS મોડ",
  "Total invoices": "કુલ ઇન્વૉઇસ",
  "Pending review": "સમીક્ષા બાકી",
  "Reviewed": "સમીક્ષિત",
  "Confirmed": "પુષ્ટિ થયેલ",
  "Draft": "ડ્રાફ્ટ",
  "Manual entry": "મેન્યુઅલ એન્ટ્રી",
  "Upload Supplier Invoice": "સપ્લાયર ઇન્વૉઇસ અપલોડ કરો"
};

const spanishDictionary: Record<string, string> = {
  "Home": "Inicio",
  "Product": "Producto",
  "Benefits": "Beneficios",
  "Features": "Características",
  "How it works": "Cómo funciona",
  "Pricing": "Precios",
  "FAQs": "Preguntas frecuentes",
  "Contact": "Contacto",
  "Support": "Soporte",
  "Sign in": "Iniciar sesión",
  "Sign In": "Iniciar sesión",
  "Sign out": "Cerrar sesión",
  "Get Started": "Comenzar",
  "Dashboard": "Panel de control",
  "Invoices": "Facturas",
  "Suppliers": "Proveedores",
  "Customers": "Clientes",
  "Settings": "Configuración",
  "Total invoices": "Facturas totales",
  "Pending review": "Pendiente de revisión",
  "WORKFLOW": "Flujo de trabajo",
  "Workflow": "Flujo de trabajo",
  "Capture, extract, validate and export.": "Capturar, extraer, validar y exportar.",
  "Step 1 - Capture": "Paso 1 - Capturar",
  "Step 2 - Extract": "Paso 2 - Extraer",
  "Step 3 - Validate": "Paso 3 - Validar",
  "Step 4 - Export": "Paso 4 - Exportar"
};

const arabicDictionary: Record<string, string> = {
  "Home": "الرئيسية",
  "Product": "المنتج",
  "Benefits": "المزايا",
  "Features": "المميزات",
  "How it works": "كيف يعمل",
  "Pricing": "الأسعار",
  "FAQs": "الأسئلة الشائعة",
  "Contact": "اتصل بنا",
  "Support": "الدعم",
  "Sign in": "تسجيل الدخول",
  "Sign In": "تسجيل الدخول",
  "Sign out": "تسجيل الخروج",
  "Get Started": "ابدأ الآن",
  "Dashboard": "لوحة المعلومات",
  "Invoices": "الفواتير",
  "Suppliers": "الموردين",
  "Customers": "العملاء",
  "Settings": "الإعدادات",
  "Total invoices": "إجمالي الفواتير",
  "Pending review": "قيد المراجعة",
  "WORKFLOW": "سير العمل",
  "Workflow": "سير العمل",
  "Capture, extract, validate and export.": "التقاط، استخراج، تحقق، وتصدير.",
  "Step 1 - Capture": "الخطوة 1 - التقاط",
  "Step 2 - Extract": "الخطوة 2 - استخراج",
  "Step 3 - Validate": "الخطوة 3 - تحقق",
  "Step 4 - Export": "الخطوة 4 - تصدير"
};

function getDictionary(locale: Locale): Record<string, string> | null {
  if (locale === "hi-IN") return hindiDictionary;
  if (locale === "gu-IN") return gujaratiDictionary;
  if (locale === "es-ES") return spanishDictionary;
  if (locale === "ar") return arabicDictionary;
  return null;
}

let observer: MutationObserver | null = null;
let currentLocale: Locale = "en-GB";

const sortedKeysCache = new Map<Record<string, string>, string[]>();

function getSortedKeys(dict: Record<string, string>): string[] {
  let cached = sortedKeysCache.get(dict);
  if (!cached) {
    cached = Object.keys(dict).sort((a, b) => b.length - a.length);
    sortedKeysCache.set(dict, cached);
  }
  return cached;
}

function translateTextNode(node: Text, dict: Record<string, string>) {
  const text = node.nodeValue;
  if (!text || !text.trim()) return;

  const parent = node.parentElement;
  if (parent) {
    const tag = parent.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "code" || tag === "pre" || tag === "noscript") {
      return;
    }
  }

  // New node, or the app changed its text since we last translated it: that text is the original.
  if (!originalTextMap.has(node) || writtenTextMap.get(node) !== text) {
    originalTextMap.set(node, text);
    writtenTextMap.delete(node);
  }

  const orig = originalTextMap.get(node) ?? text;
  const trimmed = orig.trim();

  // 1. Exact match
  if (dict[trimmed]) {
    const translated = dict[trimmed];
    const leadingSpace = orig.match(/^\s*/)?.[0] || "";
    const trailingSpace = orig.match(/\s*$/)?.[0] || "";
    writeText(node, leadingSpace + translated + trailingSpace);
    return;
  }

  // 2. Substring replace for known phrases
  let replaced = orig;
  let matched = false;
  const keys = getSortedKeys(dict);
  for (const en of keys) {
    if (en.length > 3 && replaced.includes(en)) {
      replaced = replaced.split(en).join(dict[en]);
      matched = true;
    }
  }
  writeText(node, matched ? replaced : orig);
}

function restoreTextNode(node: Text) {
  if (originalTextMap.has(node)) {
    const orig = originalTextMap.get(node);
    // Only undo our own translation; text the app has since changed is already current.
    if (orig !== undefined && writtenTextMap.get(node) === node.nodeValue && node.nodeValue !== orig) {
      node.nodeValue = orig;
    }
    writtenTextMap.delete(node);
  }
}

function walkAndTranslate(root: Node, dict: Record<string, string>) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null = walker.nextNode();
  while (current) {
    translateTextNode(current as Text, dict);
    current = walker.nextNode();
  }
}

function walkAndRestore(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null = walker.nextNode();
  while (current) {
    restoreTextNode(current as Text);
    current = walker.nextNode();
  }
}

export function applyDomTranslations(locale: Locale) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  currentLocale = locale;
  const dict = getDictionary(locale);

  if (observer) {
    observer.disconnect();
    observer = null;
  }

  if (!dict || locale === "en-GB") {
    walkAndRestore(document.body);
    return;
  }

  // Translate existing DOM
  walkAndTranslate(document.body, dict);

  // Translate new nodes dynamically
  observer = new MutationObserver((mutations) => {
    if (currentLocale === "en-GB") return;
    const activeDict = getDictionary(currentLocale);
    if (!activeDict) return;

    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node.nodeType === Node.TEXT_NODE) {
            translateTextNode(node as Text, activeDict);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            walkAndTranslate(node, activeDict);
          }
        }
      } else if (mutation.type === "characterData") {
        translateTextNode(mutation.target as Text, activeDict);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}
