/**
 * Global Chat Upload Manager
 *
 * Manages file uploads for chat messages outside of any React component
 * lifecycle. This allows users to navigate away from the chat page while
 * uploads continue in the background.
 *
 * Upload routing:
 *  - Videos  → Mux direct upload (client → Mux, bypasses server)
 *  - Audio   → Mux direct upload (client → Mux, for proper playback)
 *  - Images  → Cloudinary via /api/upload
 *  - Docs    → Cloudinary via /api/upload
 *
 * Progress is stored in a simple event emitter pattern so any component
 * (e.g. a global toast) can subscribe to updates.
 */

import { toast } from "sonner";
import type { ChatMessage } from "@/types/channel";

// ── Types ──────────────────────────────────────────────────────────────────

export type ChatUploadStatus =
  | "compressing"
  | "uploading"
  | "processing"
  | "saving"
  | "done"
  | "error";

export type ChatUploadJob = {
  id: string;
  channelId: string;
  /** The type of file being uploaded */
  fileType: "image" | "video" | "audio" | "raw";
  /** Original filename */
  filename: string;
  /** Upload progress 0–100 */
  progress: number;
  /** Current status */
  status: ChatUploadStatus;
  /** Error message if status === 'error' */
  error?: string;
  /** The text content to send with this message */
  textContent?: string;
  /** Temp message ID in the Redux store */
  tempMessageId: string;
  /** Preview URL (blob) for the optimistic message */
  previewUrl?: string;
  /** Duration for video/audio in seconds */
  durationSeconds?: number | null;
};

type ChatUploadListener = (jobs: ChatUploadJob[]) => void;


// ── Module state ───────────────────────────────────────────────────────────

const jobs = new Map<string, ChatUploadJob>();
const listeners = new Set<ChatUploadListener>();
let dispatchFn: ((action: unknown) => void) | null = null;

// Store references to Redux action creators — we'll set these at init
let reduxActions: {
  addMessage: (payload: { channelId: string; message: ChatMessage }) => unknown;
  updateMessage: (payload: {
    channelId: string;
    id: string;
    updates: Partial<ChatMessage>;
  }) => unknown;
  removeMessage: (payload: {
    channelId: string;
    messageId: string;
  }) => unknown;
} | null = null;

// ── Public init ────────────────────────────────────────────────────────────

export function initChatUploadManager(
  dispatch: (action: unknown) => void,
  actions: typeof reduxActions,
) {
  dispatchFn = dispatch;
  reduxActions = actions;
}

// ── Listeners (for UI components like the global toast) ────────────────────

export function subscribeToChatUploads(listener: ChatUploadListener) {
  listeners.add(listener);
  // Immediately emit current state
  listener(Array.from(jobs.values()));
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  const snapshot = Array.from(jobs.values());
  listeners.forEach((fn) => fn(snapshot));
}

function updateJob(id: string, updates: Partial<ChatUploadJob>) {
  const job = jobs.get(id);
  if (!job) return;
  jobs.set(id, { ...job, ...updates });
  notifyListeners();
}

// ── Beforeunload guard ────────────────────────────────────────────────────

function onBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  e.returnValue =
    "A file upload is still in progress. Are you sure you want to leave?";
  return e.returnValue;
}

function updateBeforeUnloadGuard() {
  if (typeof window === "undefined") return;
  const hasActive = Array.from(jobs.values()).some(
    (j) => j.status !== "done" && j.status !== "error",
  );
  if (hasActive) {
    window.addEventListener("beforeunload", onBeforeUnload);
  } else {
    window.removeEventListener("beforeunload", onBeforeUnload);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export type StartChatUploadParams = {
  channelId: string;
  file: File;
  fileType: "image" | "video" | "audio" | "raw";
  textContent?: string;
  userId: string;
  durationSeconds?: number | null;
  maxVideoDurationMinutes?: number;
  previewUrl?: string;
};

/**
 * Start a background upload for a chat message.
 * Returns the job ID immediately. The upload runs in the background.
 */
export function startChatUpload(params: StartChatUploadParams): string {
  const jobId = `chat_upl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tempMessageId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const job: ChatUploadJob = {
    id: jobId,
    channelId: params.channelId,
    fileType: params.fileType,
    filename: params.file.name,
    progress: 0,
    status: "uploading",
    textContent: params.textContent,
    tempMessageId,
    previewUrl: params.previewUrl,
    durationSeconds: params.durationSeconds,
  };

  jobs.set(jobId, job);
  notifyListeners();
  updateBeforeUnloadGuard();

  // Add optimistic message to Redux
  const mediaTypeMap = {
    image: "IMAGE",
    video: "VIDEO",
    audio: "AUDIO",
    raw: "DOCUMENT",
  } as const;

  if (dispatchFn && reduxActions) {
    dispatchFn(
      reduxActions.addMessage({
        channelId: params.channelId,
        message: {
          id: tempMessageId,
          channelId: params.channelId,
          senderId: params.userId,
          senderName: "You",
          content: params.textContent?.trim() || "",
          isOwn: true,
          isSystemMessage: false,
          mediaType: mediaTypeMap[params.fileType],
          mediaUrl: params.previewUrl || null,
          isSending: true,
          isSeen: false,
          isDelivered: false,
          sentAt: new Date().toISOString(),
        },
      }),
    );
  }

  // Fire-and-forget the async work
  performChatUpload(jobId, params, tempMessageId).catch((err) => {
    console.error("[ChatUploadManager] Unhandled error:", err);
  });

  return jobId;
}

/** Check if there are any active chat uploads */
export function hasActiveChatUploads(): boolean {
  return Array.from(jobs.values()).some(
    (j) => j.status !== "done" && j.status !== "error",
  );
}

/** Get all current upload jobs */
export function getChatUploadJobs(): ChatUploadJob[] {
  return Array.from(jobs.values());
}

/** Clear a completed/errored job from the list */
export function clearChatUploadJob(jobId: string) {
  const job = jobs.get(jobId);
  if (job?.previewUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(job.previewUrl);
  }
  jobs.delete(jobId);
  notifyListeners();
  updateBeforeUnloadGuard();
}

// ── Internal async upload logic ───────────────────────────────────────────

async function performChatUpload(
  jobId: string,
  params: StartChatUploadParams,
  tempMessageId: string,
) {
  try {
    let uploadedUrl: string;
    let publicId: string | null = null;

    if (params.fileType === "video" || params.fileType === "audio") {
      // Video/Audio → Mux direct upload
      uploadedUrl = await uploadVideoViaMux(jobId, params);
    } else if (params.fileType === "raw") {
      // Documents (PDF, DOCX, etc.) → R2 presigned upload
      const result = await uploadFileViaR2(jobId, params);
      uploadedUrl = result.url;
    } else {
      // Images → Cloudinary via /api/upload
      const result = await uploadFileViaCloudinary(jobId, params);
      uploadedUrl = result.url;
      publicId = result.publicId;
    }

    // Now save the message to the server
    updateJob(jobId, { status: "saving", progress: 100 });

    const mediaTypeMap = {
      image: "IMAGE",
      video: "VIDEO",
      audio: "AUDIO",
      raw: "DOCUMENT",
    } as const;

    const res = await fetch(
      `/api/channels/${params.channelId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content:
            params.textContent?.trim() ||
            (params.fileType === "raw" ? params.file.name : undefined),
          mediaUrl: uploadedUrl,
          mediaType: mediaTypeMap[params.fileType],
          mediaPublicId: publicId || undefined,
        }),
      },
    );

    if (!res.ok) {
      throw new Error("Failed to send message.");
    }

    const savedMsg = await res.json();

    // Update the optimistic message with the real ID and URL
    if (dispatchFn && reduxActions) {
      dispatchFn(
        reduxActions.updateMessage({
          channelId: params.channelId,
          id: tempMessageId,
          updates: {
            id: savedMsg.id,
            isSending: false,
            isDelivered: true,
            mediaUrl: uploadedUrl,
          },
        }),
      );
    }

    updateJob(jobId, { status: "done", progress: 100 });

    // Auto-clear completed jobs after a delay
    setTimeout(() => clearChatUploadJob(jobId), 5000);
  } catch (error) {
    console.error("[ChatUploadManager] Upload error:", error);
    const errMsg =
      error instanceof Error ? error.message : "Upload failed";

    updateJob(jobId, { status: "error", error: errMsg });

    // Remove the optimistic message
    if (dispatchFn && reduxActions) {
      dispatchFn(
        reduxActions.removeMessage({
          channelId: params.channelId,
          messageId: tempMessageId,
        }),
      );
    }

    toast.error(errMsg);
  } finally {
    updateBeforeUnloadGuard();
  }
}

// ── Video upload via Mux direct ───────────────────────────────────────────

async function uploadVideoViaMux(
  jobId: string,
  params: StartChatUploadParams,
): Promise<string> {
  // 1. Get a direct upload URL from our API
  const signRes = await fetch("/api/chat-upload/video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channelId: params.channelId,
      durationSeconds: params.durationSeconds,
    }),
  });

  if (!signRes.ok) {
    const data = await signRes.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error || "Failed to prepare video upload.",
    );
  }

  const { uploadUrl, uploadId } = await signRes.json();
  // Loaded on first use: the upload managers start on every page.
  const UpChunk = await import("@mux/upchunk");

  // 2. Upload the original file directly to Mux in chunks. This does not
  // compress/transcode the source before Mux receives it.
  await new Promise<void>((resolve, reject) => {
    const upload = UpChunk.createUpload({
      endpoint: uploadUrl,
      file: params.file,
      chunkSize: 5120,
      dynamicChunkSize: true,
      useLargeFileWorkaround: true,
    });

    upload.on("progress", (event) => {
      const pct = Math.max(0, Math.min(100, Math.round(Number(event.detail) || 0)));
      updateJob(jobId, { progress: pct, status: "uploading" });
    });

    upload.on("success", () => resolve());
    upload.on("error", (event) => {
      const detail = event.detail as { message?: string } | undefined;
      reject(new Error(detail?.message || "Network error during video upload."));
    });
  });

  // 3. Poll for the playback URL
  updateJob(jobId, { status: "processing", progress: 100 });

  const playbackUrl = await pollMuxPlaybackUrl(uploadId);
  return playbackUrl;
}

async function pollMuxPlaybackUrl(
  uploadId: string,
  maxAttempts = 120,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, attempt < 5 ? 2000 : 5000));

    try {
      const res = await fetch(
        `/api/chat-upload/video/${uploadId}/status`,
      );
      const data = await res.json();

      if (data.status === "ready" && data.playbackUrl) {
        return data.playbackUrl;
      }

      if (data.status === "errored") {
        throw new Error("Video processing failed on server.");
      }
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === "Video processing failed on server."
      ) {
        throw err;
      }
      // Network error, retry
    }
  }

  throw new Error("Video processing timed out.");
}

// ── Image/Audio/Doc upload via Cloudinary (existing /api/upload) ──────────

async function uploadFileViaCloudinary(
  jobId: string,
  params: StartChatUploadParams,
): Promise<{ url: string; publicId: string | null }> {
  let fileToUpload = params.file;

  // Compress images (not GIFs)
  if (
    params.fileType === "image" &&
    !params.file.type.includes("gif")
  ) {
    try {
      updateJob(jobId, { status: "compressing" });
      const { default: imageCompression } = await import("browser-image-compression");
      fileToUpload = await imageCompression(params.file, {
        maxSizeMB: 5,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      });
    } catch (err) {
      console.error("Image compression failed:", err);
    }
  }

  updateJob(jobId, { status: "uploading" });

  // Upload via XMLHttpRequest for progress tracking
  const formData = new FormData();
  formData.append("file", fileToUpload);

  if (
    params.durationSeconds !== null &&
    params.durationSeconds !== undefined
  ) {
    formData.append(
      "videoDurationSeconds",
      String(params.durationSeconds),
    );
  }

  const result = await new Promise<{
    secure_url: string;
    public_id?: string;
  }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (evt) => {
      if (evt.lengthComputable) {
        const pct = Math.round((evt.loaded / evt.total) * 100);
        updateJob(jobId, { progress: pct });
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Invalid response from upload server."));
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          reject(
            new Error(data.error || `Upload failed with status ${xhr.status}`),
          );
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Network error during file upload."));
    });

    xhr.open("POST", "/api/upload", true);
    xhr.withCredentials = true;
    xhr.send(formData);
  });

  return {
    url: result.secure_url,
    publicId: result.public_id || null,
  };
}

// ── Document upload via R2 presigned URL ──────────────────────────────────

async function uploadFileViaR2(
  jobId: string,
  params: StartChatUploadParams,
): Promise<{ url: string }> {
  updateJob(jobId, { status: "uploading" });

  // 1. Get presigned URL from our server
  const presignRes = await fetch("/api/upload/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: params.file.name,
      contentType: params.file.type || "application/octet-stream",
      fileSize: params.file.size,
      folder: "chat-documents",
    }),
  });

  if (!presignRes.ok) {
    const data = (await presignRes.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(data.error || "Failed to prepare document upload.");
  }

  const { uploadUrl, publicUrl } = await presignRes.json();

  // 2. PUT file directly to R2 via XHR for progress tracking
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (evt) => {
      if (evt.lengthComputable) {
        const pct = Math.round((evt.loaded / evt.total) * 100);
        updateJob(jobId, { progress: pct });
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Document upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Network error during document upload."));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Document upload was cancelled."));
    });

    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader(
      "Content-Type",
      params.file.type || "application/octet-stream",
    );
    xhr.send(params.file);
  });

  return { url: publicUrl };
}
