/**
 * General-Purpose File Upload Manager
 *
 * Manages file uploads outside of any React component lifecycle.
 * Unlike the chat-upload-manager (which is tied to chat messages/Redux),
 * this is a generic fire-and-forget uploader for any feature (notes, profile, etc.).
 *
 * Upload routing:
 *  - Images → Cloudinary via /api/upload
 *  - Docs   → R2 via presigned URL (/api/upload/presign)
 *
 * Progress is exposed via the same event-emitter pattern used by the
 * GlobalUploadToast, so uploads show in the floating progress indicator.
 */

import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────

export type GeneralUploadStatus =
  | "compressing"
  | "uploading"
  | "done"
  | "error";

export type GeneralUploadJob = {
  id: string;
  /** Human-readable label shown in the progress toast */
  label: string;
  /** The type of file being uploaded */
  fileType: "image" | "raw";
  /** Original filename */
  filename: string;
  /** Upload progress 0–100 */
  progress: number;
  /** Current status */
  status: GeneralUploadStatus;
  /** Error message if status === 'error' */
  error?: string;
};

type GeneralUploadListener = (jobs: GeneralUploadJob[]) => void;

// ── Module state ───────────────────────────────────────────────────────────

const jobs = new Map<string, GeneralUploadJob>();
const listeners = new Set<GeneralUploadListener>();

// ── Listeners ──────────────────────────────────────────────────────────────

export function subscribeToGeneralUploads(listener: GeneralUploadListener) {
  listeners.add(listener);
  listener(Array.from(jobs.values()));
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  const snapshot = Array.from(jobs.values());
  listeners.forEach((fn) => fn(snapshot));
}

function updateJob(id: string, updates: Partial<GeneralUploadJob>) {
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

export type StartGeneralUploadParams = {
  file: File;
  /** Label shown in the floating progress toast (e.g. "Note: Physics Ch1") */
  label: string;
  /** Override auto-detected file type */
  fileType?: "image" | "raw";
  /** R2 folder for document uploads (default: "uploads") */
  folder?: string;
  /** Called with the final URL when upload completes */
  onComplete?: (url: string) => void;
  /** Called on error */
  onError?: (error: string) => void;
};

/**
 * Start a background file upload. Returns the job ID immediately.
 * The dialog/UI can close right away — progress shows in the global toast.
 */
export function startGeneralUpload(params: StartGeneralUploadParams): string {
  const jobId = `gen_upl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const isImage =
    params.fileType === "image" ||
    (!params.fileType && params.file.type.startsWith("image/"));

  const job: GeneralUploadJob = {
    id: jobId,
    label: params.label,
    fileType: isImage ? "image" : "raw",
    filename: params.file.name,
    progress: 0,
    status: "uploading",
  };

  jobs.set(jobId, job);
  notifyListeners();
  updateBeforeUnloadGuard();

  performGeneralUpload(jobId, params, isImage).catch((err) => {
    console.error("[GeneralUploadManager] Unhandled error:", err);
  });

  return jobId;
}

/** Check if there are any active general uploads */
export function hasActiveGeneralUploads(): boolean {
  return Array.from(jobs.values()).some(
    (j) => j.status !== "done" && j.status !== "error",
  );
}

/** Get all current upload jobs */
export function getGeneralUploadJobs(): GeneralUploadJob[] {
  return Array.from(jobs.values());
}

/** Clear a completed/errored job from the list */
export function clearGeneralUploadJob(jobId: string) {
  jobs.delete(jobId);
  notifyListeners();
  updateBeforeUnloadGuard();
}

// ── Internal async upload logic ───────────────────────────────────────────

async function performGeneralUpload(
  jobId: string,
  params: StartGeneralUploadParams,
  isImage: boolean,
) {
  try {
    let uploadedUrl: string;

    if (isImage) {
      uploadedUrl = await uploadImageViaCloudinary(jobId, params.file);
    } else {
      uploadedUrl = await uploadDocViaR2(jobId, params.file, params.folder);
    }

    updateJob(jobId, { status: "done", progress: 100 });
    toast.success(`"${params.label}" uploaded successfully!`);
    params.onComplete?.(uploadedUrl);

    // Auto-clear completed jobs after a delay
    setTimeout(() => clearGeneralUploadJob(jobId), 5000);
  } catch (error) {
    console.error("[GeneralUploadManager] Upload error:", error);
    const errMsg =
      error instanceof Error ? error.message : "Upload failed";

    updateJob(jobId, { status: "error", error: errMsg });
    toast.error(errMsg);
    params.onError?.(errMsg);
  } finally {
    updateBeforeUnloadGuard();
  }
}

// ── Image upload via Cloudinary ───────────────────────────────────────────

async function uploadImageViaCloudinary(
  jobId: string,
  file: File,
): Promise<string> {
  let fileToUpload = file;

  // Compress images (not GIFs)
  if (!file.type.includes("gif")) {
    try {
      updateJob(jobId, { status: "compressing" });
      // Loaded on first use: the upload managers start on every page.
      const { default: imageCompression } = await import("browser-image-compression");
      fileToUpload = await imageCompression(file, {
        maxSizeMB: 5,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      });
    } catch (err) {
      console.error("Image compression failed:", err);
    }
  }

  updateJob(jobId, { status: "uploading" });

  const formData = new FormData();
  formData.append("file", fileToUpload);

  const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
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
          reject(new Error(data.error || `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Network error during image upload."));
    });

    xhr.open("POST", "/api/upload", true);
    xhr.withCredentials = true;
    xhr.send(formData);
  });

  return result.secure_url;
}

// ── Document upload via R2 presigned URL ──────────────────────────────────

async function uploadDocViaR2(
  jobId: string,
  file: File,
  folder?: string,
): Promise<string> {
  updateJob(jobId, { status: "uploading" });

  // 1. Get presigned URL
  const presignRes = await fetch("/api/upload/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      fileSize: file.size,
      folder: folder || "documents",
    }),
  });

  if (!presignRes.ok) {
    const data = (await presignRes.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(data.error || "Failed to prepare upload.");
  }

  const { uploadUrl, publicUrl } = await presignRes.json();

  // 2. PUT directly to R2
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
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Network error during upload."));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload cancelled."));
    });

    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );
    xhr.send(file);
  });

  return publicUrl;
}
