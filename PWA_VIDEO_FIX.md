# Course playback and duration fixes

The installed manifest opens `/app`, the Expo web export, while website course
pages use `components/course/VideoPlayer.tsx` and Mux Player. The reported error
text comes from `app/app/course/video.tsx` in the sibling app repository.
`GET /api/courses/:id/videos/:videoId` returns a public Mux `.m3u8` URL. Expo
Video's web implementation assigns that URL directly to an HTML video element;
it has no HLS JavaScript fallback. The PWA now uses hls.js when MediaSource is
supported, with native playback fallback for Safari and ordinary MP4 sources.
Native Android retains Expo Video. Retry recreates the HLS controller, and
production diagnostics preserve media error code, message, currentSrc and
fatal HLS details.

The service worker already excludes cross-origin Mux and `/api/` requests;
there is no media proxy or bearer-only video stream in this path. API metadata
access uses unified authentication; the public Mux media URL needs no app
authorization header or expiring signature. Sources do not switch based on
standalone display mode. Manifest start URL and scope are both same-origin
`/app`; the actual installation domain cannot be established from source.
The worker now explicitly bypasses video, audio, Range requests and streaming
file extensions, including requests under cached asset directories.

Durations previously added decimal minutes directly in
`lib/course-video-ready.ts`, and the app's course formatter printed that raw
sum. Helpers now round to whole seconds before adding/subtracting, then retain
the existing minutes API/schema contract with bounded precision. Read responses
normalize legacy stored values as well. Course/chapter rows, cards and studio
views use the shared formatter in each independently deployed repository.
`12.55 + 31.07` minutes displays as `43m 37s`. The course heading wraps with an
explicit gap, and section/lesson counts use singular/plural labels.

Validation: `npx tsx --test lib/duration.test.ts` covers totals, legacy response
normalization, formatting, helper parity and service-worker bypass. Both
TypeScript checks, the Expo web export and Next production build pass. Web
lint has pre-existing failures; comparison with HEAD found no new diagnostics
in changed files. Physical Android playback remains unverified.

After deployment, reopen the installed PWA and play/seek the reported lesson;
also check the website tab. If it still fails, use USB debugging and
`chrome://inspect` to inspect the PWA window. Capture the playlist and failing
segment/media request URL, status, response headers and whether Network lists
`(ServiceWorker)`. Capture `[Course video playback]` console output and
`document.querySelector('video').error`. An HLS playlist normally returns 200;
206 and Content-Range apply when the request actually contains Range.
