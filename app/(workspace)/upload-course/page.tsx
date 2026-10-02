import { redirect } from "next/navigation";

import { getSafeServerSession } from "@/lib/auth";
import { createNoIndexMetadata } from "@/lib/seo";

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = createNoIndexMetadata({
  title: "Upload Course",
  description: "Create and upload new courses for QuestionCall learners.",
});

export default async function UploadCoursePage() {
  const session = await getSafeServerSession();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  if (session.user.role === "STUDENT") {
    redirect("/courses");
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Course Upload</h1>
      <p className="text-neutral-500 mt-2">This feature is under development.</p>
    </div>
  );
}
