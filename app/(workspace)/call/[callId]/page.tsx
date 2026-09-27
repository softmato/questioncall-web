"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { useAppSelector } from "@/store/hooks";

/**
 * Target of the incoming-call push (`/call/:id`, the same href the mobile app
 * deep-links). A PWA opened from that notification never saw the Pusher ring,
 * so rebuild the incoming-call overlay from the session, then land the user in
 * the channel underneath it. Used to be a 404.
 */
export default function IncomingCallLinkPage() {
  const params = useParams();
  const callId = params?.callId as string | undefined;
  const router = useRouter();
  const userId = useAppSelector((state) => state.user.id);

  useEffect(() => {
    if (!callId || !userId) return;
    let cancelled = false;

    void (async () => {
      const res = await fetch(`/api/calls/${callId}`).catch(() => null);
      const call = res?.ok ? await res.json().catch(() => null) : null;
      if (cancelled) return;

      if (!call) {
        toast.error("This call is no longer available.");
        router.replace("/");
        return;
      }

      const isRinging = call.status === "RINGING" || call.status === "CREATED";
      if (isRinging && call.callerId && call.callerId !== userId) {
        const callerIsTeacher = call.callerId === call.teacherId;
        window.dispatchEvent(
          new CustomEvent("qc:incoming-call", {
            detail: {
              callSessionId: call.callSessionId,
              channelId: call.channelId,
              callerId: call.callerId,
              callerName:
                (callerIsTeacher ? call.teacherName : call.studentName) || "Someone",
              callerImage:
                (callerIsTeacher ? call.teacherImage : call.studentImage) ?? null,
              mode: call.mode,
            },
          }),
        );
      } else if (call.status !== "ACTIVE") {
        toast.info("That call has already ended.");
      }

      router.replace(`/channel/${call.channelId}`);
    })();

    return () => {
      cancelled = true;
    };
  }, [callId, router, userId]);

  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <Loader2Icon className="size-10 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Opening the call...</p>
    </div>
  );
}
