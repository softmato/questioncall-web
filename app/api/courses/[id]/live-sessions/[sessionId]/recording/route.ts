import { minutesFromSeconds, sumDurationMinutes } from "@/lib/duration";
import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { Types } from "mongoose";

import { getSafeServerSession } from "@/lib/auth";
import { checkCourseManagementAccess } from "@/lib/course-access";
import { incrementEnrollmentVideoTotals } from "@/lib/course-progress";
import { connectToDatabase } from "@/lib/mongodb";
import Course from "@/models/Course";
import CourseSection from "@/models/CourseSection";
import CourseVideo from "@/models/CourseVideo";
import LiveSession from "@/models/LiveSession";
import { getPlatformConfig } from "@/models/PlatformConfig";

cloudinary.config({
  secure: true,
});

type UploadedVideoResult = {
  secure_url: string;
  duration: number;
  public_id: string;
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** unitIndex;
  const digits = value >= 10 || unitIndex === 0 ? 0 : 1;

  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function extractUploadLimitBytes(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const match = message.match(/Max:\s*(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function extractUploadedBytes(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const match = message.match(/Got:\s*(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function isCloudinaryTooLargeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /requested resource too large/i.test(message);
}

function parseOptionalDuration(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : NaN;
}

async function uploadRecording(file: File) {
  if (
    !process.env.CLOUDINARY_URL &&
    (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET)
  ) {
    throw new Error("Server missing Cloudinary credentials.");
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  return new Promise<UploadedVideoResult>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "question_hub_live_recordings",
        resource_type: "video",
      },
      (error, result) => {
        if (error || !result?.secure_url || typeof result.duration !== "number" || !result.public_id) {
          reject(error || new Error("Recording upload failed."));
          return;
        }

        resolve({
          secure_url: result.secure_url,
          duration: result.duration,
          public_id: result.public_id,
        });
      },
    );

    stream.end(buffer);
  });
}

async function destroyRecording(publicId: string | null | undefined) {
  if (!publicId) {
    return;
  }

  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: "video",
      invalidate: true,
    });
  } catch (error) {
    console.error("[Cloudinary recording cleanup]", error);
  }
}

async function getZoomAccessToken() {
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  const accountId = process.env.ZOOM_ACCOUNT_ID;

  if (!clientId || !clientSecret || !accountId) {
    throw new Error("Zoom API credentials are not configured.");
  }

  const response = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error("Failed to authenticate with Zoom.");
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Zoom access token missing from response.");
  }

  return data.access_token;
}

async function getZoomRecordingUrl(meetingId: string) {
  const accessToken = await getZoomAccessToken();
  const response = await fetch(
    `https://api.zoom.us/v2/meetings/${meetingId}/recordings`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch Zoom recording.");
  }

  const data = (await response.json()) as {
    share_url?: string;
    recording_files?: Array<{
      file_type?: string;
      play_url?: string;
      download_url?: string;
    }>;
  };

  const preferredFile = data.recording_files?.find(
    (file) => file.file_type === "MP4" && (file.play_url || file.download_url),
  );

  const recordingUrl =
    preferredFile?.play_url ||
    preferredFile?.download_url ||
    data.share_url ||
    null;

  if (!recordingUrl) {
    throw new Error("Zoom recording URL not found.");
  }

  return recordingUrl;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  let uploadedRecordingId: string | null = null;

  try {
    const session = await getSafeServerSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, sessionId } = await params;
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(sessionId)) {
      return NextResponse.json(
        { error: "Invalid course or live session id." },
        { status: 400 },
      );
    }

    const canManage = await checkCourseManagementAccess(session.user.id, id);
    if (!canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await connectToDatabase();

    const [course, liveSession] = await Promise.all([
      Course.findById(id),
      LiveSession.findOne({ _id: sessionId, courseId: id }),
    ]);

    if (!course) {
      return NextResponse.json({ error: "Course not found." }, { status: 404 });
    }

    if (!liveSession) {
      return NextResponse.json({ error: "Live session not found." }, { status: 404 });
    }

    if (liveSession.status !== "ENDED") {
      return NextResponse.json(
        { error: "Recording can only be added after the session has ended." },
        { status: 400 },
      );
    }

    if (liveSession.courseVideoId) {
      return NextResponse.json(
        { error: "A recording has already been linked to this live session." },
        { status: 409 },
      );
    }

    const contentType = request.headers.get("content-type") || "";
    let method: "UPLOAD" | "ZOOM_LINK" | "ZOOM_API";
    let recordingUrl: string | null = null;
    let durationMinutes = liveSession.durationMinutes ?? 0;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      method =
        typeof formData.get("method") === "string"
          ? (String(formData.get("method")) as "UPLOAD")
          : "UPLOAD";

      if (method !== "UPLOAD") {
        return NextResponse.json(
          { error: "Multipart requests only support the UPLOAD method." },
          { status: 400 },
        );
      }

      const file = formData.get("file");
      if (!(file instanceof File) || file.size <= 0) {
        return NextResponse.json(
          { error: "A recording file is required." },
          { status: 400 },
        );
      }

      const config = await getPlatformConfig();
      const maxUploadBytes = config.courseVideoUploadMaxBytes ?? 0;

      if (maxUploadBytes > 0 && file.size > maxUploadBytes) {
        return NextResponse.json(
          {
            error: `Recording exceeds the current upload size limit of ${formatBytes(maxUploadBytes)}. Selected file: ${formatBytes(file.size)}.`,
          },
          { status: 413 },
        );
      }

      const uploadResult = await uploadRecording(file);
      uploadedRecordingId = uploadResult.public_id;
      durationMinutes = minutesFromSeconds(uploadResult.duration);

      if (durationMinutes > config.courpZEAWYtiB6bJ16NuLbGCc6CZ6jJdKfb63) {
        await destroyRecording(uploadResult.public_id);
        return NextResponse.json(
          {
            error: `Video exceeds maximum duration of ${config.courpZEAWYtiB6bJ16NuLbGCc6CZ6jJdKfb63} minutes`,
          },
          { status: 400 },
        );
      }

      recordingUrl = uploadResult.secure_url;
    } else {
      const body = await request.json();
      method = body.method;

      if (method === "ZOOM_LINK") {
        recordingUrl =
          typeof body.recordingUrl === "string" ? body.recordingUrl.trim() : "";
        durationMinutes =
          parseOptionalDuration(body.durationMinutes) ??
          liveSession.durationMinutes ??
          0;
      } else if (method === "ZOOM_API") {
        const meetingId =
          typeof body.meetingId === "string" ? body.meetingId.trim() : "";

        if (!meetingId) {
          return NextResponse.json(
            { error: "meetingId is required for ZOOM_API recording imports." },
            { status: 400 },
          );
        }

        recordingUrl = await getZoomRecordingUrl(meetingId);
        durationMinutes =
          parseOptionalDuration(body.durationMinutes) ??
          liveSession.durationMinutes ??
          0;
      } else {
        return NextResponse.json(
          { error: "Unsupported recording method." },
          { status: 400 },
        );
      }

      if (!recordingUrl) {
        return NextResponse.json(
          { error: "recordingUrl is required." },
          { status: 400 },
        );
      }

      if (Number.isNaN(durationMinutes)) {
        return NextResponse.json(
          { error: "durationMinutes must be a non-negative number." },
          { status: 400 },
        );
      }
    }

    liveSession.recordingMethod = method;
    liveSession.recordingUrl = recordingUrl;
    liveSession.recordingCloudinaryId = uploadedRecordingId;
    liveSession.recordingAddedAt = new Date();

    let courseVideo = null;

    if (liveSession.sectionId) {
      const section = await CourseSection.findOne({
        _id: liveSession.sectionId,
        courseId: id,
      });

      if (!section) {
        if (uploadedRecordingId) {
          await destroyRecording(uploadedRecordingId);
        }

        return NextResponse.json({ error: "Section not found." }, { status: 404 });
      }

      const nextOrder =
        (await CourseVideo.countDocuments({ sectionId: section._id })) + 1;

      courseVideo = await CourseVideo.create({
        courseId: id,
        sectionId: section._id,
        title: `${liveSession.title} Recording`,
        description: "Live session recording",
        order: nextOrder,
        videoUrl: recordingUrl,
        cloudinaryPublicId: uploadedRecordingId,
        durationMinutes,
        thumbnailUrl: null,
        isLiveRecording: true,
        liveSessionId: liveSession._id,
      });

      section.totalVideos = (section.totalVideos ?? 0) + 1;
      section.totalDurationMinutes =
        sumDurationMinutes(section.totalDurationMinutes ?? 0, durationMinutes);
      await section.save();

      course.totalDurationMinutes =
        sumDurationMinutes(course.totalDurationMinutes ?? 0, durationMinutes);
      await course.save();

      await incrementEnrollmentVideoTotals(id, 1);
      liveSession.courseVideoId = courseVideo._id;
    }

    await liveSession.save();

    return NextResponse.json(
      {
        liveSession,
        courseVideo,
        recordingUrl,
      },
      { status: 201 },
    );
  } catch (error) {
    if (uploadedRecordingId) {
      await destroyRecording(uploadedRecordingId);
    }

    if (isCloudinaryTooLargeError(error)) {
      const maxBytes = extractUploadLimitBytes(error);
      const uploadedBytes = extractUploadedBytes(error);

      return NextResponse.json(
        {
          error: `Cloudinary rejected this recording because the file is too large for the current plan.${maxBytes ? ` Limit: ${formatBytes(maxBytes)}.` : ""}${uploadedBytes ? ` Selected file: ${formatBytes(uploadedBytes)}.` : ""}`,
        },
        { status: 413 },
      );
    }

    console.error(
      "[POST /api/courses/:id/live-sessions/:sessionId/recording]",
      error,
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to attach live session recording.",
      },
      { status: 500 },
    );
  }
}
