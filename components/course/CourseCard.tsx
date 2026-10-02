import Link from "next/link";
import { formatDuration } from "@/lib/duration";
import { BookOpenIcon, Clock3Icon, Users2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type CourseCardProps = {
  slug: string;
  title: string;
  description?: string;
  subject: string;
  level: string;
  instructorName: string;
  instructorRole: string;
  pricingModel: "FREE" | "SUBSCRIPTION_INCLUDED" | "PAID";
  price?: number | null;
  totalDurationMinutes: number;
  enrollmentCount: number;
  thumbnailUrl?: string | null;
  overallProgressPercent?: number;
};

function getPricingLabel(pricingModel: CourseCardProps["pricingModel"], price?: number | null) {
  if (pricingModel === "FREE") {
    return "Free";
  }

  if (pricingModel === "SUBSCRIPTION_INCLUDED") {
    return "Subscription";
  }

  return `NPR ${Number(price || 0).toFixed(0)}`;
}

function getPricingColor(pricingModel: CourseCardProps["pricingModel"]) {
  if (pricingModel === "FREE") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800";
  }
  if (pricingModel === "SUBSCRIPTION_INCLUDED") {
    return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border-blue-200 dark:border-blue-800";
  }
  return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800";
}

export function CourseCard({
  slug,
  title,
  description,
  subject,
  level,
  instructorName,
  instructorRole,
  pricingModel,
  price,
  totalDurationMinutes,
  enrollmentCount,
  thumbnailUrl,
  overallProgressPercent,
}: CourseCardProps) {
  return (
    <Card className="group h-full overflow-hidden border-border/80 bg-background/95 shadow-sm transition-all duration-300 hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/10 hover:-translate-y-1">
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.25),_transparent_55%),linear-gradient(135deg,_rgba(15,23,42,0.95),_rgba(17,75,95,0.95))] text-white">
            <BookOpenIcon className="size-10 transition-transform duration-300 group-hover:scale-110" />
          </div>
        )}
        <div className="absolute left-3 right-3 top-3 flex flex-wrap gap-2">
          <Badge className={getPricingColor(pricingModel)}>{getPricingLabel(pricingModel, price)}</Badge>
          <Badge variant="outline" className="max-w-full bg-background/80 backdrop-blur">
            {subject}
          </Badge>
        </div>
      </div>

      <CardHeader className="gap-2">
        <CardTitle className="line-clamp-2 text-base font-semibold transition-colors group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
          {title}
        </CardTitle>
        <div className="line-clamp-2 text-xs text-muted-foreground">
          {instructorName} · {instructorRole}
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <span>{level}</span>
        </div>
      </CardHeader>

      {description && (
        <CardContent className="pt-0">
          <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>
        </CardContent>
      )}

      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <div className="inline-flex items-center gap-1">
            <Clock3Icon className="size-3.5" />
            <span>{formatDuration(totalDurationMinutes)}</span>
          </div>
          <div className="inline-flex items-center gap-1">
            <Users2Icon className="size-3.5" />
            <span>{enrollmentCount} enrolled</span>
          </div>
        </div>

        {typeof overallProgressPercent === "number" ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Your progress</span>
              <span>{Math.round(overallProgressPercent)}%</span>
            </div>
            <Progress value={overallProgressPercent} className="h-1.5" />
          </div>
        ) : null}
      </CardContent>

      <CardFooter>
        <Button asChild className="w-full" size="lg">
          <Link href={`/courses/${slug}`}>
            {typeof overallProgressPercent === "number" ? "Continue" : "Open course"}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
