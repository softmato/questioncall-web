import { ChatLayout } from "@/components/shared/chat-layout";
import { createNoIndexMetadata } from "@/lib/seo";
import { MessageSquare } from "lucide-react";

export const metadata = createNoIndexMetadata({
  title: "Messages",
  description: "View your QuestionCall conversations and active channels.",
});

export default function MessagesPage() {
  return (
    <ChatLayout>
      <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-muted/30 mb-6">
          <MessageSquare className="h-10 w-10 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-semibold text-foreground">Your Messages</h3>
        <p className="mt-2 max-w-sm">
          Select a channel from the list to view your conversation or continue a session.
        </p>
      </div>
    </ChatLayout>
  );
}
