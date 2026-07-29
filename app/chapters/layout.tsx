import { getSafeServerSession } from "@/lib/auth";
import { CourseHeader } from "@/components/course/CourseHeader";
import { isCheckoutRequest } from "@/lib/checkout-host.server";

export default async function ChaptersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, isCheckout] = await Promise.all([
    getSafeServerSession(),
    isCheckoutRequest(),
  ]);

  const user = session?.user
    ? { name: session.user.name, role: session.user.role }
    : null;

  return (
    <div className="min-h-svh bg-[#f6f8fb] dark:bg-background">
      {/* Mirrors the courses layout: the checkout subdomain hides the web nav. */}
      {isCheckout ? null : <CourseHeader user={user} />}
      {children}
    </div>
  );
}
