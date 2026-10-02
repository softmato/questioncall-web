import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import {
  durationSeconds,
  formatDuration,
  minutesFromSeconds,
  normalizeDurationPayload,
  sumDurationMinutes,
} from "./duration";

test("course totals add whole seconds and format without decimal artifacts", () => {
  const total = sumDurationMinutes(12.55, 31.07);
  assert.equal(durationSeconds(total), 2617);
  assert.equal(formatDuration(total), "43m 37s");
  assert.equal(formatDuration(43.620000000000005), "43m 37s");
  assert.equal(formatDuration(12.55), "12m 33s");
  assert.equal(formatDuration(sumDurationMinutes(total, -12.55)), "31m 4s");
  assert.equal(formatDuration(59.999), "1h");
  assert.equal(formatDuration(241), "4h 1m");
  assert.equal(formatDuration(120), "2h");
  assert.equal(formatDuration(61.5), "1h 1m 30s");
  assert.equal(formatDuration(undefined), "0 min");
  assert.equal(formatDuration(NaN), "0 min");
  assert.equal(minutesFromSeconds(0.9), 0.016667);
  assert.deepEqual(
    normalizeDurationPayload({ totalDurationMinutes: 43.620000000000005 }),
    { totalDurationMinutes: total },
  );
});

test("app and server share identical duration arithmetic and formatting", () => {
  // Both repositories build independently; keep their portable helpers in sync.
  const appHelper = new URL("../../app/lib/duration.ts", import.meta.url);
  try {
    const app = readFileSync(appHelper, "utf8").trim();
    const web = readFileSync(new URL("./duration.ts", import.meta.url), "utf8");
    assert.ok(web.startsWith(app));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
});

test("service worker never intercepts media or range requests", () => {
  const listeners: Record<string, (event: unknown) => void> = {};
  vm.runInNewContext(
    readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"),
    {
      URL,
      self: {
        registration: { scope: "https://example.com/app" },
        location: { origin: "https://example.com" },
        addEventListener: (name: string, fn: (event: unknown) => void) => {
          listeners[name] = fn;
        },
      },
      caches: {
        open: async () => ({
          match: async () => undefined,
          put: () => undefined,
        }),
      },
      fetch: async () => new Response("ok"),
    },
  );
  for (const [path, destination, range] of [
    ["/assets/lesson.mp4", "video", false],
    ["/sounds/ring", "audio", false],
    ["/assets/stream", "", true],
    ["/assets/segment.m4s", "", false],
    ["https://stream.mux.com/test.m3u8", "", false],
  ] as const) {
    let intercepted = false;
    listeners.fetch({
      request: {
        method: "GET",
        url: new URL(path, "https://example.com").href,
        destination,
        headers: new Headers(range ? { Range: "bytes=0-" } : {}),
      },
      respondWith: () => {
        intercepted = true;
      },
    });
    assert.equal(intercepted, false, path);
  }
  let staticIntercepted = false;
  listeners.fetch({
    request: {
      method: "GET",
      url: "https://example.com/_next/static/chunk.js",
      destination: "script",
      headers: new Headers(),
    },
    respondWith: () => {
      staticIntercepted = true;
    },
  });
  assert.equal(staticIntercepted, true);
});
