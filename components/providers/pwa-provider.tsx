"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { PWAInstallPrompt } from "@/components/providers/pwa-install-prompt";
import { SHOULD_ENABLE_PWA } from "@/lib/pwa";
import { isCheckoutHostClient } from "@/lib/checkout-host";

export function PWAProvider() {
  const router = useRouter();
  const hasShownUpdateToastRef = useRef(false);

  // A tapped notification focuses this window and asks it to navigate (sw.js
  // focusOrOpenClient) instead of opening a second app window.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      const url = event.data?.type === "qc:navigate" ? event.data.url : null;
      if (typeof url === "string" && url.startsWith("/") && !url.startsWith("//")) {
        router.push(url);
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, [router]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (!SHOULD_ENABLE_PWA) {
      return;
    }

    // The checkout subdomain is a payment hand-off for users who already have
    // the app — never register the SW there so the browser cannot promote
    // "install this app".
    if (isCheckoutHostClient()) {
      return;
    }

    let isMounted = true;

    const showUpdateToast = () => {
      if (hasShownUpdateToastRef.current) {
        return;
      }

      hasShownUpdateToastRef.current = true;

      toast.info("A new version of Question Call is ready.", {
        duration: 15000,
        action: {
          label: "Refresh",
          onClick: () => window.location.reload(),
        },
      });
    };

    const attachInstallingWorkerListener = (worker: ServiceWorker | null) => {
      if (!worker) {
        return;
      }

      worker.addEventListener("statechange", () => {
        if (!isMounted) {
          return;
        }

        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          showUpdateToast();
        }
      });
    };

    void navigator.serviceWorker
      .register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      })
      .then((registration) => {
        if (!isMounted) {
          return;
        }

        if (registration.waiting && navigator.serviceWorker.controller) {
          showUpdateToast();
        }

        attachInstallingWorkerListener(registration.installing);

        registration.addEventListener("updatefound", () => {
          attachInstallingWorkerListener(registration.installing);
        });
      })
      .catch((error) => {
        console.error("[PWA] Failed to register service worker", error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return <PWAInstallPrompt />;
}
