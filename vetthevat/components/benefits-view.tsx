"use client";

import { BriefcaseBusiness, Building2, Users } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { Card } from "@/components/ui/card";
import { useLocale } from "@/components/locale-provider";

export function BenefitsView() {
  const { locale } = useLocale();
  const isGu = locale === "gu-IN";
  const isHi = locale === "hi-IN";
  const isEs = locale === "es-ES";
  const isAr = locale === "ar";

  const tEyebrow = isGu ? "લાભો" : isHi ? "लाभ" : isEs ? "Beneficios" : isAr ? "المزايا" : "Benefits";
  const tTitle = isGu
    ? "દરેક ઇન્વૉઇસ વર્કફ્લો માટે મૂલ્ય."
    : isHi
    ? "हर चालान वर्कफ़्लो के लिए मूल्य।"
    : isEs
    ? "Valor para cada flujo de trabajo de facturas."
    : isAr
    ? "قيمة حقيقية لكل مسار لمعالجة الفواتير."
    : "Value for every invoice workflow.";
  const tDescription = isGu
    ? "Vet the VAT નો ઉદ્દેશ્ય પુનરાવર્તિત વહીવટ ઘટાડવાનો, રેકોર્ડ માળખું સુધારવાનો અને વ્યવસાય નાણાકીય કાર્યમાં સ્પષ્ટ રિપોર્ટિંગને ટેકો આપવાનો છે."
    : isHi
    ? "Vet the VAT को दोहराए जाने वाले प्रशासनिक काम को कम करने, रिकॉर्ड संरचना में सुधार करने और व्यावसायिक वित्त कार्य में स्पष्ट रिपोर्टिंग का समर्थन करने के लिए डिज़ाइन किया गया है।"
    : isEs
    ? "Vet the VAT está diseñado para reducir la administración repetitiva, mejorar la estructura de los registros y respaldar informes financieros más claros."
    : isAr
    ? "تم تصميم Vet the VAT لتقليل الأعمال الإدارية المتكررة وتحسين تنظيم السجلات وإصدار تقارير واضحة ودقيقة."
    : "Vet the VAT is designed to reduce repetitive administration, improve record structure and support clearer reporting across business finance work.";

  const audiences = [
    {
      title: isGu ? "એકાઉન્ટન્ટ્સ અને બુકકીપર્સ માટે" : isHi ? "एकाउंटेंट्स और बुककीपर्स के लिए" : isEs ? "Para contadores y tenedores de libros" : isAr ? "للمحاسبين ومسك الدفاتر" : "For accountants and bookkeepers",
      intro: isGu ? "ક્લાયંટ ઇન્વૉઇસ પ્રક્રિયા સરળ બનાવો." : isHi ? "क्लाइंट चालान प्रसंस्करण को सरल बनाएं।" : isEs ? "Simplifique el procesamiento de facturas de clientes." : isAr ? "تبسيط معالجة فواتير العملاء." : "Simplify client invoice processing.",
      icon: BriefcaseBusiness,
      items: isGu
        ? [
            "વારંવાર થતી ઇન્વૉઇસ ડેટા એન્ટ્રી ઘટાડો.",
            "એકસરખા માળખામાં સપ્લાયર ઇન્વૉઇસ પર પ્રક્રિયા કરો.",
            "સમીક્ષા માટે ક્લાયંટ રેકોર્ડ્સ ગોઠવો.",
            "માસિક, ત્રિમાસિક અને વાર્ષિક માહિતી તૈયાર કરો.",
            "ડાઉનસ્ટ્રીમ એકાઉન્ટિંગ વર્કફ્લો માટે રેકોર્ડ્સ નિકાસ કરો.",
            "વિશ્લેષણ અને ક્લાયંટ સેવા પર વધુ સમય ફાળવો."
          ]
        : isHi
        ? [
            "बार-बार होने वाली चालान डेटा प्रविष्टि को कम करें।",
            "सुसंगत संरचना में आपूर्तिकर्ता चालान संसाधित करें।",
            "समीक्षा के लिए क्लाइंट रिकॉर्ड व्यवस्थित करें।",
            "मासिक, त्रैमासिक और वार्षिक जानकारी संकलित करें।",
            "डाउनस्ट्रीम अकाउंटिंग वर्कफ़्लो के लिए रिकॉर्ड निर्यात करें।",
            "विश्लेषण और ग्राहक सेवा पर अधिक समय व्यतीत करें।"
          ]
        : [
            "Reduce repetitive invoice data entry.",
            "Process supplier invoices in a consistent structure.",
            "Organise client records for review.",
            "Compile monthly, quarterly and annual information.",
            "Export records for downstream accounting workflows.",
            "Spend more time on analysis and client service."
          ]
    },
    {
      title: isGu ? "બિઝનેસ માલિકો માટે" : isHi ? "बिजनेस मालिकों के लिए" : isEs ? "Para propietarios de empresas" : isAr ? "لأصحاب الأعمال" : "For business owners",
      intro: isGu ? "બિનજરૂરી વહીવટ વિના ઇન્વૉઇસ રેકોર્ડ્સ વ્યવસ્થિત રાખો." : isHi ? "अनावश्यक प्रशासन के बिना चालान रिकॉर्ड व्यवस्थित रखें।" : isEs ? "Mantenga los registros de facturas organizados sin trámites innecesarios." : isAr ? "الحفاظ على تنظيم سجلات الفواتير دون أعباء إدارية." : "Keep invoice records organised without unnecessary administration.",
      icon: Building2,
      items: isGu
        ? [
            "ઇન્વૉઇસ અને રસીદો ડિજિટલી કેપ્ચર કરો.",
            "સપ્લાયર અને ખર્ચના રેકોર્ડ્સ સંરચિત રાખો.",
            "ચોખ્ખી, VAT અને કુલ રકમની સમીક્ષા કરો.",
            "રિપોર્ટિંગ માટે માહિતી વધુ સરળતાથી મેળવો.",
            "પ્રક્રિયા કરેલી માહિતી શેર અથવા ડાઉનલોડ કરો."
          ]
        : isHi
        ? [
            "चालान और रसीदें डिजिटल रूप से कैप्चर करें।",
            "आपूर्तिकर्ता और व्यय रिकॉर्ड संरचित रखें।",
            "शुद्ध, VAT और सकल राशियों की समीक्षा करें।",
            "रिपोर्टिंग के लिए जानकारी आसानी से खोजें।",
            "संसाधित जानकारी साझा या डाउनलोड करें।"
          ]
        : [
            "Capture invoices and receipts digitally.",
            "Keep supplier and expense records structured.",
            "Review net, VAT and gross amounts.",
            "Find information more easily for reporting.",
            "Share or download processed information."
          ]
    },
    {
      title: isGu ? "ફાઇનાન્સ ટીમો માટે" : isHi ? "फाइनेंस टीमों के लिए" : isEs ? "Para equipos financieros" : isAr ? "للفرق المالية" : "For finance teams",
      intro: isGu ? "નાણાકીય રેકોર્ડ્સમાં સુસંગતતા અને દૃશ્યતામાં સુધારો કરો." : isHi ? "वित्तीय रिकॉर्ड में निरंतरता और दृश्यता में सुधार करें।" : isEs ? "Mejore la coherencia y la visibilidad de los registros financieros." : isAr ? "تعزيز الاتساق والوضوح عبر السجلات المالية." : "Improve consistency and visibility across financial records.",
      icon: Users,
      items: isGu
        ? [
            "પુનરાવર્તિત ઇન્વૉઇસ પ્રોસેસિંગ વર્કફ્લો લાગુ કરો.",
            "અપવાદો અને અપૂર્ણ માહિતીની સમીક્ષા કરો.",
            "સપ્લાયર-સ્તર અને સમયગાળા-સ્તરના રેકોર્ડ્સની સરખામણી કરો.",
            "મેળવણી માટે સંરચિત ડેટા તૈયાર કરો.",
            "મેનેજમેન્ટ રિપોર્ટિંગ અને ઓડિટ તૈયારીમાં સહાય કરો."
          ]
        : isHi
        ? [
            "दोहराने योग्य चालान प्रसंस्करण वर्कफ़्लो लागू करें।",
            "अपवादों और अधूरी जानकारी की समीक्षा करें।",
            "आपूर्तिकर्ता-स्तर और अवधि-स्तर के रिकॉर्ड की तुलना करें।",
            "मिलान के लिए संरचित डेटा तैयार करें।",
            "प्रबंधन रिपोर्टिंग और ऑडिट तैयारी का समर्थन करें।"
          ]
        : [
            "Apply a repeatable invoice processing workflow.",
            "Review exceptions and incomplete information.",
            "Compare supplier-level and period-level records.",
            "Prepare structured data for reconciliation.",
            "Support management reporting and audit preparation."
          ]
    }
  ];

  return (
    <PublicShell>
      <main>
        <section className="bg-[#f8fbfa] py-20">
          <div className="container-page max-w-4xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-brand-700">{tEyebrow}</p>
            <h1 className="mt-4 text-5xl font-bold leading-tight">{tTitle}</h1>
            <p className="mt-6 text-lg leading-8 text-muted">{tDescription}</p>
          </div>
        </section>
        <section className="py-20">
          <div className="container-page grid gap-5 lg:grid-cols-3">
            {audiences.map((audience) => (
              <Card key={audience.title} className="p-7">
                <audience.icon className="h-7 w-7 text-brand-700" />
                <h2 className="mt-5 text-2xl font-bold">{audience.title}</h2>
                <p className="mt-3 leading-7 text-muted">{audience.intro}</p>
                <div className="mt-6 grid gap-3">
                  {audience.items.map((item) => (
                    <div key={item} className="rounded-lg border border-line bg-wash p-3 text-sm leading-6 text-muted">{item}</div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
