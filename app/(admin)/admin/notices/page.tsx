import { Metadata } from "next";
import { NoticeClient } from "./notice-client";

export const metadata: Metadata = {
  title: "Notices | Admin | QuestionCall",
  description: "Create and manage global notices",
};

export default function NoticesPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Notices</h2>
      </div>
      <NoticeClient />
    </div>
  );
}
