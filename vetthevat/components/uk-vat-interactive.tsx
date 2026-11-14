"use client";

import { useMemo, useState } from "react";
import { Calculator, CheckCircle2, FileCheck2, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/components/locale-provider";

export function UkVatInteractive() {
  const { locale } = useLocale();
  const isGu = locale === "gu-IN";
  const isHi = locale === "hi-IN";

  const audiences = {
    business: {
      label: isGu ? "બિઝનેસ માલિક" : isHi ? "बिजनेस मालिक" : "Business owner",
      title: isGu ? "ખરીદ ઇન્વૉઇસ વ્યવસ્થિત રાખો" : isHi ? "खरीद चालान व्यवस्थित रखें" : "Keep purchase invoices tidy",
      body: isGu
        ? "સપ્લાયર ઇન્વૉઇસ કેપ્ચર કરો, ચોખ્ખી/VAT/કુલ રકમની સમીક્ષા કરો અને મૂળ દસ્તાવેજને રેકોર્ડ સાથે લિંક રાખો."
        : isHi
        ? "आपूर्तिकर्ता चालान कैप्चर करें, शुद्ध/VAT/सकल योग की समीक्षा करें और मूल दस्तावेज़ को रिकॉर्ड से लिंक रखें।"
        : "Capture supplier invoices, review net/VAT/gross totals and keep the original document linked to the record."
    },
    accountant: {
      label: isGu ? "એકાઉન્ટન્ટ" : isHi ? "एकाउंटेंट" : "Accountant",
      title: isGu ? "સમીક્ષા માટે રેકોર્ડ્સ તૈયાર કરો" : isHi ? "समीक्षा के लिए रिकॉर्ड तैयार करें" : "Prepare records for review",
      body: isGu
        ? "કંપની, સપ્લાયર અને સમયગાળા પ્રમાણે ક્લાયંટ ઇન્વૉઇસ જૂથબદ્ધ કરો જેથી આગળનું એકાઉન્ટિંગ કાર્ય સ્વચ્છ ડેટાથી શરૂ થાય."
        : isHi
        ? "कंपनी, आपूर्तिकर्ता और अवधि के अनुसार क्लाइंट चालान समूहित करें ताकि आगे का लेखांकन कार्य स्वच्छ डेटा से शुरू हो।"
        : "Group client invoices by company, supplier and period so downstream accounting work starts from cleaner data."
    },
    finance: {
      label: isGu ? "નાણાકીય ટીમ" : isHi ? "वित्त टीम" : "Finance team",
      title: isGu ? "વર્કફ્લો પ્રમાણિત કરો" : isHi ? "वर्कफ़्लो मानकीकृत करें" : "Standardise the workflow",
      body: isGu
        ? "માસિક, ત્રિમાસિક અને વાર્ષિક રિપોર્ટિંગ સમયગાળામાં પુનરાવર્તિત કેપ્ચર, સમીક્ષા અને નિકાસ પ્રક્રિયાનો ઉપયોગ કરો."
        : isHi
        ? "मासिक, त्रैमासिक और वार्षिक रिपोर्टिंग अवधि में दोहराने योग्य कैप्चर, समीक्षा और निर्यात प्रक्रिया का उपयोग करें।"
        : "Use a repeatable capture, review and export process across monthly, quarterly and annual reporting periods."
    }
  };

  const checklist = [
    isGu ? "સપ્લાયર નામ અને VAT નંબર હાજર છે" : isHi ? "आपूर्तिकर्ता का नाम और VAT नंबर मौजूद है" : "Supplier name and VAT number present",
    isGu ? "ઇન્વૉઇસ તારીખ અને ઇન્વૉઇસ નંબર કેપ્ચર થયેલ છે" : isHi ? "चालान तिथि और चालान संख्या कैप्चर की गई" : "Invoice date and invoice number captured",
    isGu ? "જથ્થો અને કિંમત માટે લાઇન આઇટમ્સની સમીક્ષા કરી" : isHi ? "मात्रा और मूल्य के लिए लाइन आइटम की समीक्षा की गई" : "Line items reviewed for quantity and price",
    isGu ? "ચોખ્ખી, VAT અને કુલ રકમ તપાસવામાં આવી" : isHi ? "शुद्ध, VAT और कुल योग की जांच की गई" : "Net, VAT and gross totals checked",
    isGu ? "મૂળ દસ્તાવેજ રેકોર્ડ સાથે સંગ્રહિત છે" : isHi ? "मूल दस्तावेज़ रिकॉर्ड के साथ संग्रहीत है" : "Original document stored with the record"
  ];

  const [netAmount, setNetAmount] = useState("");
  const [vatRate, setVatRate] = useState("20");
  const [audience, setAudience] = useState<keyof typeof audiences>("business");
  const [checked, setChecked] = useState<string[]>([]);

  const totals = useMemo(() => {
    const net = Math.max(0, Number(netAmount) || 0);
    const rate = Math.max(0, Number(vatRate) || 0);
    const vat = Math.round(net * rate) / 100;
    return {
      net,
      vat,
      gross: net + vat
    };
  }, [netAmount, vatRate]);

  function toggle(item: string) {
    setChecked((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);
  }

  const activeAudience = audiences[audience];

  return (
    <section className="bg-wash py-20">
      <div className="container-page">
        <div className="max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-brand-700">
            {isGu ? "ઇન્ટરેક્ટિવ યુકે VAT વર્કસ્પેસ" : isHi ? "इंटरैक्टिव यूके VAT कार्यक्षेत्र" : "Interactive UK VAT workspace"}
          </p>
          <h2 className="mt-3 text-4xl font-bold leading-tight">
            {isGu ? "સંખ્યાઓ અજમાવી જુઓ, પછી સમીક્ષાના પગલાં અનુસરો." : isHi ? "संख्याओं को आज़माएं, फिर समीक्षा चरणों का पालन करें।" : "Try the numbers, then follow the review steps."}
          </h2>
          <p className="mt-4 text-lg leading-8 text-muted">
            {isGu
              ? "Vet the VAT કેવી રીતે ઇન્વૉઇસ વિગતોને સ્પષ્ટ યુકે VAT સમીક્ષા વર્કફ્લોમાં ફેરવે છે તેનું એક સરળ પૂર્વાવલોકન. આ કેલ્ક્યુલેટર માહિતીપ્રદ છે અને એકાઉન્ટિંગ સલાહનું સ્થાન લેતું નથી."
              : isHi
              ? "Vet the VAT चालान विवरण को एक स्पष्ट यूके VAT समीक्षा वर्कफ़्लो में कैसे बदलता है, इसका एक सरल पूर्वावलोकन। यह कैलकुलेटर सूचनात्मक है और लेखांकन सलाह की जगह नहीं लेता है।"
              : "A simple preview of how Vet the VAT turns invoice details into a clearer UK VAT review workflow. This calculator is informational and does not replace accounting advice."}
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-md bg-brand-50 text-brand-700">
                <Calculator className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold">{isGu ? "VAT કેલ્ક્યુલેટર" : isHi ? "VAT कैलकुलेटर" : "VAT calculator"}</h3>
                <p className="text-sm text-muted">{isGu ? "ચોખ્ખી ઇન્વૉઇસ રકમ પરથી VAT નો અંદાજ લગાવો." : isHi ? "शुद्ध चालान राशि से VAT का अनुमान लगाएं।" : "Estimate VAT from a net invoice amount."}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-ink">
                {isGu ? "ચોખ્ખી રકમ" : isHi ? "शुद्ध राशि" : "Net amount"}
                <input
                  value={netAmount}
                  onChange={(event) => setNetAmount(event.target.value)}
                  inputMode="decimal"
                  className="h-12 rounded-md border border-line bg-white px-3 outline-none"
                  aria-label={isGu ? "ચોખ્ખી રકમ" : isHi ? "शुद्ध राशि" : "Net amount"}
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-ink">
                {isGu ? "VAT દર" : isHi ? "VAT दर" : "VAT rate"}
                <select value={vatRate} onChange={(event) => setVatRate(event.target.value)} className="h-12 rounded-md border border-line bg-white px-3 outline-none" aria-label="VAT rate">
                  <option value="20">{isGu ? "20% પ્રમાણભૂત" : isHi ? "20% मानक" : "20% standard"}</option>
                  <option value="5">{isGu ? "5% ઘટાડેલ" : isHi ? "5% घटाया हुआ" : "5% reduced"}</option>
                  <option value="0">{isGu ? "0% શૂન્ય રેટ કરેલ" : isHi ? "0% शून्य दर" : "0% zero rated"}</option>
                </select>
              </label>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                [isGu ? "ચોખ્ખી" : isHi ? "शुद्ध" : "Net", totals.net],
                ["VAT", totals.vat],
                [isGu ? "કુલ રકમ" : isHi ? "सकल योग" : "Gross", totals.gross]
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-lg border border-line bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label as string}</p>
                  <p className="mt-2 text-xl font-bold">{netAmount.trim() ? formatCurrency(value as number) : "\u2014"}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-md bg-brand-50 text-brand-700">
                <FileCheck2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold">{isGu ? "ઇન્વૉઇસ સમીક્ષા ચેકલિસ્ટ" : isHi ? "चालान समीक्षा चेकलिस्ट" : "Invoice review checklist"}</h3>
                <p className="text-sm text-muted">{checked.length} of {checklist.length} {isGu ? "તપાસ પસંદ કરેલ" : isHi ? "जांच चयनित" : "checks selected"}</p>
              </div>
            </div>
            <div className="mt-6 grid gap-3">
              {checklist.map((item) => {
                const isChecked = checked.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggle(item)}
                    className="flex min-h-12 items-center gap-3 rounded-lg border border-line bg-white px-4 py-3 text-left text-sm font-medium text-ink transition hover:border-brand-500"
                  >
                    <span className={isChecked ? "text-brand-700" : "text-muted"}>
                      <CheckCircle2 className="h-5 w-5" />
                    </span>
                    {item}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        <Card className="mt-5 p-6">
          <div className="flex items-start gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-700">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-bold">{isGu ? "તમારો વર્કફ્લો પસંદ કરો" : isHi ? "अपना कार्यप्रवाह चुनें" : "Choose your workflow"}</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {(Object.keys(audiences) as Array<keyof typeof audiences>).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAudience(key)}
                    className={audience === key ? "h-10 rounded-md bg-ink px-4 text-sm font-semibold text-white" : "h-10 rounded-md border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-brand-500"}
                  >
                    {audiences[key].label}
                  </button>
                ))}
              </div>
              <div className="mt-5 rounded-lg border border-line bg-white p-5">
                <h4 className="font-bold">{activeAudience.title}</h4>
                <p className="mt-2 text-sm leading-6 text-muted">{activeAudience.body}</p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
