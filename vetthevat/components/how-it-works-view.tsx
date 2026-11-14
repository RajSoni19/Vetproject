"use client";

import { BadgeCheck, Download, FileText, Upload } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { Card } from "@/components/ui/card";
import { useLocale } from "@/components/locale-provider";

export function HowItWorksView() {
  const { locale } = useLocale();

  const isGu = locale === "gu-IN";
  const isHi = locale === "hi-IN";
  const isEs = locale === "es-ES";
  const isAr = locale === "ar";

  const tEyebrow = isGu ? "વર્કફ્લો" : isHi ? "वर्कफ़्लो" : isEs ? "FLUJO DE TRABAJO" : isAr ? "سير العمل" : "WORKFLOW";
  const tTitle = isGu
    ? "કેપ્ચર કરો, મેળવો, માન્ય કરો અને નિકાસ કરો."
    : isHi
    ? "कैप्चर करें, निकालें, सत्यापित करें और निर्यात करें।"
    : isEs
    ? "Capturar, extraer, validar y exportar."
    : isAr
    ? "التقاط، استخراج، تحقق، وتصدير."
    : "Capture, extract, validate and export.";

  const tDescription = isGu
    ? "ઇન્વૉઇસ દસ્તાવેજોને સંરચિત રેકોર્ડ્સમાં ફેરવવા માટે ચાર-પગલાંનો વર્કફ્લો, જેની સમીક્ષા, સુધારો અને રિપોર્ટિંગ માટે તૈયારી કરી શકાય છે."
    : isHi
    ? "चालान दस्तावेज़ों को संरचित रिकॉर्ड में बदलने के लिए चार-चरणीय वर्कफ़्लो, जिनकी समीक्षा, सुधार और रिपोर्टिंग के लिए तैयारी की जा सकती है।"
    : isEs
    ? "Un flujo de trabajo de cuatro pasos para convertir facturas en registros estructurados listos para revisión y reporte."
    : isAr
    ? "سير عمل مكون من أربع خطوات لتحويل مستندات الفواتير إلى سجلات منظمة يمكن مراجعتها وتصحيحها وإعدادها للتقارير."
    : "A four-step workflow for turning invoice documents into structured records that can be reviewed, corrected and prepared for reporting.";

  const steps = [
    {
      title: isGu ? "પગલું 1 - કેપ્ચર" : isHi ? "चरण 1 - कैप्चर" : isEs ? "Paso 1 - Capturar" : isAr ? "الخطوة 1 - التقاط" : "Step 1 - Capture",
      body: isGu
        ? "ઇન્વૉઇસ અપલોડ કરો, સ્કેન કરો અથવા ફોટો પાડો."
        : isHi
        ? "चालान अपलोड करें, स्कैन करें या फ़ोटो लें।"
        : isEs
        ? "Sube, escanea o fotografía una factura."
        : isAr
        ? "قم بتحميل الفاتورة أو مسحها ضوئيًا أو تصويرها."
        : "Upload, scan or photograph an invoice.",
      Icon: Upload
    },
    {
      title: isGu ? "પગલું 2 - એક્સટ્રેક્ટ" : isHi ? "चरण 2 - निकालें" : isEs ? "Paso 2 - Extraer" : isAr ? "الخطوة 2 - استخراج" : "Step 2 - Extract",
      body: isGu
        ? "પુરવઠાકર્તા, વસ્તુ અને નાણાકીય માહિતી મેળવો અને ગોઠવો."
        : isHi
        ? "आपूर्तिकर्ता, वस्तु और वित्तीय जानकारी निकालें और व्यवस्थित करें।"
        : isEs
        ? "Extrae y organiza información financiera, de proveedores y artículos."
        : isAr
        ? "استخراج وتنظيم معلومات المورد والأصناف والبيانات المالية."
        : "Extract and organise supplier, item and financial information.",
      Icon: FileText
    },
    {
      title: isGu ? "પગલું 3 - માન્ય કરો" : isHi ? "चरण 3 - सत्यापित करें" : isEs ? "Paso 3 - Validar" : isAr ? "الخطوة 3 - تحقق" : "Step 3 - Validate",
      body: isGu
        ? "મેળવેલ મૂલ્યોની સમીક્ષા કરો અને પુરવઠાકર્તાની VAT માહિતી તપાસો."
        : isHi
        ? "निकाले गए मूल्यों की समीक्षा करें और आपूर्तिकर्ता VAT जानकारी जांचें।"
        : isEs
        ? "Revisa los valores extraídos y verifica la información de IVA del proveedor."
        : isAr
        ? "راجع القيم المستخرجة وتحقق من بيانات ضريبة القيمة المضافة للمورد."
        : "Review extracted values and check supplier VAT information.",
      Icon: BadgeCheck
    },
    {
      title: isGu ? "પગલું 4 - નિકાસ કરો" : isHi ? "चरण 4 - निर्यात करें" : isEs ? "Paso 4 - Exportar" : isAr ? "الخطوة 4 - تصدير" : "Step 4 - Export",
      body: isGu
        ? "સંરચિત ઇન્વૉઇસ રેકોર્ડ્સ અને રિપોર્ટ્સ ડાઉનલોડ અથવા શેર કરો."
        : isHi
        ? "संरचित चालान रिकॉर्ड और रिपोर्ट डाउनलोड या साझा करें।"
        : isEs
        ? "Descarga o comparte informes y registros estructurados de facturas."
        : isAr
        ? "تنزيل أو مشاركة سجلات وتقارير الفواتير المنظمة."
        : "Download or share structured invoice records and reports.",
      Icon: Download
    }
  ];

  const tCardTitle = isGu ? "સમીક્ષા હંમેશા મહત્વપૂર્ણ રહે છે." : isHi ? "समीक्षा हमेशा आवश्यक है।" : isEs ? "La revisión sigue siendo esencial." : isAr ? "تبقى المراجعة أمراً أساسياً." : "Review remains essential.";
  const tCardBody = isGu
    ? "મેળવેલી માહિતીની સમીક્ષા કરવા, ભૂલો સુધારવા અને તેના પર આધાર રાખતા પહેલાં એકાઉન્ટિંગ અને VAT રેકોર્ડ્સ સચોટ છે તેની ખાતરી કરવા માટે વપરાશકર્તાઓ જવાબદાર રહે છે."
    : isHi
    ? "निकाली गई जानकारी की समीक्षा करने, अपवादों को हल करने और उन पर भरोसा करने से पहले लेखांकन और VAT रिकॉर्ड सटीक हैं यह सुनिश्चित करने के लिए उपयोगकर्ता ज़िम्मेदार हैं।"
    : isEs
    ? "Los usuarios siguen siendo responsables de revisar la información extraída y resolver excepciones antes de basarse en los registros contables y de IVA."
    : isAr
    ? "يظل المستخدمون مسؤولين عن مراجعة البيانات المستخرجة وحل أي استثناءات والتأكد من دقة سجلات المحاسبة والضريبة قبل الاعتماد عليها."
    : "Users remain responsible for reviewing extracted information, resolving exceptions and ensuring that accounting and VAT records are accurate before relying on them.";

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
          <div className="container-page grid gap-4 md:grid-cols-4">
            {steps.map((step) => (
              <Card key={step.title} className="p-6">
                <step.Icon className="h-7 w-7 text-brand-700" />
                <h2 className="mt-5 text-xl font-bold">{step.title}</h2>
                <p className="mt-3 text-sm leading-6 text-muted">{step.body}</p>
              </Card>
            ))}
          </div>
        </section>
        <section className="bg-wash py-16">
          <div className="container-page">
            <Card className="p-8">
              <h2 className="text-2xl font-bold">{tCardTitle}</h2>
              <p className="mt-4 max-w-4xl leading-7 text-muted">{tCardBody}</p>
            </Card>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
