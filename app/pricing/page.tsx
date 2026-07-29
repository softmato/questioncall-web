import Link from "next/link";
import { CheckIcon } from "lucide-react";

import { getSafeServerSession } from "@/lib/auth";
import { CourseHeader } from "@/components/course/CourseHeader";
import { APP_NAME } from "@/lib/constants";
import { serializeJsonLd } from "@/lib/json-ld";
import { absoluteUrl, createPageMetadata } from "@/lib/seo";
import { getHydratedPlans, getPlatformConfig } from "@/models/PlatformConfig";
import { cn } from "@/lib/utils";

export const metadata = createPageMetadata({
  title: "Subscription Plans & Pricing",
  description:
    "Compare Question Call subscription plans. Ask questions to expert teachers, unlock subscription courses, and play premium quizzes. Start free.",
  path: "/pricing",
  keywords: [
    "Question Call subscription",
    "Question Call pricing",
    "online tuition plans Nepal",
    "student subscription Nepal",
  ],
});

export default async function PricingPage() {
  const [session, config] = await Promise.all([
    getSafeServerSession(),
    getPlatformConfig(),
  ]);

  // Prices come from the live platform config, so the public page never drifts
  // from what checkout actually charges.
  const plans = getHydratedPlans(config);

  const user = session?.user
    ? { name: session.user.name, role: session.user.role }
    : null;

  const offersStructuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${APP_NAME} Subscription`,
    description:
      "Subscription plans for students: ask expert teachers, unlock courses, and play premium quizzes.",
    url: absoluteUrl("/pricing"),
    brand: { "@type": "Brand", name: APP_NAME },
    offers: plans.map((plan) => ({
      "@type": "Offer",
      name: plan.name,
      price: plan.price,
      priceCurrency: "NPR",
      url: absoluteUrl("/pricing"),
      availability: "https://schema.org/InStock",
    })),
  };

  return (
    <div className="min-h-svh bg-[#f6f8fb] dark:bg-background">
      <CourseHeader user={user} />
      <script
        id="pricing-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(offersStructuredData),
        }}
      />

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
            Pricing
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground">
            Plans that grow with your studies
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            Start free, then upgrade when you need more questions, more premium
            quizzes, and access to subscription courses.
          </p>
        </header>

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.slug}
              className={cn(
                "flex flex-col rounded-3xl border bg-background p-6 shadow-sm",
                plan.highlight
                  ? "border-primary ring-1 ring-primary"
                  : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className={cn("text-lg font-bold", plan.titleClass)}>
                  {plan.name}
                </h2>
                {plan.badge ? (
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    {plan.badge}
                  </span>
                ) : null}
              </div>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-foreground">
                  {plan.price === 0 ? "Free" : `Rs. ${plan.price}`}
                </span>
                {plan.originalPrice ? (
                  <span className="text-sm text-muted-foreground line-through">
                    Rs. {plan.originalPrice}
                  </span>
                ) : null}
                {plan.suffix ? (
                  <span className="text-sm text-muted-foreground">
                    {plan.suffix}
                  </span>
                ) : null}
              </div>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={
                  session?.user
                    ? `/subscription/checkout?plan=${plan.slug}`
                    : "/auth/signup/student"
                }
                className={cn(
                  "mt-8 inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition-opacity",
                  plan.highlight
                    ? "bg-primary text-primary-foreground hover:opacity-90"
                    : "border border-border text-foreground hover:bg-muted",
                )}
              >
                {plan.price === 0 ? "Start free" : `Choose ${plan.name}`}
              </Link>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-14 max-w-3xl text-center text-sm text-muted-foreground">
          Not ready to subscribe? Browse{" "}
          <Link href="/courses" className="font-semibold text-primary underline">
            free courses
          </Link>{" "}
          and{" "}
          <Link href="/chapters" className="font-semibold text-primary underline">
            chapters with free preview lessons
          </Link>{" "}
          — no account needed to watch the previews.
        </div>
      </div>
    </div>
  );
}
