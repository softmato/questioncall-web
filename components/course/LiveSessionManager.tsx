"use client";
import { formatDuration } from "@/lib/duration";


import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BellIcon,
  CalendarDaysIcon,
  Clock3Icon,
  ExternalLinkIcon,
  MegaphoneIcon,
  PlusIcon,
  TimerResetIcon,
  VideoIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type LiveSessionData = {
  _id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number | null;
  status: string;
  zoomLink: string | null;
  notificationsSent: boolean;
  recordingUrl: string | null;
};

type LiveSessionManagerProps = {
  courseId: string;
  courseSlug: string;
  liveSessions: LiveSessionData[];
  canAddLive: boolean;
  onSessionUpdate: (sessions: LiveSessionData[]) => void;
};

export function LiveSessionManager({
  courseId,
  courseSlug,
  liveSessions,
  canAddLive,
  onSessionUpdate,
}: LiveSessionManagerProps) {
  const router = useRouter();
  const [sessions, setSessions] = useState(liveSessions);
  const [isWorking, setIsWorking] = useState(false);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newSession, setNewSession] = useState({
    title: "",
    scheduledAt: "",
    durationMinutes: "",
    zoomLink: "",
  });

  const [sessionToNotify, setSessionToNotify] = useState<string | null>(null);
  const [sessionToEnd, setSessionToEnd] = useState<string | null>(null);
  const [sessionToRecord, setSessionToRecord] = useState<string | null>(null);
  const [recordingMethod, setRecordingMethod] = useState<"UPLOAD" | "ZOOM_LINK" | "ZOOM_API">("UPLOAD");
  const [recordingUrl, setRecordingUrl] = useState("");

  async function createSession() {
    if (!newSession.title.trim() || !newSession.scheduledAt) return;
    setIsWorking(true);
    try {
      const response = await fetch(`/api/courses/${courseId}/live-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newSession.title.trim(),
          scheduledAt: newSession.scheduledAt,
          durationMinutes: newSession.durationMinutes
            ? Number(newSession.durationMinutes)
            : null,
          zoomLink: newSession.zoomLink.trim() || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create session");

      setSessions((prev) => [
        ...prev,
        {
          _id: data._id,
          title: newSession.title.trim(),
          scheduledAt: newSession.scheduledAt,
          durationMinutes: newSession.durationMinutes
            ? Number(newSession.durationMinutes)
            : null,
          status: "SCHEDULED",
          zoomLink: newSession.zoomLink.trim() || null,
          notificationsSent: false,
          recordingUrl: null,
        },
      ]);
      setShowAddDialog(false);
      setNewSession({ title: "", scheduledAt: "", durationMinutes: "", zoomLink: "" });
      toast.success("Session scheduled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create session.");
    } finally {
      setIsWorking(false);
    }
  }

  async function sendNotifications(sessionId: string) {
    setIsWorking(true);
    try {
      const response = await fetch(
        `/api/courses/${courseId}/live-sessions/${sessionId}/notify`,
        { method: "POST" },
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to send notifications");

      setSessions((prev) =>
        prev.map((s) =>
          s._id === sessionId ? { ...s, notificationsSent: true } : s,
        ),
      );
      toast.success(`Invites sent to ${data.sent} students.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send notifications.",
      );
    } finally {
      setIsWorking(false);
      setSessionToNotify(null);
    }
  }

  async function endSession(sessionId: string) {
    setIsWorking(true);
    try {
      const response = await fetch(
        `/api/courses/${courseId}/live-sessions/${sessionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ENDED" }),
        },
      );

      if (!response.ok) throw new Error("Failed to end session");

      setSessions((prev) =>
        prev.map((s) => (s._id === sessionId ? { ...s, status: "ENDED" } : s)),
      );
      setSessionToEnd(null);
      toast.success("Session ended.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to end session.");
    } finally {
      setIsWorking(false);
    }
  }

  async function addRecording(sessionId: string) {
    setIsWorking(true);
    try {
      const response = await fetch(
        `/api/courses/${courseId}/live-sessions/${sessionId}/recording`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: recordingMethod,
            ...(recordingMethod === "ZOOM_LINK" && { recordingUrl }),
          }),
        },
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to add recording");

      setSessions((prev) =>
        prev.map((s) =>
          s._id === sessionId
            ? {
                ...s,
                recordingUrl: data.recordingUrl || data.courseVideo?.videoUrl,
              }
            : s,
        ),
      );
      setSessionToRecord(null);
      setRecordingUrl("");
      toast.success("Recording added.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add recording.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "SCHEDULED":
        return <Badge variant="outline">Scheduled</Badge>;
      case "LIVE":
        return <Badge className="bg-green-600">Live now</Badge>;
      case "ENDED":
        return <Badge variant="secondary">Ended</Badge>;
      case "CANCELLED":
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Live sessions</h2>
        {canAddLive && (
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <PlusIcon className="size-4" />Schedule session
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Schedule live session</DialogTitle>
                <DialogDescription>
                  Set up a live class for your students.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Session title *</Label>
                  <Input
                    value={newSession.title}
                    onChange={(e) =>
                      setNewSession((prev) => ({ ...prev, title: e.target.value }))
                    }
                    placeholder="e.g. Q&A Session"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Scheduled time *</Label>
                  <Input
                    type="datetime-local"
                    value={newSession.scheduledAt}
                    onChange={(e) =>
                      setNewSession((prev) => ({ ...prev, scheduledAt: e.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Duration (minutes)</Label>
                    <Input
                      type="number"
                      value={newSession.durationMinutes}
                      onChange={(e) =>
                        setNewSession((prev) => ({
                          ...prev,
                          durationMinutes: e.target.value,
                        }))
                      }
                      placeholder="60"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Zoom link</Label>
                    <Input
                      value={newSession.zoomLink}
                      onChange={(e) =>
                        setNewSession((prev) => ({ ...prev, zoomLink: e.target.value }))
                      }
                      placeholder="https://zoom.us/..."
                    />
                  </div>
                </div>
                <Button
                  onClick={createSession}
                  disabled={isWorking || !newSession.title.trim() || !newSession.scheduledAt}
                  className="w-full"
                >
                  Schedule session
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!canAddLive ? (
        <div className="rounded-3xl border border-dashed border-border bg-background p-10 text-center text-sm text-muted-foreground">
          Live sessions are not available for free courses.
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-background p-10 text-center text-sm text-muted-foreground">
          No live sessions yet. Schedule one to engage with your students.
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <Card key={session._id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-foreground">{session.title}</div>
                      {getStatusBadge(session.status)}
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <CalendarDaysIcon className="size-3.5" />
                        {new Date(session.scheduledAt).toLocaleString()}
                      </div>
                      {session.durationMinutes && (
                        <div className="flex items-center gap-1">
                          <Clock3Icon className="size-3.5" />
                          {formatDuration(session.durationMinutes)}
                        </div>
                      )}
                    </div>
                    {session.zoomLink && (
                      <div className="flex items-center gap-2 pt-1">
                        <ExternalLinkIcon className="size-3.5 text-muted-foreground" />
                        <a
                          href={session.zoomLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          Join link
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {session.status === "SCHEDULED" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSessionToNotify(session._id)}
                        >
                          <MegaphoneIcon className="size-4" />Notify
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSessionToEnd(session._id)}
                        >
                          <TimerResetIcon className="size-4" />End
                        </Button>
                      </>
                    )}
                    {session.status === "ENDED" && !session.recordingUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSessionToRecord(session._id)}
                      >
                        <VideoIcon className="size-4" />Add recording
                      </Button>
                    )}
                    {session.recordingUrl && (
                      <Badge variant="secondary">Recording available</Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!sessionToNotify} onOpenChange={() => setSessionToNotify(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send session invites</DialogTitle>
            <DialogDescription>
              Send email and WhatsApp notifications to all enrolled students.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSessionToNotify(null)} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={() => sessionToNotify && sendNotifications(sessionToNotify)}
              disabled={isWorking}
              className="flex-1"
            >
              Send invites
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!sessionToEnd} onOpenChange={() => setSessionToEnd(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End this session?</DialogTitle>
            <DialogDescription>
              Once ended, you can add a recording for students to watch later.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSessionToEnd(null)} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => sessionToEnd && endSession(sessionToEnd)}
              disabled={isWorking}
              className="flex-1"
            >
              End session
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!sessionToRecord} onOpenChange={() => setSessionToRecord(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add recording</DialogTitle>
            <DialogDescription>
              Upload a recording file, paste a Zoom link, or fetch from Zoom API.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Method</Label>
              <div className="flex gap-2">
                {(["UPLOAD", "ZOOM_LINK", "ZOOM_API"] as const).map((method) => (
                  <Button
                    key={method}
                    variant={recordingMethod === method ? "default" : "outline"}
                    size="sm"
                    onClick={() => setRecordingMethod(method)}
                  >
                    {method === "UPLOAD"
                      ? "Upload"
                      : method === "ZOOM_LINK"
                        ? "Zoom link"
                        : "Zoom API"}
                  </Button>
                ))}
              </div>
            </div>
            {recordingMethod === "ZOOM_LINK" && (
              <div className="space-y-2">
                <Label>Recording URL</Label>
                <Input
                  value={recordingUrl}
                  onChange={(e) => setRecordingUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSessionToRecord(null)} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={() => sessionToRecord && addRecording(sessionToRecord)}
                disabled={isWorking || (recordingMethod === "ZOOM_LINK" && !recordingUrl.trim())}
                className="flex-1"
              >
                Add recording
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}