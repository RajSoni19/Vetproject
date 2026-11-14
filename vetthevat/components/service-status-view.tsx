"use client";

import { useLocale } from "@/components/locale-provider";
import { Card } from "@/components/ui/card";

export type ServiceStatusItem = [string, string, string];

const hindiTranslations: Record<string, string> = {
  // Headings
  "Web service availability": "वेब सेवा उपलब्धता",
  "This is an isolated synthetic UAT environment. Database connectivity and the local document-worker heartbeat are checked here; no production readiness is implied.": "यह एक पृथक सिंथेटिक UAT वातावरण है। डेटाबेस कनेक्टिविटी और स्थानीय दस्तावेज़-वर्कर की स्थिति यहाँ जाँची जाती है; कोई उत्पादन तत्परता निहित नहीं है।",
  "This local development workspace reports enabled development features and provider setup. Development data is isolated and must not be used for live financial records.": "यह स्थानीय विकास कार्यक्षेत्र सक्षम विकास सुविधाओं और प्रदाता सेटअप की रिपोर्ट करता है। विकास डेटा पृथक है और इसका उपयोग वास्तविक वित्तीय रिकॉर्ड के लिए नहीं किया जाना चाहिए।",
  "The website describes the intended product. The web application has not been released for live business use. These are implementation availability statements, not live provider health measurements.": "वेबसाइट इच्छित उत्पाद का वर्णन करती है। वेब एप्लिकेशन को लाइव व्यावसायिक उपयोग के लिए जारी नहीं किया गया है।",

  // Service Names
  "Web accounts": "वेब खाते",
  "Invoices and VAT": "चालान और VAT",
  "ORS": "ORS (ऑर्डर और प्राप्ति प्रणाली)",
  "Billing and payments": "बिलिंग और भुगतान",
  "Billing & subscriptions": "बिलिंग और सदस्यताएँ",
  "Online enquiries": "ऑनलाइन पूछताछ",
  "Mobile applications": "मोबाइल एप्लिकेशन",
  "Accounts and company security": "खाते और कंपनी सुरक्षा",
  "Invoices, VAT and exports": "चालान, VAT और निर्यात",
  "Malware inspection and OCR": "मैलवेयर निरीक्षण और OCR",
  "Super Admin": "सुपर एडमिन",
  "Contact and enquiries": "संपर्क और पूछताछ",
  "Billing and outbound services": "बिलिंग और आउटबाउंड सेवाएँ",

  // Statuses
  "Available for local development": "स्थानीय विकास के लिए उपलब्ध",
  "Manual workflows available for local development": "स्थानीय विकास के लिए मैन्युअल वर्कफ़्लो उपलब्ध",
  "Not configured": "कॉन्फ़िगर नहीं किया गया",
  "Separate service": "अलग सेवा",
  "Email handoff only": "केवल ईमेल अग्रेषण",
  "Unavailable": "अनुपलब्ध",
  "Isolated development only": "केवल पृथक विकास",
  "Isolated development workflows": "पृथक विकास वर्कफ़्लो",
  "UAT database connected": "UAT डेटाबेस कनेक्टेड",
  "Available in isolated UAT": "पृथक UAT में उपलब्ध",
  "Local worker ready": "स्थानीय वर्कर तैयार",
  "Local worker unavailable": "स्थानीय वर्कर अनुपलब्ध",
  "MFA-protected UAT administration": "MFA-संरक्षित UAT प्रशासन",
  "Persisted UAT enquiries": "सहेजी गई UAT पूछताछ",
  "No real payment collection": "कोई वास्तविक भुगतान संग्रह नहीं",

  // Descriptions
  "Registration, email verification, password sign-in, sessions and password changes use the isolated PostgreSQL development database. Real verification email is not configured, so accounts cannot complete email verification until an SMTP sender is set up.": "पंजीकरण, ईमेल सत्यापन, पासवर्ड साइन-इन, सत्र और पासवर्ड परिवर्तन पृथक PostgreSQL विकास डेटाबेस का उपयोग करते हैं। वास्तविक सत्यापन ईमेल कॉन्फ़िगर नहीं है, इसलिए नए खाते तब तक सत्यापन पूरा नहीं कर सकते जब तक कि SMTP प्रेषक सेट न हो जाए।",
  "Authorized development companies can create suppliers and customers, save and confirm manual invoices, view VAT summaries, and download PDF or XLSX exports. Original-document scanning and OCR are not configured. Use synthetic development data only.": "अधिकृत कंपनियाँ आपूर्तिकर्ता और ग्राहक बना सकती हैं, मैन्युअल चालान सहेज और पुष्टि कर सकती हैं, VAT सारांश देख सकती हैं, और PDF या XLSX निर्यात डाउनलोड कर सकती हैं। केवल सिंथेटिक विकास डेटा का उपयोग करें।",
  "Procurement, stock, sales orders and fulfillment workflows are enabled against isolated development data. They are not connected to live business operations.": "खरीद, स्टॉक, बिक्री ऑर्डर और पूर्ति वर्कफ़्लो पृथक विकास डेटा पर सक्षम हैं। वे लाइव व्यावसायिक संचालन से जुड़े नहीं हैं।",
  "The local billing schema is present, but Stripe test credentials and the required provider approvals are not configured. No checkout, payment or subscription activation is available.": "स्थानीय बिलिंग स्कीमा मौजूद है, लेकिन स्ट्राइप टेस्ट क्रेडेंशियल और आवश्यक स्वीकृतियां कॉन्फ़िगर नहीं हैं। कोई चेकआउट या भुगतान सक्रियण उपलब्ध नहीं है।",
  "The Get Started form can prepare an email for the visitor to review and send. Durable online enquiry storage is disabled until verified bot protection and runtime settings are configured.": "गेट स्टार्टेड फ़ॉर्म विज़िटर के लिए समीक्षा और भेजने हेतु ईमेल तैयार कर सकता है।",
  "Published mobile applications and their existing customer services are not connected to this web development environment.": "प्रकाशित मोबाइल एप्लिकेशन और उनकी मौजूदा ग्राहक सेवाएँ इस वेब विकास वातावरण से कनेक्ट नहीं हैं।"
};

const gujaratiTranslations: Record<string, string> = {
  // Headings
  "Web service availability": "વેબ સેવા ઉપલબ્ધતા",
  "This is an isolated synthetic UAT environment. Database connectivity and the local document-worker heartbeat are checked here; no production readiness is implied.": "આ એક અલગ સિન્થેટિક UAT વાતાવરણ છે. ડેટાબેઝ કનેક્ટિવિટી અને સ્થાનિક દસ્તાવેજ-વર્કરની સ્થિતિ અહીં તપાસવામાં આવે છે; કોઈ ઉત્પાદન તૈયારી ગર્ભિત નથી.",
  "This local development workspace reports enabled development features and provider setup. Development data is isolated and must not be used for live financial records.": "આ સ્થાનિક વિકાસ કાર્યક્ષેત્ર સક્ષમ કરેલ વિકાસ સુવિધાઓ અને પ્રદાતા સેટઅપની જાણ કરે છે. વિકાસ ડેટા અલગ છે અને તેનો ઉપયોગ જીવંત નાણાકીય રેકોર્ડ્સ માટે થવો જોઈએ નહીં.",
  "The website describes the intended product. The web application has not been released for live business use. These are implementation availability statements, not live provider health measurements.": "વેબસાઇટ હેતુપૂર્વકના ઉત્પાદનનું વર્ણન કરે છે. વેબ એપ્લિકેશન જીવંત વ્યવસાયિક ઉપયોગ માટે પ્રકાશિત કરવામાં આવી નથી.",

  // Service Names
  "Web accounts": "વેબ ખાતાઓ",
  "Invoices and VAT": "ઇન્વૉઇસ અને VAT",
  "ORS": "ORS (ઓર્ડર અને પ્રાપ્તી સિસ્ટમ)",
  "Billing and payments": "બિલિંગ અને ચુકવણીઓ",
  "Billing & subscriptions": "બિલિંગ અને સબ્સ્ક્રિપ્શન્સ",
  "Online enquiries": "ઓનલાઇન પૂછપરછ",
  "Mobile applications": "મોબાઇલ એપ્લિકેશન્સ",
  "Accounts and company security": "ખાતા અને કંપની સુરક્ષા",
  "Invoices, VAT and exports": "ઇન્વૉઇસ, VAT અને નિકાસ",
  "Malware inspection and OCR": "માલવેર નિરીક્ષણ અને OCR",
  "Super Admin": "સુપર એડમિન",
  "Contact and enquiries": "સંપર્ક અને પૂછપરછ",
  "Billing and outbound services": "બિલિંગ અને આઉટબાઉન્ડ સેવાઓ",

  // Statuses
  "Available for local development": "સ્થાનિક વિકાસ માટે ઉપલબ્ધ",
  "Manual workflows available for local development": "મેન્યુઅલ વર્કફ્લો સ્થાનિક વિકાસ માટે ઉપલબ્ધ",
  "Not configured": "ગોઠવેલ નથી",
  "Separate service": "અલગ સેવા",
  "Email handoff only": "માત્ર ઇમેઇલ ફોરવર્ડિંગ",
  "Unavailable": "અનુપલબ્ધ",
  "Isolated development only": "માત્ર અલગ વિકાસ",
  "Isolated development workflows": "અલગ વિકાસ વર્કફ્લો",
  "UAT database connected": "UAT ડેટાબેઝ જોડાયેલ છે",
  "Available in isolated UAT": "અલગ UAT માં ઉપલબ્ધ",
  "Local worker ready": "સ્થાનિક વર્કર તૈયાર",
  "Local worker unavailable": "સ્થાનિક વર્કર અનુપલબ્ધ",
  "MFA-protected UAT administration": "MFA-સુરક્ષિત UAT વહીવટ",
  "Persisted UAT enquiries": "સાચવેલ UAT પૂછપરછ",
  "No real payment collection": "કોઈ વાસ્તવિક ચુકવણી સંગ્રહ નથી",

  // Descriptions
  "Registration, email verification, password sign-in, sessions and password changes use the isolated PostgreSQL development database. Real verification email is not configured, so accounts cannot complete email verification until an SMTP sender is set up.": "નોંધણી, ઇમેઇલ ચકાસણી, પાસવર્ડ સાઇન-ઇન, સત્રો અને પાસવર્ડ ફેરફારો અલગ PostgreSQL વિકાસ ડેટાબેઝનો ઉપયોગ કરે છે. વાસ્તવિક ચકાસણી ઇમેઇલ ગોઠવેલ નથી, તેથી જ્યાં સુધી SMTP મોકલનાર સેટ ન થાય ત્યાં સુધી એકાઉન્ટ્સ ઇમેઇલ ચકાસણી પૂર્ણ કરી શકતા નથી.",
  "Authorized development companies can create suppliers and customers, save and confirm manual invoices, view VAT summaries, and download PDF or XLSX exports. Original-document scanning and OCR are not configured. Use synthetic development data only.": "અધિકૃત વિકાસ કંપનીઓ સપ્લાયર્સ અને ગ્રાહકો બનાવી શકે છે, મેન્યુઅલ ઇન્વૉઇસ સાચવી અને પુષ્ટિ કરી શકે છે, VAT સારાંશ જોઈ શકે છે અને PDF અથવા XLSX નિકાસ ડાઉનલોડ કરી શકે છે. મૂળ-દસ્તાવેજ સ્કેનિંગ અને OCR ગોઠવેલ નથી. ફક્ત સિન્થેટિક વિકાસ ડેટાનો ઉપયોગ કરો.",
  "Procurement, stock, sales orders and fulfillment workflows are enabled against isolated development data. They are not connected to live business operations.": "ખરીદી, સ્ટોક, વેચાણ ઓર્ડર અને પરિપૂર્ણતા વર્કફ્લો અલગ વિકાસ ડેટા સામે સક્ષમ છે. તેઓ જીવંત વ્યવસાય કામગીરી સાથે જોડાયેલા નથી.",
  "The local billing schema is present, but Stripe test credentials and the required provider approvals are not configured. No checkout, payment or subscription activation is available.": "સ્થાનિક બિલિંગ સ્કીમા હાજર છે, પરંતુ સ્ટ્રાઇપ ટેસ્ટ ઓળખપત્રો અને જરૂરી પ્રદાતા મંજૂરીઓ ગોઠવેલ નથી. કોઈ ચેકઆઉટ, ચુકવણી અથવા સબ્સ્ક્રિપ્શન સક્રિયકરણ ઉપલબ્ધ નથી.",
  "The Get Started form can prepare an email for the visitor to review and send. Durable online enquiry storage is disabled until verified bot protection and runtime settings are configured.": "ગેટ સ્ટાર્ટેડ ફોર્મ મુલાકાતીને સમીક્ષા કરવા અને મોકલવા માટે એક ઇમેઇલ તૈયાર કરી શકે છે.",
  "Published mobile applications and their existing customer services are not connected to this web development environment.": "પ્રકાશિત મોબાઇલ એપ્લિકેશન્સ અને તેમની હાલની ગ્રાહક સેવાઓ આ વેબ વિકાસ વાતાવરણ સાથે જોડાયેલ નથી."
};

export function ServiceStatusView({
  services,
  descriptionText
}: {
  services: ServiceStatusItem[];
  descriptionText: string;
}) {
  const { locale } = useLocale();

  const tr = (text: string): string => {
    if (locale === "hi-IN" && hindiTranslations[text]) {
      return hindiTranslations[text];
    }
    if (locale === "gu-IN" && gujaratiTranslations[text]) {
      return gujaratiTranslations[text];
    }
    return text;
  };

  return (
    <main className="container-page py-16">
      <h1 className="text-4xl font-bold tracking-tight text-ink">
        {tr("Web service availability")}
      </h1>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-muted">
        {tr(descriptionText)}
      </p>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {services.map(([name, status, description]) => (
          <Card key={name} className="p-6 transition hover:shadow-md">
            <h2 className="text-xl font-bold text-ink">{tr(name)}</h2>
            <p className="mt-2 font-semibold text-brand-700">{tr(status)}</p>
            <p className="mt-3 text-sm leading-7 text-muted">{tr(description)}</p>
          </Card>
        ))}
      </div>
    </main>
  );
}
