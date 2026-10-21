import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Delete your QuestionCall account",
  description:
    "How to request deletion of your QuestionCall account and associated data.",
  path: "/delete-account",
});

export default function DeleteAccountPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-bold">Delete your QuestionCall account</h1>

      <h2 className="mt-8 text-xl font-semibold">In the app</h2>
      <ol className="mt-2 list-decimal space-y-1 pl-6">
        <li>Open QuestionCall and sign in.</li>
        <li>Go to Menu, then Settings, then Delete Account.</li>
        <li>Confirm the deletion.</li>
      </ol>

      <h2 className="mt-8 text-xl font-semibold">Can&apos;t sign in?</h2>
      <p className="mt-2">
        Email{" "}
        <a className="underline" href="mailto:support@questioncall.com?subject=Delete%20my%20account">
          support@questioncall.com
        </a>{" "}
        from the address registered on your account and ask us to delete it.
      </p>

      <h2 className="mt-8 text-xl font-semibold">What happens to your data</h2>
      <ul className="mt-2 list-disc space-y-1 pl-6">
        <li>Your account is deactivated immediately. You can recover it by signing in within 30 days.</li>
        <li>After 30 days your name, email, password, profile photo, bio, interests and payout number are permanently removed.</li>
        <li>Questions, answers and course content you posted may remain in anonymized form, with no link to you.</li>
        <li>Payment and transaction records may be kept as required by law.</li>
      </ul>
    </main>
  );
}
