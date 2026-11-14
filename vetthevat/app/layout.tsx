import {publicSiteOrigin} from "@/lib/site-origin";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast-provider";
import { LocaleProvider } from "@/components/locale-provider";
import { GlobalLanguageSwitcher } from "@/components/global-language-switcher";

const marketingOrigin = publicSiteOrigin();

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0f7a3a"
};

export const metadata: Metadata = {
  metadataBase: marketingOrigin ? new URL(marketingOrigin) : undefined,
  title: {
    default: "VET THE VAT | AI-Powered VAT & Invoicing Platform for UK Business",
    template: "%s | VET THE VAT"
  },
  description: "Automate invoice extraction, UK VAT reconciliation, HMRC compliance reviews, and supplier price intelligence with VET THE VAT.",
  keywords: [
    "VAT management",
    "UK VAT reconciliation",
    "invoice OCR",
    "Making Tax Digital",
    "supplier price comparison",
    "ORS order requisition system",
    "SaaS invoicing software",
    "HMRC VAT returns",
    "invoice audit"
  ],
  authors: [{ name: "VET THE VAT" }],
  creator: "VET THE VAT",
  publisher: "VET THE VAT",
  formatDetection: {
    email: false,
    address: false,
    telephone: false
  },
  openGraph: {
    title: "VET THE VAT | AI-Powered VAT & Invoicing Platform for UK Business",
    description: "Automate invoice extraction, UK VAT reconciliation, HMRC compliance reviews, and supplier price intelligence with VET THE VAT.",
    url: marketingOrigin,
    siteName: "VET THE VAT",
    type: "website",
    locale: "en_GB"
  },
  twitter: {
    card: "summary_large_image",
    title: "VET THE VAT | VAT & Invoicing Made Simpler",
    description: "Automate invoice extraction, UK VAT reconciliation, and supplier price intelligence."
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1
    }
  },
  alternates: marketingOrigin ? { canonical: "/" } : undefined,
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg"
  }
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${marketingOrigin || "https://vetthevat.com"}/#organization`,
      "name": "VET THE VAT",
      "url": marketingOrigin || "https://vetthevat.com",
      "logo": `${marketingOrigin || "https://vetthevat.com"}/favicon.svg`,
      "description": "SaaS VAT compliance, invoice processing, and order requisition intelligence platform."
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${marketingOrigin || "https://vetthevat.com"}/#software`,
      "name": "VET THE VAT",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web",
      "offers": {
        "@type": "Offer",
        "price": "15.00",
        "priceCurrency": "GBP"
      },
      "description": "Smart UK VAT compliance and invoice reconciliation SaaS with supplier price analytics."
    }
  ]
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body suppressHydrationWarning>
        <div id="google_translate_element" style={{ display: "none" }} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              function googleTranslateElementInit() {
                if (window.google && window.google.translate) {
                  new window.google.translate.TranslateElement({
                    pageLanguage: 'en',
                    includedLanguages: 'gu,hi,es,ar,fr,de,pt,it,pl,ur,pa,en',
                    autoDisplay: false
                  }, 'google_translate_element');
                }
              }
            `
          }}
        />
        <script
          src="https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"
          async
        />
        <LocaleProvider><ToastProvider>{children}</ToastProvider><GlobalLanguageSwitcher /></LocaleProvider>
      </body>
    </html>
  );
}
