"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  BookOpenIcon,
  CreditCardIcon,
  FileTextIcon,
  GraduationCapIcon,
  HomeIcon,
  InfoIcon,
  ListIcon,
  MenuIcon,
  MessageSquareIcon,
  PlusIcon,
  Settings2Icon,
  SparklesIcon,
  TargetIcon,
  TrophyIcon,
  UserCircle2Icon,
  WalletIcon,
} from "lucide-react";

import { AuthenticatedHeader } from "@/components/shared/authenticated-header";
import { OnboardingVideoModal } from "@/components/shared/onboarding-video-modal";
import { WorkspaceFilterProvider } from "@/components/shared/workspace-filter-context";
import { LogoMark } from "@/components/shared/logo";
import { NavUser } from "@/components/shared/nav-user";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { SocialHandlesHover } from "@/components/shared/social-handles-hover";
import { NotificationBell } from "@/components/shared/notification-bell";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DEFAULT_CALL_SETTINGS,
  type UserCallSettings,
} from "@/lib/call-settings";

import {
  enqueueIncomingCall,
  removeIncomingCall as removeIncomingCallFromQueue,
} from "@/lib/incoming-call-queue";
import { cn } from "@/lib/utils";
import {
  getLeaderboardPath,
  getMessagesPath,
  getProfilePath,
  getSettingsPath,
  getSubscriptionPath,
  getWalletPath,
  getUserHandle,
} from "@/lib/user-paths";
import { updateProfile } from "@/store/features/user/user-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getPusherClient } from "@/lib/pusher/pusherClient";
import {
  getUserPusherName,
  CHANNEL_UPDATED_EVENT,
  NEW_CHANNEL_EVENT,
  PLATFORM_SOCIAL_LINKS_UPDATED_EVENT,
  PLATFORM_UPDATES_CHANNEL,
  SUBSCRIPTION_UPDATED_EVENT,
  CALL_INCOMING_EVENT,
  CALL_ACCEPTED_EVENT,
  CALL_REJECTED_EVENT,
  CALL_CANCELLED_EVENT,
  CALL_MISSED_EVENT,
  CALL_HANDLED_EVENT,
} from "@/lib/pusher/events";
import { getDeviceId } from "@/lib/device-id";
import { IncomingCallOverlay, type IncomingCallPayload } from "@/components/shared/incoming-call-overlay";
import { OutgoingCallOverlay, type OutgoingCallState } from "@/components/shared/outgoing-call-overlay";
import {
  setChannelsLoading,
  setChannelsList,
  updateChannelPreview,
  incrementChannelUnread,
  clearChannelUnread,
  upsertChannelItem,
} from "@/store/features/channels/channels-slice";
import type { ChannelListItem } from "@/types/channel";
import { APP_NAME } from "@/lib/constants";
import type { PlatformSocialLinks } from "@/models/PlatformConfig";

type WorkspaceRole = "STUDENT" | "TEACHER" | "ADMIN";

type WorkspaceUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  username?: string | null;
  role: WorkspaceRole;
  teacherModeVerified?: boolean;
  totalAnswered?: number;
  userImage?: string | null;
  callSettings: UserCallSettings;
  dailyAnswersCount?: number;
};

type WorkspaceShellProps = {
  user: WorkspaceUser;
  socialLinks: PlatformSocialLinks;
  dailyTargets?: { target: number; bonus: number }[];
  defaultOpen?: boolean;
  children: ReactNode;
};

type ChannelUpdatedPayload = {
  channelId: string;
  unreadCountCleared?: boolean;
  unreadCountIncrement?: number;
  lastMessagePreview?: string;
  lastMessageAt?: string;
};

type NewChannelPayload = {
  channel?: ChannelListItem;
};

const SIDEBAR_SKELETON_ITEMS = 8;
const MOBILE_BREAKPOINT_QUERY = "(max-width: 767px)";

function isStandaloneDisplayMode() {
  if (typeof window === "undefined") {
    return false;
  }

  const nav = window.navigator as Navigator & { standalone?: boolean };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    nav.standalone === true
  );
}

function isMobileViewport() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
}

function useInstalledMobilePwa() {
  const [isInstalledMobilePwa, setIsInstalledMobilePwa] = useState(false);

  useEffect(() => {
    const displayQueries = [
      window.matchMedia("(display-mode: standalone)"),
      window.matchMedia("(display-mode: fullscreen)"),
    ];
    const mobileQuery = window.matchMedia(MOBILE_BREAKPOINT_QUERY);

    const update = () => {
      setIsInstalledMobilePwa(isStandaloneDisplayMode() && isMobileViewport());
    };

    const addListener = (query: MediaQueryList) => {
      query.addEventListener("change", update);
    };

    const removeListener = (query: MediaQueryList) => {
      query.removeEventListener("change", update);
    };

    update();
    displayQueries.forEach(addListener);
    addListener(mobileQuery);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      displayQueries.forEach(removeListener);
      removeListener(mobileQuery);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return isInstalledMobilePwa;
}

type PwaNavItem = {
  href: string;
  icon: typeof HomeIcon;
  label: string;
  isActive: boolean;
  badge?: number | null;
};

function WorkspacePwaTopBar({
  userId,
}: {
  userId: string;
}) {
  return (
    <header
      className="sticky top-0 z-30 border-b border-border/70 bg-background/95 shadow-sm backdrop-blur-md md:hidden"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <LogoMark size={30} className="rounded-xl" />
          <div className="min-w-0">
            <p className="truncate text-lg font-extrabold leading-5 text-foreground">
              Question<span className="text-emerald-500">Call</span>
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-1.5">
          <NotificationBell userId={userId} />
        </div>
      </div>
    </header>
  );
}

function WorkspacePwaBottomNav({
  items,
  centerLabel,
  centerHref,
  onCenterClick,
}: {
  items: PwaNavItem[];
  centerLabel: string;
  centerHref?: string;
  onCenterClick?: () => void;
}) {
  const centerContent = (
    <>
      <PlusIcon className="size-6" />
      <span className="text-[9px] font-semibold leading-none">{centerLabel}</span>
    </>
  );

  return (
    <nav
      aria-label="App navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 shadow-[0_-10px_28px_rgba(15,23,42,0.08)] backdrop-blur-md md:hidden"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 10px)" }}
    >
      <div className="grid h-16 grid-cols-5 items-center">
        {items.slice(0, 2).map((item) => (
          <PwaBottomNavLink key={item.href} item={item} />
        ))}

        <div className="flex justify-center">
          {centerHref ? (
            <Link
              href={centerHref}
              className="relative -mt-7 flex size-16 flex-col items-center justify-center gap-0.5 rounded-full border border-primary/30 bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition active:scale-95"
            >
              {centerContent}
            </Link>
          ) : (
            <button
              type="button"
              onClick={onCenterClick}
              className="relative -mt-7 flex size-16 flex-col items-center justify-center gap-0.5 rounded-full border border-primary/30 bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition active:scale-95"
            >
              {centerContent}
            </button>
          )}
        </div>

        {items.slice(2).map((item) => (
          <PwaBottomNavLink key={item.href} item={item} />
        ))}
      </div>
    </nav>
  );
}

function PwaBottomNavLink({ item }: { item: PwaNavItem }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "relative flex h-full min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium transition active:scale-95",
        item.isActive ? "text-primary" : "text-muted-foreground",
      )}
    >
      <span className="relative">
        <item.icon className="size-[21px]" />
        {item.badge && item.badge > 0 ? (
          <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        ) : null}
      </span>
      <span className="w-full truncate text-center leading-none">{item.label}</span>
    </Link>
  );
}

function WorkspaceSidebarHeaderSkeleton() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-sidebar-border/80 bg-sidebar-accent/75 p-2 shadow-sm group-data-[collapsible=icon]:justify-center">
      <Skeleton className="size-8 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-1.5 group-data-[collapsible=icon]:hidden">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3 w-18" />
      </div>
    </div>
  );
}

function WorkspaceSidebarNavigationSkeleton() {
  return (
    <SidebarMenu>
      {Array.from({ length: SIDEBAR_SKELETON_ITEMS }, (_, index) => (
        <SidebarMenuItem key={`sidebar-skeleton-${index}`}>
          <SidebarMenuSkeleton showIcon />
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

function WorkspaceSidebarModeSkeleton() {
  return (
    <div className="rounded-xl border border-sidebar-border/80 bg-sidebar-accent/70 p-3 shadow-sm group-data-[collapsible=icon]:hidden">
      <div className="flex items-center gap-2">
        <Skeleton className="size-4 rounded-sm" />
        <Skeleton className="h-3.5 w-24" />
      </div>
      <div className="mt-3 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-[88%]" />
        <Skeleton className="h-3 w-[64%]" />
      </div>
    </div>
  );
}

export function WorkspaceShell({
  user,
  socialLinks,
  dailyTargets = [],
  defaultOpen = true,
  children,
}: WorkspaceShellProps) {
  const dispatch = useAppDispatch();
  const profile = useAppSelector((state) => state.user);
  const {
    items: channels,
    isHydrated: channelsHydrated,
  } = useAppSelector((state) => state.channels);
  const channelsRef = useRef(channels);
  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);
  
  const [hasFailedInitialLoad, setHasFailedInitialLoad] = useState(false);
  const [liveSocialLinks, setLiveSocialLinks] = useState<PlatformSocialLinks>(socialLinks);

  // ── Global call state ───────────────────────────────────────
  const [incomingCalls, setIncomingCalls] = useState<IncomingCallPayload[]>([]);
  const [outgoingCall, setOutgoingCall] = useState<OutgoingCallState | null>(null);
  const [outgoingAcceptedCallId, setOutgoingAcceptedCallId] = useState<string | null>(null);
  const [outgoingRejectedCallId, setOutgoingRejectedCallId] = useState<string | null>(null);
  const [outgoingMissedCallId, setOutgoingMissedCallId] = useState<string | null>(null);
  const [showTargetInfoModal, setShowTargetInfoModal] = useState(false);
  const isInstalledMobilePwa = useInstalledMobilePwa();

  const removeIncomingCall = useCallback((callSessionId?: string) => {
    setIncomingCalls((prev) => removeIncomingCallFromQueue(prev, callSessionId));
  }, []);

  const totalUnreadChannels = channels.reduce(
    (acc, ch) => acc + (ch.unreadCount > 0 ? 1 : 0),
    0
  );

  const fetchChannels = useCallback(async () => {
    dispatch(setChannelsLoading());
    try {
      const res = await fetch("/api/channels");
      if (res.ok) {
        const data: ChannelListItem[] = await res.json();
        dispatch(setChannelsList(data));
      } else {
        setHasFailedInitialLoad(true);
      }
    } catch {
      setHasFailedInitialLoad(true);
    }
  }, [dispatch]);

  const fetchSubscriptionStatus = useCallback(async () => {
    if (user.role !== "STUDENT") return;
    try {
      const res = await fetch("/api/user/subscription");
      if (res.ok) {
        const data = await res.json();
        dispatch(
          updateProfile({
            subscriptionStatus: data.subscriptionStatus,
            subscriptionEnd: data.subscriptionEnd,
            planSlug: data.planSlug,
            pendingManualPayment: data.pendingManualPayment,
            questionsAsked: data.questionsAsked,
            questionsRemaining: data.questionsRemaining,
            maxQuestions: data.maxQuestions,
            baseMaxQuestions: data.baseMaxQuestions,
            bonusQuestions: data.bonusQuestions,
            referralCode: data.referralCode,
          })
        );
      }
    } catch {
      // Silently fail
    }
  }, [user.role, dispatch]);

  useEffect(() => {
    if (!channelsHydrated) {
      fetchChannels();
    }
  }, [fetchChannels, channelsHydrated]);

  useEffect(() => {
    fetchSubscriptionStatus();
  }, [fetchSubscriptionStatus]);



  useEffect(() => {
    if (
      "Notification" in window &&
      Notification.permission === "default" &&
      !localStorage.getItem("qc_notif_asked")
    ) {
      const handleInteraction = () => {
        localStorage.setItem("qc_notif_asked", "1");
        Notification.requestPermission().catch(() => {});
      };
      document.addEventListener("click", handleInteraction, { once: true });
      return () => document.removeEventListener("click", handleInteraction);
    }
  }, []);

  useEffect(() => {
    setLiveSocialLinks(socialLinks);
  }, [socialLinks]);



  // Subscribe to user-specific channel for real-time list updates (global)
  useEffect(() => {
    if (!user.id) return;

    const pusherClient = getPusherClient();
    if (!pusherClient) return;

    const userChannel = getUserPusherName(user.id);
    const channel = pusherClient.subscribe(userChannel);

    channel.bind(CHANNEL_UPDATED_EVENT, (data: ChannelUpdatedPayload) => {
      if (data.unreadCountCleared) {
        dispatch(clearChannelUnread(data.channelId));
      } else {
        if (data.lastMessagePreview && data.lastMessageAt) {
          dispatch(
            updateChannelPreview({
              channelId: data.channelId,
              preview: data.lastMessagePreview,
              at: data.lastMessageAt,
            })
          );
        }
        if (data.unreadCountIncrement) {
          // Only increment unread badge if NOT currently viewing this channel
          const currentViewingId = window.location.pathname.split("/").pop();
          const isViewingChannel = currentViewingId === data.channelId;

          if (!isViewingChannel) {
            dispatch(
              incrementChannelUnread({
                channelId: data.channelId,
                incrementBy: data.unreadCountIncrement,
              })
            );
          }

          // Always play notification sound
          try {
            const audio = new Audio("/sounds/message-tone.wav");
            audio.volume = 0.5;
            audio.play().catch(() => {});
          } catch { /* ignore */ }

          // Show desktop notification (reliable using service worker)
          try {
            if ("Notification" in window && Notification.permission === "granted") {
              const channelData = channelsRef.current.find(c => c.id === data.channelId);
              const senderName = channelData ? channelData.counterpartName : "New Message";
              const targetUrl = `/channel/${data.channelId}`;
              
              const notifOptions = {
                body: data.lastMessagePreview || "You received a new message.",
                icon: "/logo.png",
                tag: `msg-${Date.now()}`,
                renotify: true,
                data: { url: targetUrl }
              };

              if ("serviceWorker" in navigator) {
                navigator.serviceWorker.getRegistration().then((registration) => {
                  if (registration && registration.active) {
                    registration.showNotification(senderName, notifOptions);
                  } else {
                    // Fallback for dev mode where SW might not be registered
                    const notif = new Notification(senderName, notifOptions);
                    notif.onclick = () => {
                      window.focus();
                      window.location.href = targetUrl;
                    };
                  }
                });
              } else {
                const notif = new Notification(senderName, notifOptions);
                notif.onclick = () => {
                  window.focus();
                  window.location.href = targetUrl;
                };
              }
            }
          } catch { /* ignore */ }
        }
      }
    });

    channel.bind(NEW_CHANNEL_EVENT, (data: NewChannelPayload) => {
      if (data.channel) {
        dispatch(upsertChannelItem(data.channel));
      }
    });

    channel.bind(SUBSCRIPTION_UPDATED_EVENT, (data: {
      subscriptionStatus: string;
      subscriptionEnd: string | null;
      planSlug: string;
      questionsAsked?: number;
    }) => {
      dispatch(updateProfile({
        subscriptionStatus: data.subscriptionStatus as "ACTIVE" | "EXPIRED" | "TRIAL" | "NONE" | null,
        subscriptionEnd: data.subscriptionEnd,
        planSlug: data.planSlug,
        ...(data.questionsAsked !== undefined && { questionsAsked: data.questionsAsked }),
      }));
    });

    // ── Global incoming call listener ──────────────────────────
    channel.bind(CALL_INCOMING_EVENT, (data: IncomingCallPayload) => {
      setIncomingCalls((prev) => enqueueIncomingCall(prev, data));
    });

    // ── Call lifecycle events (for outgoing calls we initiated) ─
    channel.bind(CALL_ACCEPTED_EVENT, (data: { callSessionId: string }) => {
      setOutgoingAcceptedCallId(data.callSessionId);
    });

    channel.bind(CALL_REJECTED_EVENT, (data: { callSessionId: string }) => {
      setOutgoingRejectedCallId(data.callSessionId);
    });

    // Caller cancelled before pickup — clear matching incoming call
    channel.bind(CALL_CANCELLED_EVENT, (data: { callSessionId: string }) => {
      removeIncomingCall(data.callSessionId);
    });

    channel.bind(CALL_MISSED_EVENT, (data: { callSessionId: string }) => {
      removeIncomingCall(data.callSessionId);
      setOutgoingMissedCallId(data.callSessionId);
    });

    // Call was accepted/rejected on another of THIS user's devices (same
    // account on web + app) — dismiss our incoming-call overlay immediately.
    channel.bind(
      CALL_HANDLED_EVENT,
      (data: { callSessionId: string; byDeviceId?: string | null }) => {
        if (data.byDeviceId && data.byDeviceId === getDeviceId()) return;
        removeIncomingCall(data.callSessionId);
      },
    );

    return () => {
      channel.unbind(CHANNEL_UPDATED_EVENT);
      channel.unbind(NEW_CHANNEL_EVENT);
      channel.unbind(CALL_INCOMING_EVENT);
      channel.unbind(CALL_ACCEPTED_EVENT);
      channel.unbind(CALL_REJECTED_EVENT);
      channel.unbind(CALL_CANCELLED_EVENT);
      channel.unbind(CALL_MISSED_EVENT);
      channel.unbind(CALL_HANDLED_EVENT);
      pusherClient.unsubscribe(userChannel);
    };
  }, [user.id, dispatch, removeIncomingCall]);

  useEffect(() => {
    const pusherClient = getPusherClient();
    if (!pusherClient) return;

    const channel = pusherClient.subscribe(PLATFORM_UPDATES_CHANNEL);
    const handleSocialLinksUpdated = (data: { socialLinks?: PlatformSocialLinks }) => {
      if (Array.isArray(data.socialLinks)) {
        setLiveSocialLinks(data.socialLinks);
      }
    };

    channel.bind(PLATFORM_SOCIAL_LINKS_UPDATED_EVENT, handleSocialLinksUpdated);

    return () => {
      channel.unbind(PLATFORM_SOCIAL_LINKS_UPDATED_EVENT, handleSocialLinksUpdated);
      pusherClient.unsubscribe(PLATFORM_UPDATES_CHANNEL);
    };
  }, []);

  useEffect(() => {
    // Only hydrate base info from the layout here. 
    // Subscription state is fetched asynchronously in fetchSubscriptionStatus 
    // so we use updateProfile to avoid overwriting it with hardcoded 'NONE' if the fetch finishes first.
    dispatch(updateProfile({
      id: user.id,
      name: user.name || "",
      email: user.email || "",
      username: user.username || "",
      role: user.role,
      teacherModeVerified: user.teacherModeVerified ?? false,
      totalAnswered: user.totalAnswered ?? 0,
      userImage: user.userImage ?? "",
      callSettings: user.callSettings || DEFAULT_CALL_SETTINGS,
    }));
  }, [
    dispatch,
    user.callSettings,
    user.email,
    user.id,
    user.name,
    user.role,
    user.teacherModeVerified,
    user.totalAnswered,
    user.userImage,
    user.username,
  ]);

  // ── Listen for outgoing call requests from channel-chat ────────
  useEffect(() => {
    const handleOutgoingCall = (e: Event) => {
      const detail = (e as CustomEvent<OutgoingCallState>).detail;
      if (detail?.callSessionId) {
        setOutgoingCall(detail);
        setOutgoingAcceptedCallId(null);
        setOutgoingRejectedCallId(null);
        setOutgoingMissedCallId(null);
      }
    };
    // Ring rebuilt by the /call/:id notification target (app/(workspace)/call)
    // — the Pusher event fired before this window existed.
    const handleIncomingCall = (e: Event) => {
      const detail = (e as CustomEvent<IncomingCallPayload>).detail;
      if (detail?.callSessionId) {
        setIncomingCalls((prev) => enqueueIncomingCall(prev, detail));
      }
    };
    window.addEventListener("qc:outgoing-call", handleOutgoingCall);
    window.addEventListener("qc:incoming-call", handleIncomingCall);
    return () => {
      window.removeEventListener("qc:outgoing-call", handleOutgoingCall);
      window.removeEventListener("qc:incoming-call", handleIncomingCall);
    };
  }, []);

  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const pathname = usePathname();

  // Keep shell identity in sync with profile edits that already landed in Redux.
  const resolvedUser = {
    ...user,
    name: profile.name || user.name || "",
    email: profile.email || user.email || "",
    username: profile.username || user.username || "",
    role: profile.isHydrated ? profile.role : user.role,
    userImage: profile.userImage || user.userImage || "",
  };
  const resolvedCallSettings = profile.isHydrated
    ? profile.callSettings
    : user.callSettings || DEFAULT_CALL_SETTINGS;
  const activeIncomingCall = incomingCalls[0] ?? null;

  const handle = getUserHandle(resolvedUser);
  const leaderboardHref = getLeaderboardPath(resolvedUser);
  const messageHref = getMessagesPath(resolvedUser);
  const profileHref = getProfilePath(resolvedUser);
  const settingsHref = getSettingsPath(resolvedUser);
  const subscriptionHref = getSubscriptionPath(resolvedUser);
  const walletHref = getWalletPath(resolvedUser);
  const showQuestionFilter = pathname === "/";
  const isChannelDetailPage = pathname.startsWith("/channel/");
  const isCallPage = pathname.startsWith("/calls/");
  const isPwaPushedActionPage =
    pathname.startsWith("/ask") || pathname.startsWith("/actions");
  const isPwaMenuDetailPage =
    pathname === "/notifications" ||
    pathname === "/notices" ||
    pathname === "/referral" ||
    pathname === "/daily-target" ||
    pathname === "/onboarding" ||
    pathname === "/wallet/withdraw" ||
    pathname === "/profile/activity" ||
    pathname === "/profile/change-password" ||
    pathname === "/settings/notifications" ||
    pathname === "/settings/theme";
  const isWatchPage = pathname.includes("/watch/");
  const isPaymentPage =
    pathname.startsWith("/payment") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/subscription/payment");
  const hidePwaChrome =
    isInstalledMobilePwa &&
    (isChannelDetailPage ||
      isCallPage ||
      isPwaPushedActionPage ||
      isPwaMenuDetailPage ||
      isWatchPage ||
      isPaymentPage);
  const shouldUsePwaChrome = isInstalledMobilePwa && !hidePwaChrome;
  const isChatPage = pathname.startsWith("/message") || isChannelDetailPage;

  // Keep Post Question button in header for students, but open messages for teachers
  const headerPrimaryHref = resolvedUser.role === "STUDENT" ? "#" : messageHref;
  const headerPrimaryLabel = resolvedUser.role === "STUDENT" ? "Post Question" : "Open messages";
  const headerUseModal = resolvedUser.role === "STUDENT";
  const pwaBottomItems: PwaNavItem[] = [
    {
      href: "/",
      icon: ListIcon,
      label: "Feed",
      isActive: pathname === "/" || pathname.startsWith("/question/"),
    },
    {
      href: messageHref,
      icon: MessageSquareIcon,
      label: "Channels",
      badge: totalUnreadChannels,
      isActive: pathname.startsWith("/message") || pathname.startsWith("/channel/"),
    },
    {
      href: "/courses",
      icon: BookOpenIcon,
      label: "Courses",
      isActive: pathname.startsWith("/courses"),
    },
    {
      href: "/menu",
      icon: MenuIcon,
      label: "Menu",
      isActive:
        pathname === "/menu" ||
        pathname.startsWith("/settings") ||
        pathname.startsWith("/wallet") ||
        pathname.startsWith("/notes") ||
        pathname.startsWith("/leaderboard") ||
        pathname.startsWith("/subscription"),
    },
  ];
  const pwaCenterLabel = resolvedUser.role === "TEACHER" ? "Actions" : "Ask";

  const mainItems = [
    {
      href: "/",
      icon: HomeIcon,
      label: "Home",
      badge: null,
      badgeClassName: undefined,
      isActive: pathname === "/",
collapseSidebarOnClick: true,
    },
    {
      href: messageHref,
      icon: MessageSquareIcon,
      label: "Messages",
      badge: totalUnreadChannels > 0 ? totalUnreadChannels.toString() : null,
      badgeClassName: "text-white bg-red-500 rounded-full h-4 min-w-[16px] text-[10px] px-1 flex items-center justify-center peer-hover/menu-button:text-white peer-data-active/menu-button:text-white group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:right-1 group-data-[collapsible=icon]:top-1 group-data-[collapsible=icon]:!translate-y-0",
      isActive: pathname.startsWith("/message") || pathname.startsWith("/channel/"),
      collapseSidebarOnClick: true,
    },
    {
      href: leaderboardHref,
      icon: TrophyIcon,
      label: "Leaderboard",
      badge: null,
      badgeClassName: undefined,
      isActive: pathname.startsWith("/leaderboard/"),
      collapseSidebarOnClick: true,
    },
    {
      href: profileHref,
      icon: UserCircle2Icon,
      label: "Profile",
      badge: null,
      badgeClassName: undefined,
      isActive: pathname === profileHref,
      collapseSidebarOnClick: true,
    },
    {
      href: settingsHref,
      icon: Settings2Icon,
      label: "Settings",
      badge: null,
      badgeClassName: undefined,
      isActive: pathname.startsWith("/settings"),
      collapseSidebarOnClick: true,
    },
    ...(resolvedUser.role === "STUDENT"
      ? [{
          href: subscriptionHref,
          icon: CreditCardIcon,
          label: "Subscription",
          badge: null,
          badgeClassName: undefined,
          isActive: pathname.startsWith("/subscription"),
          collapseSidebarOnClick: true,
        }]
      : []),
    {
      href: walletHref,
      icon: WalletIcon,
      label: "Wallet",
      badge: null,
      badgeClassName: undefined,
      isActive: pathname.startsWith("/wallet"),
      collapseSidebarOnClick: true,
    },
    {
      href: "/notes",
      icon: FileTextIcon,
      label: "Notes",
      badge: null,
      badgeClassName: undefined,
      isActive: pathname.startsWith("/notes"),
      collapseSidebarOnClick: true,
    },
    ...(resolvedUser.role === "STUDENT"
      ? [{
          href: "/courses",
          icon: BookOpenIcon,
          label: "Courses",
          badge: null,
          badgeClassName: undefined,
          isActive: pathname.startsWith("/courses") && !pathname.startsWith("/courses/my"),
          collapseSidebarOnClick: true,
        },
        {
          href: "/courses/my",
          icon: GraduationCapIcon,
          label: "My Courses",
          badge: null,
          badgeClassName: undefined,
          isActive: pathname.startsWith("/courses/my"),
          collapseSidebarOnClick: true,
        }]
      : []),
    ...(resolvedUser.role === "TEACHER" || resolvedUser.role === "ADMIN"
      ? [{
          href: "/courses",
          icon: BookOpenIcon,
          label: "Courses",
          badge: null,
          badgeClassName: undefined,
          isActive: pathname.startsWith("/courses") && !pathname.startsWith("/courses/my"),
          collapseSidebarOnClick: true,
        },
        {
          href: "/studio",
          icon: GraduationCapIcon,
          label: "Course Studio",
          badge: null,
          badgeClassName: undefined,
          isActive: pathname.startsWith("/studio"),
          collapseSidebarOnClick: true,
        }]
      : []),
  ] as const;

  const roleLabel = resolvedUser.role === "STUDENT" ? "Student" : "Teacher";
  const roleSummary =
    resolvedUser.role === "STUDENT"
      ? "Ask doubts, follow answers, and manage your learning flow."
      : "Track question activity, channel updates, and reputation from one place.";
  const isSidebarLoading = !channelsHydrated && !hasFailedInitialLoad;

  return (
    <WorkspaceFilterProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <Sidebar collapsible="icon">
          <SidebarHeader className="p-2">
            {isSidebarLoading ? (
              <WorkspaceSidebarHeaderSkeleton />
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-sidebar-border/80 bg-sidebar-accent/75 p-2 shadow-sm group-data-[collapsible=icon]:justify-center">
                <div className="shrink-0">
                  <LogoMark size={32} className="rounded-lg" />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden group-data-[collapsible=icon]:hidden">
                  <h1 className="truncate text-sm font-bold text-sidebar-foreground">{APP_NAME}</h1>
                  <p className="truncate text-xs text-sidebar-foreground/70">@{handle}</p>
                </div>
              </div>
            )}
          </SidebarHeader>

          <SidebarSeparator />

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Navigate</SidebarGroupLabel>
              <SidebarGroupContent>
                {isSidebarLoading ? (
                  <WorkspaceSidebarNavigationSkeleton />
                ) : (
                  <SidebarMenu>
                    {mainItems.map((item) => (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          collapseSidebarOnClick={item.collapseSidebarOnClick}
                          isActive={item.isActive}
                          tooltip={item.label}
                        >
                          <Link href={item.href}>
                            <item.icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                        {item.badge ? (
                          <SidebarMenuBadge className={item.badgeClassName}>
                            {item.badge}
                          </SidebarMenuBadge>
                        ) : null}
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                )}
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Mode</SidebarGroupLabel>
              <SidebarGroupContent>
                {isSidebarLoading ? (
                  <WorkspaceSidebarModeSkeleton />
                ) : (
                  <>
                  <div className="rounded-xl border border-sidebar-border/80 bg-sidebar-accent/70 p-3 text-xs leading-6 text-sidebar-foreground/85 shadow-sm group-data-[collapsible=icon]:hidden">
                    <div className="flex items-center gap-2 text-sidebar-foreground">
                      <SparklesIcon className="size-4" />
                      <span className="font-medium">{roleLabel} mode</span>
                    </div>
                    <p className="mt-2">{roleSummary}</p>
                    
                    {resolvedUser.role === "TEACHER" && dailyTargets.length > 0 && (
                      <div className="mt-3 space-y-1.5 border-t border-sidebar-border/50 pt-3">
                        <div className="flex items-center justify-between font-medium text-sidebar-foreground">
                          <span>Daily Target</span>
                          <span>{user.dailyAnswersCount || 0} / {dailyTargets[dailyTargets.length - 1]?.target || 0}</span>
                        </div>
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-sidebar-border/50">
                          <div 
                            className="absolute left-0 top-0 h-full bg-primary transition-all duration-500" 
                            style={{ 
                              width: `${Math.min(100, ((user.dailyAnswersCount || 0) / (dailyTargets[dailyTargets.length - 1]?.target || 1)) * 100)}%` 
                            }} 
                          />
                          {dailyTargets.map((t, i) => {
                            const leftPercent = (t.target / (dailyTargets[dailyTargets.length - 1]?.target || 1)) * 100;
                            return (
                              <div 
                                key={i} 
                                className="absolute top-0 h-full w-[2px] bg-sidebar-background z-10" 
                                style={{ left: `${leftPercent}%` }}
                                title={`${t.target} Qs = ${t.bonus} NPR`}
                              />
                            );
                          })}
                        </div>
                        <button
                          onClick={() => setShowTargetInfoModal(true)}
                          className="mt-1.5 flex items-center gap-1 text-[10px] text-primary hover:underline mx-auto"
                        >
                          <InfoIcon className="size-3" />
                          Learn how bonuses work
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Collapsed circular progress for daily target */}
                  {resolvedUser.role === "TEACHER" && dailyTargets.length > 0 && (() => {
                    const maxTarget = dailyTargets[dailyTargets.length - 1]?.target || 1;
                    const count = user.dailyAnswersCount || 0;
                    const pct = Math.min(1, count / maxTarget);
                    const r = 14;
                    const circ = 2 * Math.PI * r;
                    const offset = circ * (1 - pct);
                    const nextTarget = dailyTargets.find(t => t.target > count);
                    return (
                      <button
                        onClick={() => setShowTargetInfoModal(true)}
                        className="hidden group-data-[collapsible=icon]:flex relative items-center justify-center mx-auto"
                        title={nextTarget ? `${count}/${nextTarget.target} — next bonus: ${nextTarget.bonus} NPR` : `${count} solved today!`}
                      >
                        <svg width="36" height="36" viewBox="0 0 36 36" className="-rotate-90">
                          <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3" className="stroke-sidebar-border/40" />
                          <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-primary transition-all duration-500" strokeDasharray={circ} strokeDashoffset={offset} />
                        </svg>
                        <span className="absolute text-[9px] font-bold text-sidebar-foreground">{count}</span>
                      </button>
                    );
                  })()}
                  </>
                )}
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter>
            <div className="flex items-center justify-between px-2 pb-2 md:hidden">
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <SocialHandlesHover links={liveSocialLinks} />
              </div>
              <NotificationBell userId={resolvedUser.id} />
            </div>
            <NavUser
              loading={isSidebarLoading}
              user={{
                name: resolvedUser.name || roleLabel,
                email: resolvedUser.email || "",
                role: resolvedUser.role,
                teacherModeVerified: user.teacherModeVerified ?? false,
                totalAnswered: user.totalAnswered ?? 0,
                userImage: resolvedUser.userImage || "",
              }}
            />
          </SidebarFooter>

          <SidebarRail />
        </Sidebar>

        <SidebarInset
          className={cn(
            "flex flex-col bg-[#f6f8fb] dark:bg-background",
            isChatPage ? "h-svh overflow-hidden" : "min-h-svh",
            shouldUsePwaChrome && "bg-background",
          )}
        >
          <OnboardingVideoModal />

          {hidePwaChrome ? null : shouldUsePwaChrome ? (
            <WorkspacePwaTopBar
              userId={resolvedUser.id}
            />
          ) : (
            <AuthenticatedHeader
              isScrolled={isScrolled}
              primaryHref={headerPrimaryHref}
              primaryLabel={headerPrimaryLabel}
              showQuizLink={resolvedUser.role === "STUDENT"}
              showQuestionFilter={showQuestionFilter}
              useModalForPrimary={headerUseModal}
              socialLinks={liveSocialLinks}
              userId={resolvedUser.id}
            />
          )}

          <div
            className={cn(
              "flex flex-1 flex-col",
              isChatPage ? "overflow-hidden" : "gap-6 px-4 py-6 lg:px-6",
              shouldUsePwaChrome &&
                !isChatPage &&
                "gap-4 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5",
              shouldUsePwaChrome &&
                pathname === "/menu" &&
                "px-0 pt-0",
              hidePwaChrome && !isChatPage && "gap-0 px-0 py-0",
              shouldUsePwaChrome &&
                isChatPage &&
                "pb-[calc(5rem+env(safe-area-inset-bottom))]",
            )}
          >
            {children}
          </div>

          {shouldUsePwaChrome ? (
            <WorkspacePwaBottomNav
              centerHref={
                resolvedUser.role === "TEACHER" ? "/actions" : "/ask/question"
              }
              centerLabel={pwaCenterLabel}
              items={pwaBottomItems}
            />
          ) : null}
        </SidebarInset>

        {/* ── Global call overlays (mounted outside sidebar) ─── */}
        <IncomingCallOverlay
          call={activeIncomingCall}
          onDismiss={() => removeIncomingCall(activeIncomingCall?.callSessionId)}
          isSilent={resolvedCallSettings.silentIncomingCalls}
          ringtone={resolvedCallSettings.incomingRingtone}
        />
        <OutgoingCallOverlay
          call={outgoingCall}
          onDismiss={() => {
            setOutgoingCall(null);
            setOutgoingAcceptedCallId(null);
            setOutgoingRejectedCallId(null);
            setOutgoingMissedCallId(null);
          }}
          wasAccepted={outgoingAcceptedCallId === outgoingCall?.callSessionId}
          wasRejected={outgoingRejectedCallId === outgoingCall?.callSessionId}
          wasMissed={outgoingMissedCallId === outgoingCall?.callSessionId}
          ringbackTone={resolvedCallSettings.outgoingRingtone}
        />

        {/* ── Daily Target Info Modal ────────────────────────── */}
        {resolvedUser.role === "TEACHER" && dailyTargets.length > 0 && (
          <Dialog open={showTargetInfoModal} onOpenChange={setShowTargetInfoModal}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <TargetIcon className="size-5 text-primary" />
                  Daily Target Bonuses
                </DialogTitle>
                <DialogDescription className="text-foreground/90">
                  Earn bonus NPR by solving questions every day. The more you solve, the bigger the bonus!
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2">
                <div className="rounded-lg border bg-muted/30 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-2.5 text-left font-semibold text-foreground/80">Target</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-foreground/80">Bonus</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-foreground/80">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyTargets.map((t, i) => {
                        const count = user.dailyAnswersCount || 0;
                        const achieved = count >= t.target;
                        return (
                          <tr key={i} className={cn("border-b last:border-0 transition-colors", achieved ? "bg-primary/5" : "")}>
                            <td className="px-4 py-2.5 font-medium">
                              {t.target} questions
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                +{t.bonus} NPR
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {achieved ? (
                                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">✓ Achieved</span>
                              ) : (
                                <span className="text-xs text-foreground/80">{Math.max(0, t.target - count)} left</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-foreground">
                  <p className="font-semibold mb-1">How it works:</p>
                  <ul className="space-y-1 text-foreground/90 list-disc pl-4">
                    <li>Solve questions throughout the day — each closed channel counts.</li>
                    <li>When you hit a target, the bonus is <strong className="text-foreground">automatically added</strong> to your wallet.</li>
                    <li>All targets reset at midnight — bonuses are earned daily!</li>
                    <li>You must be a <strong className="text-foreground">monetized teacher</strong> to receive NPR bonuses.</li>
                  </ul>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-2.5 text-sm">
                  <span className="text-foreground/80">Today&apos;s progress</span>
                  <span className="font-bold text-foreground">{user.dailyAnswersCount || 0} / {dailyTargets[dailyTargets.length - 1]?.target || 0} questions</span>
                </div>
              </div>

              <DialogFooter showCloseButton />
            </DialogContent>
          </Dialog>
        )}
      </SidebarProvider>
    </WorkspaceFilterProvider>
  );
}

