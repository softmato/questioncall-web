import Link from "next/link";
import { BellIcon, ChevronRightIcon, UserIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { createNoIndexMetadata } from "@/lib/seo";

const settingSections = [
  {
    title: "Profile",
    href: "/settings/profile",
    cta: "Open",
    icon: UserIcon,
  },
  {
    title: "Calls",
    href: "/settings/calls",
    cta: "Open",
    icon: BellIcon,
  },
] as const;

export const dynamic = "force-dynamic";
export const metadata = createNoIndexMetadata({
  title: "Settings",
  description: "Manage your QuestionCall workspace settings and preferences.",
});

export default function SettingsPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {settingSections.map((section) => (
        <Card key={section.title} className="border border-border/70 shadow-sm">
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <section.icon className="size-4 text-primary" />
              {section.title}
            </CardDescription>
            <CardTitle>{section.title}</CardTitle>
          </CardHeader>
          <CardFooter>
            <Button asChild size="sm" className="gap-2">
              <Link href={section.href}>
                {section.cta}
                <ChevronRightIcon className="size-4" />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
