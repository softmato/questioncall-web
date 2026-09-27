const STATIC_CACHE_NAME = "question-call-static-v2";
const STATIC_CACHE_PREFIX = "question-call-static-";
// The installable app (questioncall-app exported at /app) registers this same
// worker at scope /app; the website registers it at /.
const IN_APP = new URL(self.registration.scope).pathname === "/app";
const SHELL = IN_APP ? "/app" : "/";
const APP_SHELL_ASSETS = [
  SHELL,
  "/icon.png",
  "/apple-icon.png",
  "/favicon.ico",
  "/logo.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();

  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(STATIC_CACHE_NAME);
        await cache.addAll(APP_SHELL_ASSETS);
      } catch (error) {
        console.error("[SW] Failed to precache app shell", error);
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames.map((cacheName) => {
          if (
            cacheName.startsWith(STATIC_CACHE_PREFIX) &&
            cacheName !== STATIC_CACHE_NAME
          ) {
            return caches.delete(cacheName);
          }

          return Promise.resolve(false);
        }),
      );

      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (shouldHandleAsStaticAsset(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener("push", (event) => {
  event.waitUntil(handlePush(event));
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(refreshPushSubscription(event));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(IN_APP ? openInApp(targetUrl) : focusOrOpenClient(targetUrl));
});

// The app decides where a tapped notification lands, through the same route
// mapping a phone tap takes: an open app is handed the link
// (web/push-notifications.ts), a closed one is opened with it.
async function openInApp(targetUrl) {
  const windowClients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const app = windowClients.find((client) => {
    const { pathname } = new URL(client.url);
    return pathname === "/app" || pathname.startsWith("/app/");
  });

  if (app) {
    app.postMessage({ type: "pwa-push-open", url: targetUrl });
    await app.focus();
    return;
  }

  await self.clients.openWindow(`/app?push=${encodeURIComponent(targetUrl)}`);
}

function shouldHandleAsStaticAsset(pathname) {
  return (
    pathname === "/icon.png" ||
    pathname === "/apple-icon.png" ||
    pathname === "/favicon.ico" ||
    pathname === "/logo.png" ||
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/app/_expo/") ||
    pathname.startsWith("/app/assets/") ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/sounds/")
  );
}

async function networkFirst(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);

  try {
    return await fetch(request);
  } catch (error) {
    const fallbackResponse = await cache.match(SHELL);
    if (fallbackResponse) {
      return fallbackResponse;
    }

    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      // Never pin an error: a 404 chunk cached here is served before the retry.
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cachedResponse) {
    void networkPromise;
    return cachedResponse;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  return Response.error();
}

function getPushPayload(event) {
  if (!event.data) {
    return {};
  }

  try {
    return event.data.json();
  } catch (_error) {
    return {
      body: event.data.text(),
    };
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);

  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

function isAppleWebPushEnvironment() {
  const userAgent = self.navigator?.userAgent || "";
  const maxTouchPoints = self.navigator?.maxTouchPoints || 0;
  const isAppleDevice =
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (userAgent.includes("Macintosh") && maxTouchPoints > 1);
  const isChromiumLike = /CriOS|Chrome|Edg|OPR|SamsungBrowser|Firefox/i.test(
    userAgent,
  );

  return isAppleDevice && !isChromiumLike;
}

async function handlePush(event) {
  const payload = getPushPayload(event);
  const body = payload.body || "You have a new update.";
  const targetUrl = payload.url || "/";

  // Detect incoming call pushes by their body text and give them a clear title.
  const isCallNotification =
    typeof body === "string" && body.toLowerCase().includes("calling you");

  const title = isCallNotification
    ? "📞 Incoming Call"
    : (payload.title || "Question Call");

  await self.registration.showNotification(title, {
    body,
    icon: payload.icon || "/icon.png",
    badge: payload.badge || "/icon.png",
    // Large preview image (e.g. the photo attached to a new question). Ignored
    // by browsers that don't support it, so no need to feature-detect.
    image: payload.image || undefined,
    tag: payload.tag,
    renotify: Boolean(payload.tag),
    requireInteraction: isCallNotification ? true : Boolean(payload.requireInteraction),
    vibrate: isCallNotification ? [300, 100, 300, 100, 300] : undefined,
    data: {
      url: targetUrl,
    },
  });
}

async function refreshPushSubscription(event) {
  try {
    const keyResponse = await fetch("/api/push/public-key", {
      cache: "no-store",
    });
    const keyData = await keyResponse.json().catch(() => ({}));

    if (!keyResponse.ok || !keyData.publicKey) {
      return;
    }

    const subscription = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
    });

    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
      }),
    });

    const oldEndpoint = event.oldSubscription?.endpoint;
    if (oldEndpoint) {
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          endpoint: oldEndpoint,
        }),
      }).catch(() => null);
    }
  } catch (error) {
    console.error("[SW] Failed to refresh push subscription", error);
  }
}

async function focusOrOpenClient(targetUrl) {
  const absoluteTargetUrl = new URL(targetUrl, self.location.origin).href;
  const windowClients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  // Reuse the window the user already has and route it in-app. On Android a
  // second openWindow() stacks another instance of the installed app over the
  // first; a soft navigation also keeps a live call in that window running.
  const client =
    windowClients.find((c) => c.url === absoluteTargetUrl) || windowClients[0];
  if (client && "focus" in client) {
    await client.focus().catch(() => null);
    if (client.url !== absoluteTargetUrl) {
      const { pathname, search, hash } = new URL(absoluteTargetUrl);
      client.postMessage({ type: "qc:navigate", url: pathname + search + hash });
    }
    return;
  }

  if (self.clients.openWindow) {
    await self.clients.openWindow(absoluteTargetUrl);
  }
}
