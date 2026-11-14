"use client";

import { PublicShell } from "@/components/public-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocale } from "@/components/locale-provider";

export function SimplePublicPage({ eyebrow, title, description, sections, cta = true }: { eyebrow: string; title: string; description: string; sections: { title: string; body: string }[]; cta?: boolean }) {
  const { locale, t } = useLocale();
  const isGu = locale === "gu-IN";
  const isHi = locale === "hi-IN";

  return (
    <PublicShell>
      <main>
        <section className="bg-wash py-16">
          <div className="container-page">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-brand-700">{eyebrow}</p>
            <h1 className="mt-4 max-w-3xl text-5xl font-bold leading-tight text-ink">{title}</h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-muted">{description}</p>
            {cta ? (
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href="/mobile-app">{isGu ? "મોબાઇલ એપ જુઓ" : isHi ? "मोबाइल ऐप देखें" : "Explore the mobile app"}</ButtonLink>
                <ButtonLink href="/product" variant="outline">{isGu ? "ઉત્પાદન જુઓ" : isHi ? "उत्पाद देखें" : "Explore the product"}</ButtonLink>
              </div>
            ) : null}
          </div>
        </section>
        <section className="py-16">
          <div className="container-page grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sections.map((section) => (
              <Card key={section.title} className="p-6">
                <h2 className="text-xl font-bold">{section.title}</h2>
                <p className="mt-3 text-sm leading-6 text-muted">{section.body}</p>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
