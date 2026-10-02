"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { DownloadIcon, Share2Icon, SmartphoneIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SHOULD_ENABLE_PWA } from "@/lib/pwa";
import { isCheckoutHostClient } from "@/lib/checkout-host";

type DeferredInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

const DISMISS_STORAGE_KEY = "question-call-install-prompt-dismissed-at";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PROMPT_DELAY_MS = 5000;

function isStandaloneMode() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

function isIosSafariBrowser() {
  if (typeof window === "undefined") {
    return false;
  }

  const { userAgent, vendor, maxTouchPoints } = window.navigator;
  const isAppleTouchDevice =
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (userAgent.includes("Macintosh") && maxTouchPoints > 1);
  const isWebKitSafari =
    /Safari/i.test(userAgent) &&
    /Apple/i.test(vendor) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(userAgent);

  return isAppleTouchDevice && isWebKitSafari;
}

function isMobileOrSmallScreen() {
  if (typeof window === "undefined") {
    return false;
  }

  const isSmallViewport = window.matchMedia("(max-width: 900px)").matches;
  const isTouchDevice =
    window.matchMedia("(pointer: coarse)").matches ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent);

  return isSmallViewport || isTouchDevice;
}

function wasDismissedRecently() {
  if (typeof window === "undefined") {
    return false;
  }

  const storedAt = window.localStorage.getItem(DISMISS_STORAGE_KEY);
  if (!storedAt) {
    return false;
  }

  const dismissedAt = Number.parseInt(storedAt, 10);
  if (Number.isNaN(dismissedAt)) {
    window.localStorage.removeItem(DISMISS_STORAGE_KEY);
    return false;
  }

  if (Date.now() - dismissedAt > DISMISS_TTL_MS) {
    window.localStorage.removeItem(DISMISS_STORAGE_KEY);
    return false;
  }

  return true;
}

function rememberDismissal() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
}

export function PWAInstallPrompt() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] =
    useState<DeferredInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isEligibleViewport, setIsEligibleViewport] = useState(false);
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  const isSuppressedRoute = useMemo(() => {
    if (!pathname) {
      return false;
    }

    return (
      pathname.startsWith("/calls/") ||
      pathname.startsWith("/channel/") ||
      pathname.startsWith("/auth/")
    );
  }, [pathname]);

  const isManualIosPrompt = !deferredPrompt && isIosSafari;

  useEffect(() => {
    if (!SHOULD_ENABLE_PWA || typeof window === "undefined") {
      return;
    }

    const syncEnvironment = () => {
      setIsInstalled(isStandaloneMode());
      setIsEligibleViewport(isMobileOrSmallScreen());
      setIsIosSafari(isIosSafariBrowser());
    };

    syncEnvironment();

    const handleBeforeInstallPrompt = (event: Event) => {
      const promptEvent = event as DeferredInstallPromptEvent;
      promptEvent.preventDefault();
      setDeferredPrompt(promptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
      setIsVisible(false);
      window.localStorage.removeItem(DISMISS_STORAGE_KEY);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        syncEnvironment();
      }
    };

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt as EventListener,
    );
    window.addEventListener("appinstalled", handleAppInstalled);
    window.addEventListener("resize", syncEnvironment);
    window.addEventListener("orientationchange", syncEnvironment);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt as EventListener,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("resize", syncEnvironment);
      window.removeEventListener("orientationchange", syncEnvironment);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!SHOULD_ENABLE_PWA || isInstalled || isSuppressedRoute || !isEligibleViewport) {
      setIsVisible(false);
      return;
    }

    // Never prompt to install on the checkout subdomain — the user already has
    // the app and is only here to pay.
    if (isCheckoutHostClient()) {
      setIsVisible(false);
      return;
    }

    if (wasDismissedRecently()) {
      setIsVisible(false);
      return;
    }

    const canPrompt = Boolean(deferredPrompt) || isIosSafari;
    if (!canPrompt) {
      setIsVisible(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setIsVisible(true);
    }, PROMPT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [deferredPrompt, isEligibleViewport, isInstalled, isIosSafari, isSuppressedRoute]);

  const dismissPrompt = () => {
    rememberDismissal();
    setIsVisible(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) {
      return;
    }

    setIsInstalling(true);

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;

      setDeferredPrompt(null);

      if (choice.outcome === "accepted") {
        setIsVisible(false);
        return;
      }

      dismissPrompt();
    } finally {
      setIsInstalling(false);
    }
  };

  if (!SHOULD_ENABLE_PWA || !isVisible || isInstalled || isSuppressedRoute) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[70] sm:inset-x-auto sm:right-4 sm:w-[24rem]">
      <div
        className={cn(
          "pointer-events-auto overflow-hidden rounded-2xl border border-border bg-background/95 shadow-2xl backdrop-blur-xl",
          "animate-in fade-in slide-in-from-bottom-4 duration-300",
        )}
      >
        <div className="flex items-start gap-3 p-4">
          <div className="mt-0.5 rounded-full bg-primary/10 p-2 text-primary">
            <SmartphoneIcon className="size-4" />
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {isManualIosPrompt ? "Add QuestionCall to Home Screen" : "Install QuestionCall"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isManualIosPrompt
                    ? "Use Safari's Add to Home Screen for a cleaner app-like experience."
                    : "Open the app faster from your home screen."}
                </p>
              </div>

              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="-mr-1 shrink-0"
                onClick={dismissPrompt}
              >
                <XIcon className="size-3.5" />
                <span className="sr-only">Dismiss install prompt</span>
              </Button>
            </div>

            {deferredPrompt ? (
              <p className="text-xs leading-5 text-muted-foreground">
                Add the app for a cleaner full-screen experience and faster return access.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs leading-5 text-muted-foreground">
                  On iPhone or iPad, open this in Safari, tap Share, then choose Add to Home Screen.
                </p>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-foreground">
                  <span className="rounded-full bg-muted px-2.5 py-1">Share</span>
                  <Share2Icon className="size-3 text-muted-foreground" />
                  <span className="rounded-full bg-muted px-2.5 py-1">Add to Home Screen</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/70 bg-muted/20 px-4 py-3">
          <Button type="button" size="sm" variant="ghost" onClick={dismissPrompt}>
            Not now
          </Button>
          {deferredPrompt ? (
            <Button type="button" size="sm" onClick={() => void handleInstall()} disabled={isInstalling}>
              <DownloadIcon className="size-3.5" />
              {isInstalling ? "Installing..." : "Install"}
            </Button>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={dismissPrompt}>
              Got it
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
