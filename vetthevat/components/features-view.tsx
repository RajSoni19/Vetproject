"use client";

import { Building2, Download, FileSpreadsheet, FileText, Mail, ReceiptText, ShieldCheck } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { playStoreUrl } from "@/lib/site-links";
import { useLocale } from "@/components/locale-provider";

export function FeaturesView() {
  const { locale, t } = useLocale();
  const isGu = locale === "gu-IN";
  const isHi = locale === "hi-IN";
  const isEs = locale === "es-ES";
  const isAr = locale === "ar";

  const tEyebrow = isGu ? "વિશેષતાઓ" : isHi ? "विशेषताएँ" : isEs ? "Características" : isAr ? "المميزات" : "Features";
  const tTitle = isGu
    ? "ઇન્વૉઇસ ડેટા અને VAT વર્કફ્લો માટે મુખ્ય વિશેષતાઓ."
    : isHi
    ? "चालान डेटा और VAT वर्कफ़्लो के लिए मुख्य विशेषताएँ।"
    : isEs
    ? "Características clave para datos de facturas y flujos de IVA."
    : isAr
    ? "الميزات الأساسية لبيانات الفواتير ومسارات ضريبة القيمة المضافة."
    : "Core features for invoice data and VAT workflows.";
  const tDescription = isGu
    ? "ઇન્વૉઇસ માહિતી મેળવવા, સમર્થિત હોય ત્યાં સપ્લાયર VAT વિગતો માન્ય કરવા અને વ્યવસ્થિત રેકોર્ડ્સ નિકાસ કરવા માટે કેન્દ્રિત સુવિધાઓ."
    : isHi
    ? "चालान जानकारी निकालने, समर्थित होने पर आपूर्तिकर्ता VAT विवरण सत्यापित करने और व्यवस्थित रिकॉर्ड निर्यात करने के लिए केंद्रित सुविधाएँ।"
    : isEs
    ? "Un conjunto de funciones diseñadas para capturar facturas, validar el IVA de los proveedores y exportar registros organizados."
    : isAr
    ? "مجموعة ميزات مخصصة لالتقاط بيانات الفواتير والتحقق من ضريبة الموردين وتصدير السجلات المنظمة."
    : "Everything you need to capture invoices, check VAT and keep your records ready for your accountant.";

  const features = [
    {
      title: isGu ? "સરળ ડેટા એક્સટ્રેક્શન" : isHi ? "आसान डेटा निष्कर्षण" : isEs ? "Extracción de datos sencilla" : isAr ? "استخراج بيانات سهل" : "Automatic invoice reading",
      desc: isGu
        ? "ઇન્વૉઇસ માહિતીને સંરચિત રેકોર્ડ્સમાં ફેરવીને મેન્યુઅલ એન્ટ્રી ઘટાડો."
        : isHi
        ? "चालान जानकारी को संरचित रिकॉर्ड में बदलकर मैन्युअल प्रविष्टि कम करें।"
        : "Scan a PDF or photo and the supplier, date, items and VAT are read for you.",
      Icon: FileText
    },
    {
      title: isGu ? "કંપની અને સપ્લાયર રેકોર્ડ્સ" : isHi ? "कंपनी और आपूर्तिकर्ता रिकॉर्ड" : isEs ? "Registros de empresas y proveedores" : isAr ? "سجلات الشركات والموردين" : "Company and supplier records",
      desc: isGu
        ? "મેળવેલા ઇન્વૉઇસ ડેટાને સંબંધિત કંપની અને સપ્લાયર આસપાસ ગોઠવો."
        : isHi
        ? "निकाले गए चालान डेटा को संबंधित कंपनी और आपूर्तिकर्ता के अनुसार व्यवस्थित करें।"
        : "Every invoice is filed under the right company and supplier, with a full price history.",
      Icon: Building2
    },
    {
      title: isGu ? "VAT માન્યતા" : isHi ? "VAT सत्यापन" : isEs ? "Validación de IVA" : isAr ? "التحقق من ضريبة القيمة المضافة" : "VAT validation",
      desc: isGu
        ? "સમર્થિત માન્યતા સેવાઓ દ્વારા સપ્લાયર VAT નોંધણી વિગતોની સમીક્ષા કરો."
        : isHi
        ? "समर्थित सत्यापन सेवाओं के माध्यम से आपूर्तिकर्ता VAT पंजीकरण विवरण की समीक्षा करें।"
        : "UK VAT numbers are checked automatically, with a one-click link to HMRC's official checker.",
      Icon: ReceiptText
    },
    {
      title: isGu ? "ઇમેઇલ શેરિંગ" : isHi ? "ईमेल साझाकरण" : isEs ? "Compartir por correo" : isAr ? "مشاركة البريد الإلكتروني" : "Bank VAT matching",
      desc: isGu
        ? "પ્રક્રિયા કરેલા ઇન્વૉઇસ અથવા રેકોર્ડ્સ નિયુક્ત ઇમેઇલ સરનામાં પર મોકલો."
        : isHi
        ? "संसाधित चालान या रिकॉर्ड निर्दिष्ट ईमेल पते पर भेजें।"
        : "Upload a bank statement and each payment is matched to its invoice, with the VAT added for you.",
      Icon: Mail
    },
    {
      title: isGu ? "એક્સેલ અને PDF નિકાસ" : isHi ? "एक्सेल और पीडीएफ निर्यात" : isEs ? "Exportaciones a Excel y PDF" : isAr ? "تصدير Excel و PDF" : "Excel and PDF exports",
      desc: isGu
        ? "રિપોર્ટિંગ અને વધુ પ્રક્રિયા માટે સમર્થિત ફોર્મેટ્સ ડાઉનલોડ કરો."
        : isHi
        ? "रिपोर्टिंग और आगे की प्रक्रिया के लिए समर्थित प्रारूप डाउनलोड करें।"
        : "Download your invoices to Excel or PDF, ready to send to your accountant.",
      Icon: FileSpreadsheet
    },
    {
      title: isGu ? "સમયગાળા આધારિત રિપોર્ટિંગ" : isHi ? "अवधि-आधारित रिपोर्टिंग" : isEs ? "Informes por períodos" : isAr ? "تقارير مبنية على الفترات" : "Period-based reporting",
      desc: isGu
        ? "માસિક, ત્રિમાસિક અને વાર્ષિક રિપોર્ટિંગ સમયગાળા માટે રેકોર્ડ્સ તૈયાર કરો."
        : isHi
        ? "मासिक, त्रैमासिक और वार्षिक रिपोर्टिंग अवधि के लिए रिकॉर्ड संकलित करें।"
        : "See and download figures by month, quarter, year or your own dates.",
      Icon: Download
    },
    {
      title: isGu ? "સુરક્ષા અને ડેટા સંરક્ષણ" : isHi ? "सुरक्षा और डेटा संरक्षण" : isEs ? "Seguridad y protección de datos" : isAr ? "الأمان وحماية البيانات" : "Security and data protection",
      desc: isGu
        ? "ચકાસાયેલ નિયંત્રણો સાથે વ્યવસાય અને ઇન્વૉઇસ માહિતીનું રક્ષણ કરો."
        : isHi
        ? "सत्यापित नियंत्रणों के साथ व्यापार और चालान जानकारी को सुरक्षित रखें।"
        : "Each company's data is private, connections are encrypted and every change is recorded.",
      Icon: ShieldCheck
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
          <div className="container-page grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="p-6">
                <div className="grid h-12 w-12 place-items-center rounded-md bg-brand-50 text-brand-700">
                  <feature.Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-5 text-xl font-bold">{feature.title}</h2>
                <p className="mt-3 text-sm leading-6 text-muted">{feature.desc}</p>
              </Card>
            ))}
          </div>
        </section>
        <section className="bg-ink py-16 text-white">
          <div className="container-page flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <h2 className="text-3xl font-bold">{isGu ? "શરૂ કરવા માટે તૈયાર છો?" : isHi ? "शुरू करने के लिए तैयार हैं?" : isEs ? "¿Listo para comenzar?" : isAr ? "هل أنت مستعد للبدء؟" : "Ready to get started?"}</h2>
              <p className="mt-2 text-white/75">{isGu ? "ઉત્પાદન માહિતી જુઓ અથવા વેરિફાઇડ એન્ડ્રોઇડ એપ ડાઉનલોડ કરો." : isHi ? "उत्पाद जानकारी देखें या सत्यापित एंड्रॉइड ऐप डाउनलोड करें।" : "Explore the product information or download the verified Android app."}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/get-started" className="bg-white text-ink hover:bg-brand-50">{t("getStarted")}</ButtonLink>
              <ButtonLink href={playStoreUrl} target="_blank" rel="noopener noreferrer" variant="outline" className="border-white/25 bg-transparent text-white hover:bg-white hover:text-ink"><Download className="h-4 w-4" />{t("downloadApp")}</ButtonLink>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
