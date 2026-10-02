/**
 * Global Upload Manager
 *
 * Manages Mux video uploads outside of any React component lifecycle.
 * Progress and status are dispatched to the Redux store so the
 * AddContentModal (or any component) can read them via useSelector.
 */

import { toast } from "sonner";

import type { AppStore } from "@/store/store";
import {
  addUploadJob,
  updateUploadProgress,
  setUploadProcessing,
  completeUpload,
  failUpload,
} from "@/store/features/upload/upload-slice";

let storeRef: AppStore | null = null;

/** Must be called once from a client component that has access to the store. */
export function initUploadManager(store: AppStore) {
  storeRef = store;
}

function getStore(): AppStore {
  if (!storeRef) {
    throw new Error(
      "Upload manager not initialised. Call initUploadManager(store) first.",
    );
  }
  return storeRef;
}

// ── Active upload map (module-level, never destroyed by React) ───────────

const activeUploads = new Map<
  string,
  { abort?: () => void; courseId: string; videoId?: string }
>();

// ── Beforeunload guard ──────────────────────────────────────────────────

function onBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  e.returnValue =
    "A video upload is still in progress. Are you sure you want to leave?";
  return e.returnValue;
}

function updateBeforeUnloadGuard() {
  if (typeof window === "undefined") return;
  if (activeUploads.size > 0) {
    window.addEventListener("beforeunload", onBeforeUnload);
  } else {
    window.removeEventListener("beforeunload", onBeforeUnload);
  }
}

/** Check whether any uploads are currently in progress. */
export function hasActiveUploads(): boolean {
  return activeUploads.size > 0;
}

// ── Public API ──────────────────────────────────────────────────────────

export type StartUploadParams = {
  file: File;
  courseId: string;
  sectionId: string;
  title: string;
  onVideoCreated?: (videoId: string) => void;
  onReady?: () => void;
};

/**
 * Start a video upload. Returns the clientId **synchronously** so the
 * caller can immediately start tracking the job in the Redux store.
 * The actual network work happens in the background.
 */
export function startGlobalUpload({
  file,
  courseId,
  sectionId,
  title,
  onVideoCreated,
  onReady,
}: StartUploadParams): string {
  const store = getStore();
  const clientId = `upl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  console.log("[UploadManager] Starting upload:", {
    clientId,
    title,
    fileSize: file.size,
  });

  // 1. Register in Redux IMMEDIATELY — callers get the id back right away
  store.dispatch(
    addUploadJob({ id: clientId, filename: file.name, title }),
  );

  // 2. Fire-and-forget the actual async work
  performUpload({
    clientId,
    file,
    courseId,
    sectionId,
    title,
    onVideoCreated,
    onReady,
  });

  return clientId;
}

// ── Internal async upload logic ─────────────────────────────────────────

async function performUpload({
  clientId,
  file,
  courseId,
  sectionId,
  title,
  onVideoCreated,
  onReady,
}: StartUploadParams & { clientId: string }) {
  const store = getStore();

  try {
    // Get Mux direct-upload URL from our API
    const res = await fetch(`/api/courses/${courseId}/videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, sectionId }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to create upload");
    }

    const { uploadUrl, video: serverVideo } = await res.json();
    const videoId: string = serverVideo._id;
    console.log("[UploadManager] Got upload URL, videoId:", videoId);
    onVideoCreated?.(videoId);

    activeUploads.set(clientId, { courseId, videoId });
    updateBeforeUnloadGuard();

    await uploadFileToMux({
      uploadUrl,
      file,
      onProgress: (progress) => {
        console.log("[UploadManager] Progress:", progress + "%");
        store.dispatch(updateUploadProgress({ id: clientId, progress }));
      },
      onAbortReady: (abort) => {
        activeUploads.set(clientId, { courseId, videoId, abort });
      },
    });

    console.log("[UploadManager] Upload to Mux complete, polling status…");
    store.dispatch(setUploadProcessing(clientId));
    toast.success(`"${title}" uploaded — processing…`);
    pollVideoStatus({ clientId, courseId, videoId, onReady });
  } catch (err) {
    console.error("[UploadManager] Upload error:", err);
    store.dispatch(
      failUpload({
        id: clientId,
        error: err instanceof Error ? err.message : "Upload failed",
      }),
    );
    toast.error(err instanceof Error ? err.message : "Upload failed");
    activeUploads.delete(clientId);
    updateBeforeUnloadGuard();
  }
}

async function uploadFileToMux({
  uploadUrl,
  file,
  onProgress,
  onAbortReady,
}: {
  uploadUrl: string;
  file: File;
  onProgress: (progress: number) => void;
  onAbortReady: (abort: () => void) => void;
}) {
  // Loaded on first use: the upload manager starts on every page.
  const UpChunk = await import("@mux/upchunk");
  return new Promise<void>((resolve, reject) => {
    const upload = UpChunk.createUpload({
      endpoint: uploadUrl,
      file,
      chunkSize: 5120,
      dynamicChunkSize: true,
      useLargeFileWorkaround: true,
    });

    onAbortReady(() => upload.abort());

    upload.on("progress", (event) => {
      onProgress(Math.max(0, Math.min(100, Math.round(Number(event.detail) || 0))));
    });
    upload.on("success", () => resolve());
    upload.on("error", (event) => {
      const detail = event.detail as { message?: string } | undefined;
      reject(new Error(detail?.message || "Network error during upload."));
    });
  });
}

// ── Poll Mux asset status until READY ───────────────────────────────────

function pollVideoStatus({
  clientId,
  courseId,
  videoId,
  onReady,
}: {
  clientId: string;
  courseId: string;
  videoId: string;
  onReady?: () => void;
}) {
  const store = getStore();
  const maxAttempts = 120;
  let attempts = 0;

  const check = async () => {
    attempts++;
    try {
      const res = await fetch(
        `/api/courses/${courseId}/videos/${videoId}/status`,
      );
      const data = await res.json();

      if (data.status === "READY") {
        store.dispatch(completeUpload(clientId));
        toast.success("Video is ready!");
        activeUploads.delete(clientId);
        updateBeforeUnloadGuard();
        onReady?.();
        return;
      }

      if (data.status === "ERRORED") {
        store.dispatch(
          failUpload({ id: clientId, error: "Video processing failed" }),
        );
        toast.error("Video processing failed.");
        activeUploads.delete(clientId);
        updateBeforeUnloadGuard();
        return;
      }

      if (attempts < maxAttempts) {
        setTimeout(check, 5000);
      }
    } catch {
      if (attempts < maxAttempts) {
        setTimeout(check, 5000);
      }
    }
  };

  setTimeout(check, 3000);
}
