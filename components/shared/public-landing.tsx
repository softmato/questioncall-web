"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowRightIcon,
  type LucideIcon,
  GraduationCapIcon,
  MessagesSquareIcon,
  MoonIcon,
  SparklesIcon,
  SunIcon,
  Users2Icon,
  TrophyIcon,
  BrainCircuitIcon,
  WalletIcon,
  ClockIcon,
  StarIcon,
  CheckCircleIcon,
  ZapIcon,
  VideoIcon,
  ImageIcon,
  FileTextIcon,
  ShieldCheckIcon,
  AwardIcon,
  ChevronDownIcon,
  PlayCircleIcon,
  UsersIcon,
  CalendarIcon,
  BookOpenIcon,
  MailIcon,
  MoreHorizontalIcon,
  PhoneIcon,
} from "lucide-react";
import { useTheme } from "next-themes";

import { getSignInPath, getSignUpPath } from "@/lib/user-paths";
import { APP_NAME, CONTACT_SERVICE_EMAIL } from "@/lib/constants";
import { ChevronDown, PlusIcon } from "lucide-react"; 
import type { PlatformSocialLinks } from "@/models/PlatformConfig";
import {
  formatLandingDuration,
  getLandingItemColor,
  type LandingLibraryItem,
} from "@/lib/landing-library";
import { SocialHandlesDirect } from "@/components/shared/social-handles-hover"; 

const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

function useHasHydrated() {
  return useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
}

/* ─────────────────────── STYLES ─────────────────────── */
function LandingStyles() {
  return (
    <style suppressHydrationWarning>{`
      .shiny-pill {
        position: relative;
        overflow: hidden;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 0.4rem 1rem;
        border-radius: 100px;
        border: 1px solid rgba(31,118,110,0.35);
        background: rgba(31,118,110,0.08);
        margin-bottom: 1.5rem;
      }

      .shiny-effect-active {
        position: relative;
        overflow: hidden;
      }

      /* moving shine */
      .shiny-pill::before,
      .shiny-effect-active::before {
        content: "";
        position: absolute;
        top: 0;
        left: -75%;
        width: 50%;
        height: 100%;
        background: linear-gradient(
          120deg,
          transparent,
          rgba(255, 255, 255, 0.5),
          transparent
        );
        transform: skewX(-20deg);
        animation: shine 2.5s linear infinite;
        pointer-events: none;
      }

      @keyframes shine {
        0% { left: -75%; }
        100% { left: 125%; }
      }

      @keyframes scribble-glow {
        0% { filter: drop-shadow(0 0 2px rgba(31,118,110,0.4)) brightness(1); }
        50% { filter: drop-shadow(0 0 8px rgba(42,181,171,0.8)) brightness(1.3); }
        100% { filter: drop-shadow(0 0 2px rgba(31,118,110,0.4)) brightness(1); }
      }
      .scribble-glow {
        animation: scribble-glow 2s ease-in-out infinite;
      }

      .shiny-text {
        font-size: 13.5px;
        font-weight: 700;
        color: #1f2937;
        letter-spacing: 0.06em;
      }
      .lpb-hero-notch {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        max-width: min(100%, 560px);
        margin: 0 auto 1.55rem;
        padding: 0.52rem 0.75rem 0.52rem 0.58rem;
        border-radius: 999px;
        border: 1px solid rgba(42,181,171,0.32);
        background:
          linear-gradient(135deg, rgba(31,118,110,0.18), rgba(8,20,18,0.72)),
          rgba(8,20,18,0.68);
        box-shadow:
          0 18px 42px rgba(0,0,0,0.18),
          0 0 34px rgba(42,181,171,0.12),
          inset 0 1px 0 rgba(255,255,255,0.08);
        backdrop-filter: blur(16px);
      }
      .lpb-hero-notch-shine {
        position: absolute;
        z-index: 0;
        inset: 0;
        border-radius: inherit;
        overflow: hidden;
        pointer-events: none;
      }
      .lpb-hero-notch-shine::before {
        content: "";
        position: absolute;
        top: 0;
        left: -75%;
        width: 45%;
        height: 100%;
        background: linear-gradient(
          120deg,
          transparent,
          rgba(255,255,255,0.65),
          transparent
        );
        transform: skewX(-20deg);
        animation: shine 2.8s linear infinite;
        pointer-events: none;
      }
      .lpb-hero-notch::after {
        content: "";
        position: absolute;
        z-index: 0;
        left: 50%;
        bottom: -7px;
        width: 14px;
        height: 14px;
        transform: translateX(-50%) rotate(45deg);
        border-right: 1px solid rgba(42,181,171,0.2);
        border-bottom: 1px solid rgba(42,181,171,0.2);
        background: rgba(13,46,42,0.9);
      }
      .lpb-hero-notch-icon {
        position: relative;
        z-index: 1;
        display: inline-flex;
        width: 28px;
        height: 28px;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        border-radius: 999px;
        background: rgba(126,229,220,0.12);
        box-shadow: inset 0 0 0 1px rgba(126,229,220,0.24);
      }
      .lpb-hero-notch-text {
        position: relative;
        z-index: 1;
        display: inline-flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 5px;
        color: #d2f2ed;
        font-size: 13.5px;
        font-weight: 800;
        line-height: 1.35;
      }
      .lpb-hero-notch-kicker {
        position: relative;
        display: inline-flex;
        align-items: center;
        color: #7ee5dc;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 11px;
      }
      .lpb-hero-notch-count {
        color: #ffffff;
        font-weight: 900;
      }
      .lpb-hero-notch-divider {
        position: relative;
        z-index: 1;
        width: 1px;
        height: 18px;
        flex-shrink: 0;
        background: rgba(255,255,255,0.2);
      }
      html:not(.dark) .lpb-hero-notch {
        border-color: rgba(17,24,39,0.08);
        background: rgba(255,255,255,0.94);
        box-shadow:
          0 18px 36px rgba(17,24,39,0.14),
          0 0 26px rgba(255,255,255,0.95),
          inset 0 1px 0 rgba(255,255,255,1);
      }
      html:not(.dark) .lpb-hero-notch::after {
        background: rgba(255,255,255,0.94);
        border-color: rgba(17,24,39,0.08);
      }
      html:not(.dark) .lpb-hero-notch-icon {
        background: rgba(0,0,0,0.03);
        box-shadow: inset 0 0 0 1px rgba(17,24,39,0.12);
      }
      html:not(.dark) .lpb-hero-notch-text {
        color: #111827;
      }
      html:not(.dark) .lpb-hero-notch-kicker {
        color: #111827;
      }
      html:not(.dark) .lpb-hero-notch-count {
        color: #030712;
      }
      html:not(.dark) .lpb-hero-notch-divider {
        background: rgba(17,24,39,0.14);
      }
      @media (max-width: 520px) {
        .lpb-hero-notch {
          align-items: flex-start;
          border-radius: 18px;
          padding: 0.65rem 0.8rem;
        }
        .lpb-hero-notch-text {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 1px;
          text-align: left;
        }
      }
      
      html.dark .shiny-text {
        color: #f9fafb;
      }
      .lpb-btn { transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
      .lpb-btn:hover { transform: translateY(-2px); }
      .lpb-nav-chip { border: 1px solid transparent; transition: all 0.2s ease; }
      .lpb-nav-chip:hover {
        transform: translateY(-1px);
        background: rgba(31,118,110,0.1);
        border-color: rgba(31,118,110,0.22);
        box-shadow: 0 12px 28px rgba(31,118,110,0.12);
      }
      .lpb-section-pill {
        transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
        box-shadow: 0 0 0 rgba(31,118,110,0);
      }
      .lpb-section-pill:hover {
        transform: translateY(-1px) scale(1.02);
        filter: saturate(1.08) brightness(1.02);
        box-shadow: 0 12px 28px rgba(31,118,110,0.12);
      }
      .lpb-footer-link,
      .lpb-footer-contact-chip {
        transition: transform 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
      }
      .lpb-footer-contact-row { justify-content: flex-start; }
      .lpb-footer-link:hover,
      .lpb-footer-contact-chip:hover {
        transform: translateY(-1px);
      }
      .lpb-btn-primary { background: linear-gradient(135deg, #1f766e, #0f5c55); box-shadow: 0 4px 14px rgba(31,118,110,0.4); }
      .lpb-btn-primary:hover { background: linear-gradient(135deg, #238e87, #1a6d65); box-shadow: 0 8px 28px rgba(31,118,110,0.55), 0 0 20px rgba(31,118,110,0.25); }
      .lpb-btn-secondary { border: 1.5px solid rgba(31,118,110,0.35); background: rgba(255,255,255,0.8); }
      .lpb-btn-secondary:hover { background: rgba(31,118,110,0.1); border-color: rgba(31,118,110,0.5); box-shadow: 0 0 20px rgba(31,118,110,0.15); }
      .lpb-btn-dark { border: 1.5px solid rgba(31,118,110,0.45); background: rgba(31,118,110,0.1); }
      .lpb-btn-dark:hover { background: rgba(31,118,110,0.2); box-shadow: 0 0 20px rgba(31,118,110,0.2); }
      .lpb-btn-ghost { color: #4a8a82; }
      .lpb-btn-ghost:hover { color: #1f766e; text-decoration: underline; }
      @media (max-width: 767px) {
        .lpb-mobile-btn {
          font-size: 12px !important;
          padding: 0.38rem 0.75rem !important;
          border-radius: 10px !important;
        }
        .lpb-student-feed-shell {
          grid-template-columns: 1fr !important;
        }
        .lpb-student-feed-sidebar {
          display: none !important;
        }
        .lpb-two-col {
          grid-template-columns: 1fr !important;
          gap: 18px !important;
        }
        .lpb-compare-grid {
          grid-template-columns: minmax(0, 1fr) 74px 74px !important;
        }
        .lpb-footer-shell {
          grid-template-columns: 1fr !important;
          text-align: center !important;
          gap: 2.5rem !important;
          padding: 2.5rem 1.5rem !important;
        }
        .lpb-footer-brand {
          align-items: center !important;
        }
        .lpb-footer-links {
          align-items: center !important;
        }
        .lpb-footer-meta {
          align-items: center !important;
        }
        .lpb-developer-credit {
          align-self: center !important;
          margin-top: 1rem !important;
        }
        .lpb-footer-contact-row {
          justify-content: center !important;
        }
        .lpb-stats-bar {
          min-width: 0 !important;
          justify-content: center !important;
          flex-wrap: wrap !important;
          gap: 14px 18px !important;
        }
        .lpb-two-by-two {
          grid-template-columns: 1fr !important;
        }
      }
      .lpb-two-by-two {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    `}</style>
  );
}

/* ─────────────────────── PLATFORM DATA (from spec) ─────────────────────── */
type TierItem = {
  name: string;
  icon: LucideIcon;
  time: string;
  color: string;
  bg: string;
};

type BenefitItem = {
  icon: LucideIcon;
  title: string;
  desc: string;
};

type CustomerServiceDetails = {
  phoneNumbers: string[];
  emails: string[];
};

type PlatformData = {
  name: string;
  tagline: string;
  trialDays: number;
  qualificationAnswers: number;
  quizPassPercent: number;
  quizPoints: number;
  tiers: TierItem[];
  studentBenefits: BenefitItem[];
  teacherBenefits: BenefitItem[];
};

const QUALIFICATION_ANSWERS = 10;
const DEFAULT_CUSTOMER_SERVICE_DETAILS: CustomerServiceDetails = {
  phoneNumbers: [],
  emails: [CONTACT_SERVICE_EMAIL],
};

const PLATFORM: PlatformData = {
  name: APP_NAME,
  tagline: "Fast teacher help for academic questions",
  trialDays: 3,
  qualificationAnswers: QUALIFICATION_ANSWERS,
  quizPassPercent: 90,
  quizPoints: 5,
  tiers: [
    {
      name: "Text",
      icon: FileTextIcon,
      time: "15 min",
      color: "#1f766e",
      bg: "rgba(31,118,110,0.12)",
    },
    {
      name: "Photo",
      icon: ImageIcon,
      time: "15 min",
      color: "#2176ae",
      bg: "rgba(33,118,174,0.12)",
    },
    {
      name: "Video",
      icon: VideoIcon,
      time: "15 min",
      color: "#7c3aed",
      bg: "rgba(124,58,237,0.12)",
    },
  ],
  studentBenefits: [
    {
      icon: MessagesSquareIcon,
      title: "Ask with the right format",
      desc: "Post any academic question, attach screenshots or files, request a text, photo, or video answer, and choose whether it stays public or private.",
    },
    {
      icon: VideoIcon,
      title: "Stay connected while it is being solved",
      desc: "Once a teacher accepts, a live answer screen opens where both sides can chat, share files, and switch to audio or video calls.",
    },
    {
      icon: BrainCircuitIcon,
      title: "Practice in the quiz portal",
      desc: "Take AI-generated MCQ sessions by subject and topic. Score 90%+ to earn money that helps on your next renewal.",
    },
    {
      icon: BookOpenIcon,
      title: "Go deeper with courses",
      desc: "Move from one-off doubt solving into structured learning with recorded video courses, progress tracking, and premium live sessions.",
    },
    {
      icon: TrophyIcon,
      title: "Earn money and visibility",
      desc: "Quiz passes and accepted peer help add money to your account, while the leaderboard highlights active students and contributors.",
    },
    {
      icon: ShieldCheckIcon,
      title: "Control who sees the answer",
      desc: "Use the public feed when others can learn from it, or keep the answer private when you want direct help in your own inbox.",
    },
  ],
  teacherBenefits: [
    {
      icon: ZapIcon,
      title: "Accept questions live",
      desc: "Pick questions from the live question feed and lock them before another teacher takes them.",
    },
    {
      icon: VideoIcon,
      title: "Teach on one screen",
      desc: "Read uploads, reply fast, share files, and move into audio or video calls without leaving the answer screen.",
    },
    {
      icon: StarIcon,
      title: "Build a visible teaching record",
      desc: "Students rate finished help, and consistent answers improve your standing across the platform and in future matches.",
    },
    {
      icon: AwardIcon,
      title: "Qualify quickly",
      desc: `Finish your first ${QUALIFICATION_ANSWERS} answers to unlock full earning eligibility and move into the regular answer flow.`,
    },
    {
      icon: ClockIcon,
      title: "Work against a fast timer",
      desc: "Accepted questions come with a 15-minute answer timer, so help stays fast for students and fair for teachers.",
    },
    {
      icon: WalletIcon,
      title: "Track value in your wallet",
      desc: "Completed work settles into the teacher wallet so you can monitor progress, conversion value, and withdrawal requests in one place.",
    },
  ],
};

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Ask your question",
    desc: "Post your question, add a screenshot or file if needed, and choose public or private.",
  },
  {
    step: "02",
    title: "Teacher picks it",
    desc: "A teacher picks your question, and your answer screen opens right away with the timer already on.",
  },
  {
    step: "03",
    title: "Solve it together",
    desc: "Chat, share files, or jump on audio or video if you want a faster explanation.",
  },
  {
    step: "04",
    title: "Get your answer",
    desc: "See the final answer, review it, and rate the help in the same place.",
  },
];

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ SHARED HOOKS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function useScrollReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ NAV â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function Nav() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const isDark = resolvedTheme === "dark";
  const [scrolled, setScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isMenuOpen]);

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        transition: "all 0.3s ease",
        borderBottom: scrolled
          ? "1px solid rgba(31,118,110,0.18)"
          : "1px solid transparent",
        background: scrolled
          ? isDark
            ? "rgba(15,25,20,0.82)"
            : "rgba(255,255,255,0.82)"
          : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 1rem",
          height: 56,
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
            minWidth: 0,
            flexShrink: 1,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <Image
              src="/logo.png"
              alt="Question Call logo"
              width={38}
              height={38}
              priority
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: isDark ? "#f9fafb" : "#030712",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {APP_NAME}
          </span>
        </Link>

        {/* Desktop nav - shown on md+ (768px+) */}
        <nav
          className="lpb-desktop-nav"
          style={{
            display: "none",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
            justifyContent: "flex-end",
            marginLeft: 16,
            minWidth: 0,
            flex: 1,
          }}
        >
          {[
            { href: "/courses", label: "Courses" },
            { href: "#how-it-works", label: "How it works" },
            { href: "#for-students", label: "Students" },
            { href: "#for-teachers", label: "Teachers" },
            { href: "#quiz", label: "Quiz" },
            { href: "#faq", label: "FAQ" },
            { href: "/legal", label: "Privacy Policy" },
          ].map((item) =>
            item.href.startsWith("#") ? (
              <a
                key={item.label}
                href={item.href}
                style={{
                  padding: "0.45rem 0.7rem",
                  borderRadius: 8,
                  textDecoration: "none",
                  fontSize: 12,
                  fontWeight: 600,
                  color: isDark ? "#d1d5db" : "#374151",
                }}
                className="lpb-btn"
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.label}
                href={item.href}
                style={{
                  padding: "0.45rem 0.7rem",
                  borderRadius: 8,
                  textDecoration: "none",
                  fontSize: 12,
                  fontWeight: 600,
                  color: isDark ? "#d1d5db" : "#374151",
                }}
                className="lpb-btn"
              >
                {item.label}
              </Link>
            ),
          )}
          <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            style={{
              padding: "0.45rem 0.7rem",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              color: isDark ? "#d1d5db" : "#374151",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
            className="lpb-btn"
          >
            {mounted &&
              (isDark ? <SunIcon size={14} /> : <MoonIcon size={14} />)}
            <span>{isDark ? "Light" : "Dark"}</span>
          </button>
          <Link
            href={getSignInPath()}
            style={{
              padding: "0.45rem 0.8rem",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 10,
              textDecoration: "none",
              color: isDark ? "#d1d5db" : "#374151",
            }}
            className="lpb-btn"
          >
            Sign in
          </Link>
          <Link
            href={getSignUpPath("TEACHER")}
            style={{
              padding: "0.45rem 0.8rem",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 10,
              border: "1px solid rgba(31,118,110,0.35)",
              textDecoration: "none",
              color: isDark ? "#d1d5db" : "#374151",
            }}
            className="lpb-btn"
          >
            Teacher
          </Link>
          <Link
            href={getSignUpPath("STUDENT")}
            className="lpb-btn lpb-btn-primary shiny-effect-active"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "0.5rem 0.95rem",
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 10,
              color: "#fff",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Free Trial
          </Link>
        </nav>

        {/* Mobile nav - shown below md (below 768px) */}
        <div
          ref={menuRef}
          className="lpb-mobile-nav"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            position: "relative",
            zIndex: 40,
          }}
        >
          <Link
            href={getSignUpPath("STUDENT")}
            className="lpb-btn lpb-btn-primary lpb-mobile-btn shiny-effect-active"
            style={{
              padding: "0.45rem 0.9rem",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 10,
              color: "#fff",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Free Trial
          </Link>
          <button
            type="button"
            onClick={() => setIsMenuOpen((current) => !current)}
            aria-label="Open navigation menu"
            className="lpb-mobile-btn"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: "1px solid rgba(31,118,110,0.25)",
              background: isDark
                ? "rgba(15,35,30,0.72)"
                : "rgba(255,255,255,0.82)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: isDark ? "#d1d5db" : "#374151",
              boxShadow: scrolled ? "0 12px 28px rgba(15,50,46,0.12)" : "none",
            }}
          >
            <MoreHorizontalIcon size={16} />
          </button>
          {isMenuOpen ? (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 10px)",
                minWidth: 220,
                borderRadius: 18,
                border: `1px solid ${isDark ? "rgba(31,118,110,0.25)" : "rgba(31,118,110,0.18)"}`,
                background: isDark
                  ? "rgba(8,20,18,0.94)"
                  : "rgba(255,255,255,0.96)",
                backdropFilter: "blur(18px)",
                boxShadow: "0 24px 60px rgba(0,0,0,0.16)",
                padding: 10,
                display: "grid",
                gap: 6,
                zIndex: 50,
                pointerEvents: "auto",
              }}
            >
              {[
                { href: getSignInPath(), label: "Sign in" },
                { href: getSignUpPath("TEACHER"), label: "Teacher signup" },
                { href: "/courses", label: "Courses" },
                { href: "#how-it-works", label: "How it works" },
                { href: "#for-students", label: "Students" },
                { href: "#for-teachers", label: "Teachers" },
                { href: "#quiz", label: "Quiz" },
                { href: "#faq", label: "FAQ" },
              ].map((item) =>
                item.href.startsWith("#") ? (
                  <a
                    key={item.label}
                    href={item.href}
                    onClick={() => setIsMenuOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "0.7rem 0.8rem",
                      borderRadius: 12,
                      textDecoration: "none",
                      fontSize: 13,
                      fontWeight: 600,
                      color: isDark ? "#f9fafb" : "#030712",
                      background: "transparent",
                    }}
                    className="lpb-nav-chip"
                  >
                    <span>{item.label}</span>
                    <ArrowRightIcon size={14} />
                  </a>
                ) : (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setIsMenuOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "0.7rem 0.8rem",
                      borderRadius: 12,
                      textDecoration: "none",
                      fontSize: 13,
                      fontWeight: 600,
                      color: isDark ? "#f9fafb" : "#030712",
                      background: "transparent",
                    }}
                    className="lpb-nav-chip"
                  >
                    <span>{item.label}</span>
                    <ArrowRightIcon size={14} />
                  </Link>
                ),
              )}

              <button
                type="button"
                onClick={() => {
                  setTheme(isDark ? "light" : "dark");
                  setIsMenuOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "0.7rem 0.8rem",
                  borderRadius: 12,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  color: isDark ? "#f9fafb" : "#030712",
                }}
                className="lpb-nav-chip"
              >
                <span>{isDark ? "Light mode" : "Dark mode"}</span>
                {mounted &&
                  (isDark ? <SunIcon size={14} /> : <MoonIcon size={14} />)}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <style>{`
        @media (min-width: 768px) {
          .lpb-desktop-nav { display: flex !important; }
          .lpb-mobile-nav { display: none !important; }
        }
        @media (max-width: 767px) {
          .lpb-desktop-nav { display: none !important; }
          .lpb-mobile-nav { display: flex !important; }
        }
      `}</style>
    </header>
  );
}

/* ─────────────────────── HERO ─────────────────────── */
function formatUserCount(count: number) {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(count)));
}

function Hero({
  isDark,
  landingDisplayUserCount,
}: {
  isDark: boolean;
  landingDisplayUserCount: number;
}) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setCount(1), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        minHeight: "92vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "6rem 1.5rem 4rem",
      }}
    >
      {/* Background Image */}
      {/* <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "url('/assets/landing-bg.png')",
          backgroundSize: "115% auto",
          backgroundPosition: "top center",
          backgroundRepeat: "no-repeat",
          opacity: isDark ? 0.02 : 0.2,
          pointerEvents: "none",
        }}
      /> */}

      {/* Ambient blobs */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-15%",
            right: "5%",
            width: 600,
            height: 600,
            borderRadius: "50%",
            background:
              "radial-gradient(circle,rgba(31,118,110,0.18) 0%,transparent 70%)",
            filter: "blur(60px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "0%",
            left: "-10%",
            width: 500,
            height: 500,
            borderRadius: "50%",
            background:
              "radial-gradient(circle,rgba(33,118,174,0.12) 0%,transparent 70%)",
            filter: "blur(60px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "40%",
            left: "40%",
            width: 400,
            height: 400,
            borderRadius: "50%",
            background:
              "radial-gradient(circle,rgba(124,58,237,0.07) 0%,transparent 70%)",
            filter: "blur(80px)",
          }}
        />

      </div>

      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 900,
          textAlign: "center",
        }}
      >
        <div
          className="lpb-hero-notch"
          style={{
            opacity: count ? 1 : 0,
            transform: count ? "translateY(0)" : "translateY(16px)",
            transition: "all 0.5s",
          }}
        >
          <span className="lpb-hero-notch-shine" aria-hidden="true" />
          <span className="lpb-hero-notch-icon">
            <SparklesIcon size={15} color={isDark ? "#7ee5dc" : "#111827"} />
          </span>
          <span className="lpb-hero-notch-text">
            <span className="lpb-hero-notch-kicker">Emerging platform</span>
            <span className="lpb-hero-notch-divider" aria-hidden="true" />
            <span>
              Already{" "}
              <span className="lpb-hero-notch-count">
                {formatUserCount(landingDisplayUserCount)}
              </span>{" "}
              users on our platform
            </span>
          </span>
        </div>

        <h1
          style={{
            fontSize: "clamp(2.6rem,6vw,4.5rem)",
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: "-0.04em",
            color: isDark ? "#f9fafb" : "#030712",
            marginBottom: "1.5rem",
            opacity: count ? 1 : 0,
            transform: count ? "translateY(0)" : "translateY(20px)",
            transition: "all 0.5s 0.1s",
          }}
        >
          Ask{" "}
          <span style={{ position: "relative", whiteSpace: "nowrap" }}>
            your
            <svg
              viewBox="0 0 100 20"
              preserveAspectRatio="none"
              style={{
                position: "absolute",
                bottom: -2,
                left: -2,
                width: "105%",
                height: 12,
                zIndex: -1,
                overflow: "visible",
              }}
            >
              <path
                d="M 2 12 Q 25 18 50 12 T 98 15 M 5 16 Q 30 22 60 16 T 95 20 M 10 20 Q 45 10 80 22"
                stroke={isDark ? "#2ab5ab" : "#1f766e"}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                className="scribble-glow"
              />
            </svg>
          </span>{" "}
          question. <br className="hidden md:block" /> Get a teacher working <br className="hidden md:block" /> on them{" "}
          <span style={{ position: "relative", whiteSpace: "nowrap" }}>
            fast
            <svg
              viewBox="0 0 100 20"
              preserveAspectRatio="none"
              style={{
                position: "absolute",
                bottom: -2,
                left: -2,
                width: "105%",
                height: 12,
                zIndex: -1,
                overflow: "visible",
              }}
            >
              <path
                d="M 2 15 Q 30 10 60 18 T 98 12 M 5 18 Q 40 25 70 14 T 95 20 M 15 22 Q 50 12 85 24"
                stroke={isDark ? "#2ab5ab" : "#1f766e"}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                className="scribble-glow"
              />
            </svg>
          </span>.
        </h1>

        <p
          style={{
            fontSize: "clamp(1rem,2vw,1.2rem)",
            lineHeight: 1.7,
            color: isDark ? "#e5e7eb" : "#1f2937",
            maxWidth: 620,
            margin: "0 auto 2.5rem",
            opacity: count ? 1 : 0,
            transform: count ? "translateY(0)" : "translateY(20px)",
            transition: "all 0.5s 0.2s",
          }}
        >
          Students post academic questions, teachers accept them live, and a
          private answer screen opens right away.
          <br />
          Get help within minutes using chat, audio or video calls, and file
          sharing while the answer is being solved.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            justifyContent: "center",
            marginBottom: "4rem",
            opacity: count ? 1 : 0,
            transform: count ? "translateY(0)" : "translateY(20px)",
            transition: "all 0.5s 0.3s",
          }}
        >
          <Link
            href={getSignUpPath("STUDENT")}
            className="lpb-btn lpb-btn-primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "0.8rem 1.8rem",
              borderRadius: 12,
              color: "#fff",
              fontWeight: 700,
              fontSize: 15,
              textDecoration: "none",
            }}
          >
            I&apos;m a Student <ArrowRightIcon size={16} />
          </Link>
          <Link
            href={getSignUpPath("TEACHER")}
            className={`lpb-btn ${isDark ? "lpb-btn-dark" : "lpb-btn-secondary"}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "0.8rem 1.8rem",
              borderRadius: 12,
              color: isDark ? "#d1d5db" : "#374151",
              fontWeight: 700,
              fontSize: 15,
              textDecoration: "none",
              backdropFilter: "blur(10px)",
            }}
          >
            I&apos;m a Teacher
          </Link>
          <Link
            href={getSignInPath()}
            className="lpb-btn lpb-btn-ghost"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "0.8rem 1.4rem",
              borderRadius: 12,
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Sign in →
          </Link>
        </div>

        {/* App preview mockup */}
        <HeroMockup isDark={isDark} />
      </div>

      <a
        href="#how-it-works"
        style={{
          position: "absolute",
          bottom: 32,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          color: isDark ? "#e5e7eb" : "#1f2937",
          textDecoration: "none",
          animation: "bounce 2s infinite",
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.08em",
            opacity: 0.7,
          }}
        >
          SCROLL
        </span>
        <ChevronDownIcon size={20} />
      </a>

      <style>{`@keyframes bounce{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(-6px)}}`}</style>
    </section>
  );
}

/* ─────────────────────── HERO MOCKUP ─────────────────────── */
/* ─────────────────────── HERO MOCKUP ─────────────────────── */
function HeroMockup({ isDark }: { isDark: boolean }) {
  const bg = isDark ? "rgba(10,13,11,0.85)" : "rgba(255,255,255,0.85)";
  const border = isDark ? "rgba(31,118,110,0.3)" : "rgba(31,118,110,0.2)";
  const card = isDark ? "rgba(15,20,18,0.9)" : "rgba(250,250,250,0.9)";
  const cardBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const textMuted = isDark ? "#82a19e" : "#6aaba4";
  const textMain = isDark ? "#e8f5f3" : "#0d2b27";

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 1050,
        margin: "0 auto",
        borderRadius: 20,
        border: `1px solid ${border}`,
        background: bg,
        backdropFilter: "blur(24px)",
        boxShadow: `0 32px 80px rgba(0,0,0,${isDark ? "0.4" : "0.12"}), 0 0 0 1px ${border}`,
        overflow: "hidden",
      }}
    >
      {/* Screen chrome */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          borderBottom: `1px solid ${border}`,
          background: isDark ? "rgba(7,10,8,0.6)" : "rgba(248,252,251,0.9)",
        }}
      >
        {["#ff5f56", "#ffbd2e", "#27c93f"].map((c) => (
          <div
            key={c}
            style={{
              width: 11,
              height: 11,
              borderRadius: "50%",
              background: c,
              opacity: 0.8,
            }}
          />
        ))}
        <div
          style={{
            flex: 1,
            height: 22,
            borderRadius: 6,
            background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: 11, color: textMuted }}>
            app.questioncall.com
          </span>
        </div>
      </div>

      {/* Content area */}
      <div
        className="lpb-student-feed-shell"
        style={{
          display: "grid",
          gridTemplateColumns: "64px 1fr 280px",
          minHeight: 460,
          textAlign: "left",
        }}
      >
        {/* Left Sidebar (Icon only) */}
        <div
          className="lpb-student-feed-sidebar"
          style={{
            borderRight: `1px solid ${border}`,
            padding: "20px 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            background: isDark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              background: "linear-gradient(135deg,#1f766e,#0f5c55)",
              borderRadius: 6,
              marginBottom: 12,
            }}
          ></div>
          {[
            { icon: "⌂", active: true },
            { icon: "💬" },
            { icon: "🏆" },
            { icon: "🧠" },
            { icon: "📖" },
            { icon: "👛" },
          ].map(({ icon, active }, i) => (
            <div
              key={i}
              style={{
                width: 36,
                height: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 8,
                background: active ? "rgba(31,118,110,0.2)" : "transparent",
                color: active ? "#2ab5ab" : textMuted,
                fontSize: 18,
              }}
            >
              {icon}
            </div>
          ))}
        </div>

        {/* Center Feed */}
        <div
          style={{
            padding: "24px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            borderRight: `1px solid ${cardBorder}`,
          }}
        >
          {/* Header & Filters */}
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 8,
            }}
          >
            {[
              { label: "All", active: true },
              { label: "Waiting" },
              { label: "Accepted" },
              { label: "Solved" },
              { label: "Private" },
            ].map(({ label, active }) => (
              <div
                key={label}
                style={{
                  padding: "5px 14px",
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 600,
                  background: active ? textMain : card,
                  color: active ? (isDark ? "#0a2e2a" : "#fff") : textMuted,
                  border: `1px solid ${active ? textMain : cardBorder}`,
                }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Question 1 */}
          <div
            style={{
              padding: "16px",
              borderRadius: 14,
              border: `1px solid ${cardBorder}`,
              background: card,
              display: "flex",
              gap: 16,
            }}
          >
            {/* Voting */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
              }}
            >
              <div style={{ color: textMuted, fontSize: 10 }}>▲</div>
              <div
                style={{ fontSize: 13, fontWeight: "bold", color: textMain }}
              >
                0
              </div>
            </div>
            {/* Question Details */}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: "#1f766e",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontSize: 10,
                    }}
                  >
                    P
                  </div>
                  <span
                    style={{ fontSize: 12, fontWeight: 600, color: textMain }}
                  >
                    Physics{" "}
                    <span style={{ color: textMuted, fontWeight: "normal" }}>
                      2 min ago
                    </span>
                  </span>
                </div>
                <div
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: "rgba(33,118,174,0.15)",
                    color: "#2ea1f0",
                    fontSize: 11,
                    fontWeight: "bold",
                  }}
                >
                  Teacher accepted
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 11, color: textMuted }}>Asked by</span>
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "#ccc",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#000",
                    fontSize: 8,
                    fontWeight: "bold",
                  }}
                >
                  J
                </div>
                <span
                  style={{ fontSize: 11, fontWeight: 600, color: textMain }}
                >
                  Janaki K.
                </span>
                <span style={{ fontSize: 11, color: textMuted }}>
                  @janaki_k
                </span>
              </div>
              <h4
                style={{
                  margin: "0 0 6px",
                  fontSize: 16,
                  fontWeight: "bold",
                  color: textMain,
                }}
              >
                Why does a satellite stay in orbit instead of falling straight
                back to Earth?
              </h4>
              <p
                style={{
                  margin: "0 0 12px",
                  fontSize: 13,
                  color: textMuted,
                  lineHeight: 1.4,
                }}
              >
                I understand gravity pulls it inward, but I still do not get how
                forward motion balances it. A small diagram would help.
              </p>
              <div style={{ display: "flex", gap: 6 }}>
                <span
                  style={{
                    padding: "2px 10px",
                    borderRadius: 12,
                    background: "rgba(33,118,174,0.15)",
                    color: "#2ea1f0",
                    fontSize: 10,
                    fontWeight: "bold",
                  }}
                >
                  Photo
                </span>
                <span
                  style={{
                    padding: "2px 10px",
                    borderRadius: 12,
                    background: "rgba(71,85,105,0.16)",
                    color: isDark ? "#cbd5e1" : "#475569",
                    fontSize: 10,
                    fontWeight: "bold",
                  }}
                >
                  Private
                </span>
              </div>
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: isDark
                    ? "rgba(33,118,174,0.1)"
                    : "rgba(33,118,174,0.05)",
                  border: `1px solid rgba(33,118,174,0.2)`,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: "#2ea1f0",
                    fontWeight: "bold",
                  }}
                >
                  R. Adhikari accepted this question. A private answer screen is
                  open with chat, file sharing, and audio/video calls.
                </p>
                <div style={{ fontSize: 10, color: textMuted, marginTop: 4 }}>
                  Accepted 2 min ago
                </div>
              </div>
            </div>
          </div>

          {/* Question 2 */}
          <div
            style={{
              padding: "16px",
              borderRadius: 14,
              border: `1px solid ${cardBorder}`,
              background: card,
              display: "flex",
              gap: 16,
            }}
          >
            {/* Voting */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
              }}
            >
              <div style={{ color: textMuted, fontSize: 10 }}>▲</div>
              <div
                style={{ fontSize: 13, fontWeight: "bold", color: textMain }}
              >
                1
              </div>
            </div>
            {/* Question Details */}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: "#7c3aed",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontSize: 10,
                    }}
                  >
                    M
                  </div>
                  <span
                    style={{ fontSize: 12, fontWeight: 600, color: textMain }}
                  >
                    Mathematics{" "}
                    <span style={{ color: textMuted, fontWeight: "normal" }}>
                      9 min ago
                    </span>
                  </span>
                </div>
                <div
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: "rgba(34,197,94,0.15)",
                    color: "#22c55e",
                    fontSize: 11,
                    fontWeight: "bold",
                  }}
                >
                  Solved
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 11, color: textMuted }}>Asked by</span>
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "#ccc",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 8,
                    color: "#000",
                    fontWeight: "bold",
                  }}
                >
                  S
                </div>
                <span
                  style={{ fontSize: 11, fontWeight: 600, color: textMain }}
                >
                  Suman K.
                </span>
                <span style={{ fontSize: 11, color: textMuted }}>@suman_k</span>
              </div>
              <h4
                style={{
                  margin: "0 0 6px",
                  fontSize: 16,
                  fontWeight: "bold",
                  color: textMain,
                }}
              >
                Can you factor x^2 - 5x + 6 and show how to check the answer?
              </h4>
              <p
                style={{
                  margin: "0 0 12px",
                  fontSize: 13,
                  color: textMuted,
                  lineHeight: 1.4,
                }}
              >
                Please show the steps clearly because I keep mixing up the signs
                when I expand the factors back.
              </p>
              <div style={{ display: "flex", gap: 6 }}>
                <span
                  style={{
                    padding: "2px 10px",
                    borderRadius: 12,
                    background: "rgba(31,118,110,0.15)",
                    color: "#1f766e",
                    fontSize: 10,
                    fontWeight: "bold",
                  }}
                >
                  Text
                </span>
                <span
                  style={{
                    padding: "2px 10px",
                    borderRadius: 12,
                    background: "rgba(34,197,94,0.15)",
                    color: "#22c55e",
                    fontSize: 10,
                    fontWeight: "bold",
                  }}
                >
                  Public
                </span>
              </div>
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "rgba(34,197,94,0.1)",
                  border: `1px solid rgba(34,197,94,0.2)`,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: "#22c55e",
                    fontWeight: "bold",
                  }}
                >
                  ✓ Solved with a step-by-step answer
                </p>
                <p
                  style={{ margin: "2px 0 0", fontSize: 11, color: textMuted }}
                >
                  The teacher also shared a short worksheet on the same answer
                  screen.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar (Highlights & Top Teachers) */}
        <div
          className="lpb-student-feed-sidebar"
          style={{
            padding: "24px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {/* Live help highlight */}
          <div>
            <div
              style={{
                fontSize: 11,
                color: textMuted,
                fontWeight: "bold",
                marginBottom: 6,
              }}
            >
              Highlights
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: "bold",
                color: textMain,
                marginBottom: 12,
              }}
            >
              Inside the live answer screen
            </div>

            <div
              style={{
                borderRadius: 12,
                border: `1px solid ${cardBorder}`,
                background: card,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: 90,
                  background: "linear-gradient(135deg, #0f5c55, #0b2d2a)",
                  position: "relative",
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "auto",
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      background: "rgba(255,255,255,0.2)",
                      padding: "2px 6px",
                      borderRadius: 4,
                      color: "#fff",
                      fontWeight: "bold",
                    }}
                  >
                    Audio
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      background: "rgba(255,255,255,0.16)",
                      padding: "2px 6px",
                      borderRadius: 4,
                      color: "#fff",
                      fontWeight: "bold",
                    }}
                  >
                    Video
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      background: "rgba(255,255,255,0.9)",
                      padding: "2px 6px",
                      borderRadius: 4,
                      color: "#000",
                      fontWeight: "bold",
                    }}
                  >
                    Files
                  </span>
                </div>
                <div>
                  <div
                    style={{ fontSize: 13, fontWeight: "bold", color: "#fff" }}
                  >
                    Teacher and student stay on one screen
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>
                    Chat, calls, and files stay with the same question
                  </div>
                </div>
              </div>
              <div style={{ padding: 12 }}>
                <p
                  style={{ margin: "0 0 8px", fontSize: 11, color: textMuted }}
                >
                  Chat live, share screenshots or PDFs, and jump into a call
                  without leaving the answer screen.
                </p>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 10,
                    color: textMuted,
                  }}
                >
                  <span>15 min default timer</span>
                  <span>Private by choice</span>
                </div>
              </div>
            </div>
          </div>

          {/* Hall of Fame */}
          <div
            style={{
              borderRadius: 12,
              border: `1px solid ${cardBorder}`,
              background: isDark
                ? "rgba(18,18,18,0.9)"
                : "rgba(255,255,255,0.9)",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                background: "linear-gradient(90deg, #f59e0b, #ef4444, #8b5cf6)",
              }}
            ></div>

            <div
              style={{
                padding: "14px 16px",
                borderBottom: `1px solid ${cardBorder}`,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  background: "linear-gradient(135deg, #f59e0b, #ea580c)",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: 13,
                  boxShadow: "inset 0 0 8px rgba(0,0,0,0.2)",
                }}
              >
                🏆
              </div>
              <div>
                <div
                  style={{ fontSize: 13, fontWeight: "bold", color: textMain }}
                >
                  Hall of Fame
                </div>
                <div style={{ fontSize: 9, color: textMuted }}>
                  Top rated teachers this week
                </div>
              </div>
            </div>

            <div
              style={{
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {/* Gold Teacher */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  background: isDark ? "#141414" : "#f4f4f4",
                  borderRadius: 10,
                  border: `1px solid ${cardBorder}`,
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "rgba(245,158,11,0.1)",
                    color: "#f59e0b",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: "bold",
                  }}
                >
                  🥇
                </div>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: "#1f766e",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "2px solid #f59e0b",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: "bold",
                    }}
                  >
                    S
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      bottom: -2,
                      right: -2,
                      background: "#22c55e",
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      border: "2px solid",
                      borderColor: isDark ? "#141414" : "#f4f4f4",
                    }}
                  ></div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 4,
                      alignItems: "center",
                      marginBottom: 3,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: "bold",
                        color: textMain,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      R. Adhikari
                    </span>
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 9,
                        color: "#1f766e",
                        background: "rgba(31,118,110,0.1)",
                        padding: "2px 6px",
                        borderRadius: 10,
                        fontWeight: "bold",
                      }}
                    >
                      18 solved
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        color: textMuted,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      @radhikari
                    </span>
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 10,
                        fontWeight: "bold",
                        color: textMain,
                      }}
                    >
                      ⭐ 4.9
                    </span>
                  </div>
                </div>
              </div>

              {/* Silver Teacher */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  background: isDark ? "#141414" : "#f4f4f4",
                  borderRadius: 10,
                  border: `1px solid ${cardBorder}`,
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "rgba(156,163,175,0.1)",
                    color: "#9ca3af",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: "bold",
                  }}
                >
                  🥈
                </div>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: "#3b82f6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "2px solid #9ca3af",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: "bold",
                    }}
                  >
                    T
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 4,
                      alignItems: "center",
                      marginBottom: 3,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: "bold",
                        color: textMain,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      S. Karki
                    </span>
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 9,
                        color: "#1f766e",
                        background: "rgba(31,118,110,0.1)",
                        padding: "2px 6px",
                        borderRadius: 10,
                        fontWeight: "bold",
                      }}
                    >
                      14 solved
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        color: textMuted,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      @skarki
                    </span>
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 10,
                        fontWeight: "bold",
                        color: textMain,
                      }}
                    >
                      ⭐ 4.8
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── STATS BAR ─────────────────────── */
function StatsBar({ isDark }: { isDark: boolean }) {
  const stats = [
    { value: "15 min", label: "Answer timer" },
    { value: "3 formats", label: "Text, photo, video" },
    { value: "Audio + video", label: "Call support" },
    { value: "Files", label: "Share screenshots and docs" },
    { value: "Quiz + courses", label: "Learning beyond one answer" },
  ];
  return (
    <div
      style={{
        borderTop: `1px solid rgba(31,118,110,${isDark ? "0.2" : "0.15"})`,
        borderBottom: `1px solid rgba(31,118,110,${isDark ? "0.2" : "0.15"})`,
        background: isDark ? "rgba(15,35,30,0.5)" : "rgba(31,118,110,0.04)",
        backdropFilter: "blur(10px)",
        overflowX: "auto",
      }}
    >
      <div
        className="lpb-stats-bar"
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-around",
          padding: "1.2rem 1.5rem",
          gap: 24,
        }}
      >
        {stats.map(({ value, label }) => (
          <div key={label} style={{ textAlign: "center", flexShrink: 0 }}>
            <p
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: "#1f766e",
                margin: "0 0 2px",
                letterSpacing: "-0.03em",
              }}
            >
              {value}
            </p>
            <p
              style={{
                fontSize: 12,
                color: isDark ? "#e5e7eb" : "#1f2937",
                margin: 0,
              }}
            >
              {label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────── HOW IT WORKS ─────────────────────── */
function HowItWorks({ isDark }: { isDark: boolean }) {
  const { ref, visible } = useScrollReveal();
  return (
    <section
      id="how-it-works"
      ref={ref}
      style={{ padding: "6rem 1.5rem", maxWidth: 1100, margin: "0 auto" }}
    >
      <SectionLabel label="How it works" />
      <h2 style={headingStyle(isDark)}>
        Get your best possible answer in only 4 simple steps
      </h2>
      <p style={subStyle(isDark)}>
        Everything stays clear, fast, and on one screen from start to finish.
      </p>

      <div
        className="lpb-two-by-two"
        style={{
          display: "grid",
          gap: 20,
          marginTop: "3rem",
          padding: "0 1rem",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {HOW_IT_WORKS.map(({ step, title, desc }, i) => (
          <div
            key={step}
            style={{
              ...glassCard(isDark),
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(30px)",
              transition: `all 0.5s ${i * 0.12}s`,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -16,
                right: -8,
                fontSize: 80,
                fontWeight: 900,
                color: isDark
                  ? "rgba(31,118,110,0.08)"
                  : "rgba(31,118,110,0.07)",
                lineHeight: 1,
                pointerEvents: "none",
                userSelect: "none",
              }}
            >
              {step}
            </div>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background:
                  "linear-gradient(135deg,rgba(31,118,110,0.25),rgba(31,118,110,0.1))",
                border: "1px solid rgba(31,118,110,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 800, color: "#1f766e" }}>
                {step}
              </span>
            </div>
            <h3
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: isDark ? "#f9fafb" : "#030712",
                margin: "0 0 8px",
                letterSpacing: "-0.02em",
              }}
            >
              {title}
            </h3>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.65,
                color: isDark ? "#e5e7eb" : "#1f2937",
                margin: 0,
              }}
            >
              {desc}
            </p>
          </div>
        ))}
      </div>

      {/* Tier cards */}
      <div style={{ marginTop: "3.5rem" }}>
        <p
          style={{
            textAlign: "center",
            fontSize: 13,
            fontWeight: 700,
            color: isDark ? "#e5e7eb" : "#1f2937",
            letterSpacing: "0.1em",
            marginBottom: "1.5rem",
          }}
        >
          ANSWER FORMATS (TIERS)
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,200px),1fr))",
            gap: 16,
          }}
        >
          {PLATFORM.tiers.map(({ name, icon: Icon, time, color, bg }, i) => (
            <div
              key={name}
              style={{
                ...glassCard(isDark),
                display: "flex",
                alignItems: "center",
                gap: 14,
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(20px)",
                transition: `all 0.45s ${0.4 + i * 0.1}s`,
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  background: bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon size={20} color={color} />
              </div>
              <div>
                <p
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: isDark ? "#f9fafb" : "#030712",
                    margin: "0 0 2px",
                  }}
                >
                  {name} Answer
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: isDark ? "#e5e7eb" : "#1f2937",
                    margin: 0,
                  }}
                >
                  Time limit: {time}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── FOR STUDENTS ─────────────────────── */
function ForStudents({
  isDark,
  trialDays,
}: {
  isDark: boolean;
  trialDays: number;
}) {
  const { ref, visible } = useScrollReveal();
  return (
    <section
      id="for-students"
      ref={ref}
      style={{
        padding: "6rem 1.5rem",
        background: isDark ? "rgba(10,30,25,0.6)" : "rgba(31,118,110,0.04)",
        borderTop: `1px solid rgba(31,118,110,${isDark ? "0.15" : "0.1"})`,
        borderBottom: `1px solid rgba(31,118,110,${isDark ? "0.15" : "0.1"})`,
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <SectionLabel label="For Students" />
        <h2 style={headingStyle(isDark)}>Ask once and keep learning</h2>
        <p style={subStyle(isDark)}>
          Start with a {trialDays}-day free trial, get fast teacher help, and
          keep building with quizzes and courses in the same student space.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))",
            gap: 20,
            marginTop: "3rem",
          }}
        >
          {PLATFORM.studentBenefits.map(({ icon: Icon, title, desc }, i) => (
            <FeatureCard
              key={title}
              Icon={Icon}
              title={title}
              desc={desc}
              isDark={isDark}
              delay={i * 0.08}
              visible={visible}
            />
          ))}
        </div>

        {/* Student visual */}
        <div
          style={{
            marginTop: "4rem",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(30px)",
            transition: "all 0.6s 0.4s",
          }}
        >
          <StudentQuizMockup isDark={isDark} />
        </div>
      </div>
    </section>
  );
}

function StudentQuizMockup({ isDark }: { isDark: boolean }) {
  const border = isDark ? "rgba(31,118,110,0.25)" : "rgba(31,118,110,0.18)";
  const cardBg = isDark ? "rgba(15,35,30,0.9)" : "rgba(255,255,255,0.92)";
  const textMuted = isDark ? "#e5e7eb" : "#1f2937";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))",
        gap: 20,
      }}
    >
      {/* Quiz card */}
      <div
        style={{
          borderRadius: 18,
          border: `1px solid ${border}`,
          background: cardBg,
          backdropFilter: "blur(20px)",
          overflow: "hidden",
          boxShadow: `0 20px 60px rgba(0,0,0,${isDark ? "0.35" : "0.08"})`,
        }}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <BrainCircuitIcon size={15} color="#1f766e" />
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: isDark ? "#f9fafb" : "#030712",
              }}
            >
              Quiz — Mathematics · Grade 10
            </span>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#e05c2a",
              background: "rgba(224,92,42,0.12)",
              padding: "2px 8px",
              borderRadius: 6,
            }}
          >
            12:43
          </span>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 11, color: textMuted }}>
                Question 23 of 50
              </span>
              <span style={{ fontSize: 11, color: "#1f766e", fontWeight: 700 }}>
                46% done
              </span>
            </div>
            <div
              style={{
                height: 5,
                borderRadius: 3,
                background: isDark
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(0,0,0,0.07)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: "46%",
                  height: "100%",
                  borderRadius: 3,
                  background: "linear-gradient(90deg,#1f766e,#2ab5ab)",
                }}
              />
            </div>
          </div>
          <p
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: isDark ? "#f9fafb" : "#030712",
              marginBottom: 14,
              lineHeight: 1.5,
            }}
          >
            What is the discriminant of the quadratic equation 2x² − 5x + 3 = 0?
          </p>
          {["A) 1", "B) 7", "C) 25", "D) −1"].map((opt, i) => (
            <div
              key={opt}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px solid ${i === 0 ? "#1f766e" : border}`,
                background: i === 0 ? "rgba(31,118,110,0.12)" : "transparent",
                marginBottom: 8,
                fontSize: 13,
                color: i === 0 ? "#1f766e" : isDark ? "#d1d5db" : "#374151",
                fontWeight: i === 0 ? 700 : 400,
                cursor: "default",
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      </div>

      {/* Points + Leaderboard */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            borderRadius: 18,
            border: `1px solid ${border}`,
            background: cardBg,
            backdropFilter: "blur(20px)",
            padding: 20,
            boxShadow: `0 20px 60px rgba(0,0,0,${isDark ? "0.35" : "0.08"})`,
          }}
        >
          <p
            style={{
              fontSize: 12,
              color: textMuted,
              fontWeight: 600,
              letterSpacing: "0.06em",
              margin: "0 0 12px",
            }}
          >
            MY WALLET
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              marginBottom: 14,
            }}
          >
            <span
              style={{
                fontSize: 38,
                fontWeight: 800,
                color: "#1f766e",
                letterSpacing: "-0.04em",
              }}
            >
              240
            </span>
            <span style={{ fontSize: 14, color: textMuted, fontWeight: 500 }}>
              points
            </span>
          </div>
          {[
            { label: "Quiz wins", pts: "+5 pts", color: "#1f766e" },
            { label: "Peer answers", pts: "+3 pts", color: "#2176ae" },
            {
              label: "Subscription discount",
              pts: "−50 pts",
              color: "#e05c2a",
            },
          ].map(({ label, pts, color }) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "6px 0",
                borderTop: `1px solid ${border}`,
              }}
            >
              <span
                style={{
                  fontSize: 12.5,
                  color: isDark ? "#d1d5db" : "#374151",
                }}
              >
                {label}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color }}>
                {pts}
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            borderRadius: 18,
            border: `1px solid ${border}`,
            background: cardBg,
            backdropFilter: "blur(20px)",
            padding: 20,
            boxShadow: `0 20px 60px rgba(0,0,0,${isDark ? "0.35" : "0.08"})`,
          }}
        >
          <p
            style={{
              fontSize: 12,
              color: textMuted,
              fontWeight: 600,
              letterSpacing: "0.06em",
              margin: "0 0 12px",
            }}
          >
            LEADERBOARD
          </p>
          {[
            { rank: 1, name: "Priya S.", pts: 840, badge: "🥇" },
            { rank: 2, name: "Rohan M.", pts: 720, badge: "🥈" },
            { rank: 3, name: "You", pts: 240, badge: "🎯", highlight: true },
          ].map(({ rank, name, pts, badge, highlight }) => (
            <div
              key={rank}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 10px",
                borderRadius: 8,
                background: highlight ? "rgba(31,118,110,0.12)" : "transparent",
                marginBottom: 4,
              }}
            >
              <span style={{ fontSize: 15 }}>{badge}</span>
              <span
                style={{
                  fontSize: 13,
                  flex: 1,
                  fontWeight: highlight ? 700 : 400,
                  color: isDark ? "#f9fafb" : "#030712",
                }}
              >
                {name}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#1f766e" }}>
                {pts} pts
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────── FOR TEACHERS ─────────────────────── */
function ForTeachers({ isDark }: { isDark: boolean }) {
  const { ref, visible } = useScrollReveal();
  return (
    <section
      id="for-teachers"
      ref={ref}
      style={{ padding: "6rem 1.5rem", maxWidth: 1100, margin: "0 auto" }}
    >
      <SectionLabel label="For Teachers" />
      <h2 style={headingStyle(isDark)}>
        Teach live and earn from what you know
      </h2>
      <p style={subStyle(isDark)}>
        Accept questions, help students on one live answer screen, and build
        wallet value as your answers are completed and rated.
      </p>

      <div
        className="lpb-two-col"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))",
          gap: 20,
          marginTop: "3.5rem",
          padding: "0 1rem",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
          {PLATFORM.teacherBenefits.map(({ icon: Icon, title, desc }, i) => (
            <FeatureCard
              key={title}
              Icon={Icon}
              title={title}
              desc={desc}
              isDark={isDark}
              delay={i * 0.07}
              visible={visible}
              compact
            />
          ))}
        </div>

        <div
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateX(0)" : "translateX(30px)",
            transition: "all 0.6s 0.3s",
          }}
        >
          <TeacherMockup isDark={isDark} />
        </div>
      </div>
    </section>
  );
}

function TeacherMockup({ isDark }: { isDark: boolean }) {
  const border = isDark ? "rgba(31,118,110,0.25)" : "rgba(31,118,110,0.18)";
  const cardBg = isDark ? "rgba(15,35,30,0.9)" : "rgba(255,255,255,0.92)";
  const textMuted = isDark ? "#e5e7eb" : "#1f2937";

  return (
    <div
      style={{
        borderRadius: 20,
        border: `1px solid ${border}`,
        background: cardBg,
        backdropFilter: "blur(20px)",
        overflow: "hidden",
        boxShadow: `0 24px 60px rgba(0,0,0,${isDark ? "0.35" : "0.1"})`,
        height: "100%",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: `1px solid ${border}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "linear-gradient(135deg,#1f766e,#0f5c55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
            SK
          </span>
        </div>
        <div>
          <p
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: isDark ? "#f9fafb" : "#030712",
              margin: 0,
            }}
          >
            Santosh K. — Teacher
          </p>
          <p
            style={{
              fontSize: 11,
              color: "#1f766e",
              margin: 0,
              fontWeight: 600,
            }}
          >
            ✓ Monetized · 42 answers
          </p>
        </div>
      </div>

      {/* Wallet */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: `1px solid ${border}`,
          background: isDark
            ? "rgba(31,118,110,0.08)"
            : "rgba(31,118,110,0.05)",
        }}
      >
        <p
          style={{
            fontSize: 11,
            color: textMuted,
            fontWeight: 700,
            letterSpacing: "0.08em",
            margin: "0 0 6px",
          }}
        >
          WALLET BALANCE
        </p>
        <p
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: "#1f766e",
            margin: "0 0 10px",
            letterSpacing: "-0.04em",
          }}
        >
          NPR 1,840
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <div
            style={{
              flex: 1,
              padding: "6px 10px",
              borderRadius: 8,
              background: isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.04)",
              fontSize: 11,
              color: textMuted,
            }}
          >
            <p style={{ margin: 0, fontWeight: 700 }}>NPR 240</p>
            <p style={{ margin: 0 }}>This week</p>
          </div>
          <div
            style={{
              flex: 1,
              padding: "6px 10px",
              borderRadius: 8,
              background: isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.04)",
              fontSize: 11,
              color: textMuted,
            }}
          >
            <p style={{ margin: 0, fontWeight: 700 }}>4.7 ★</p>
            <p style={{ margin: 0 }}>Avg rating</p>
          </div>
        </div>
      </div>

      {/* Recent earnings */}
      <div style={{ padding: "14px 16px" }}>
        <p
          style={{
            fontSize: 11,
            color: textMuted,
            fontWeight: 700,
            letterSpacing: "0.08em",
            margin: "0 0 10px",
          }}
        >
          RECENT EARNINGS
        </p>
        {[
          {
            q: "Quadratic inequalities",
            tier: "Text",
            amount: "NPR 85",
            rating: 5,
            time: "2h ago",
          },
          {
            q: "Newton's laws diagram",
            tier: "Photo",
            amount: "NPR 140",
            rating: 4,
            time: "Yesterday",
          },
          {
            q: "Integration by parts",
            tier: "Video",
            amount: "NPR 210",
            rating: 5,
            time: "2 days ago",
          },
        ].map(({ q, tier, amount, rating, time }) => {
          const tColor =
            tier === "Text"
              ? "#1f766e"
              : tier === "Photo"
                ? "#2176ae"
                : "#7c3aed";
          return (
            <div
              key={q}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 0",
                borderTop: `1px solid ${border}`,
              }}
            >
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: isDark ? "#f9fafb" : "#030712",
                    margin: "0 0 2px",
                    lineHeight: 1.3,
                  }}
                >
                  {q}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: tColor,
                      background: `${tColor}18`,
                      padding: "1px 6px",
                      borderRadius: 4,
                    }}
                  >
                    {tier}
                  </span>
                  <span style={{ fontSize: 10, color: textMuted }}>{time}</span>
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: "#1f766e",
                    margin: "0 0 1px",
                  }}
                >
                  {amount}
                </p>
                <p style={{ fontSize: 11, color: "#f59e0b", margin: 0 }}>
                  {"★".repeat(rating)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────── QUIZ PORTAL ─────────────────────── */
function QuizPortal({ isDark }: { isDark: boolean }) {
  const { ref, visible } = useScrollReveal();
  return (
    <section
      id="quiz"
      ref={ref}
      style={{
        padding: "6rem 1.5rem",
        background: isDark ? "rgba(10,20,35,0.6)" : "rgba(33,118,174,0.04)",
        borderTop: `1px solid rgba(33,118,174,${isDark ? "0.2" : "0.12"})`,
        borderBottom: `1px solid rgba(33,118,174,${isDark ? "0.2" : "0.12"})`,
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <SectionLabel label="Quiz Portal" color="#2176ae" />
        <h2 style={headingStyle(isDark)}>Practice between live questions</h2>
        <p style={subStyle(isDark)}>
          Active subscribers can launch AI-generated 50-question MCQ sessions,
          review explanations right away, and earn {PLATFORM.quizPoints} points
          by scoring {PLATFORM.quizPassPercent}% or higher.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))",
            gap: 20,
            marginTop: "3rem",
          }}
        >
          {[
            {
              icon: BrainCircuitIcon,
              title: "AI-generated questions",
              desc: "Pick a subject, topic, and level, then get a fresh practice set generated for that learning target.",
              color: "#2176ae",
            },
            {
              icon: ClockIcon,
              title: "Timed challenge",
              desc: "Every session runs on the platform timer so practice feels focused and the final score reflects real completion.",
              color: "#7c3aed",
            },
            {
              icon: SparklesIcon,
              title: "Instant feedback",
              desc: "See your score, the correct answers, and the generated explanations as soon as the quiz ends.",
              color: "#1f766e",
            },
            {
              icon: TrophyIcon,
              title: "Points that matter",
              desc: `Pass with ${PLATFORM.quizPassPercent}%+ and earn NPR ${PLATFORM.quizPoints} that helps reduce the cost of staying active on the platform.`,
              color: "#f59e0b",
            },
          ].map(({ icon: Icon, title, desc, color }, i) => (
            <div
              key={title}
              style={{
                ...glassCard(isDark),
                borderTop: `3px solid ${color}20`,
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(24px)",
                transition: `all 0.5s ${i * 0.1}s`,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: `${color}14`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 14,
                }}
              >
                <Icon size={20} color={color} />
              </div>
              <h3
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: isDark ? "#f9fafb" : "#030712",
                  margin: "0 0 8px",
                }}
              >
                {title}
              </h3>
              <p
                style={{
                  fontSize: 13.5,
                  color: isDark ? "#e5e7eb" : "#1f2937",
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── COURSE LIBRARY ─────────────────────── */
/** Shown only when nothing is published yet, so the section never renders empty. */
const SAMPLE_LIBRARY_ITEMS = [
  {
    subject: "Mathematics",
    title: "Differentiation Essentials",
    level: "Grade 11-12",
    uploader: "Verified Teacher",
    color: "#1f766e",
    pricing: "PAID",
    price: "NPR 499",
    videos: 18,
    duration: "4h 20m",
    liveSessions: true,
    isFeatured: true,
    href: "/courses",
    thumbnailUrl: null as string | null,
    kind: "COURSE" as const,
  },
  {
    subject: "Physics",
    title: "Mechanics and Motion Foundations",
    level: "Grade 10",
    uploader: "Verified Teacher",
    color: "#2176ae",
    pricing: "FREE",
    price: null,
    videos: 12,
    duration: "3h 10m",
    liveSessions: false,
    isFeatured: false,
    href: "/courses",
    thumbnailUrl: null as string | null,
    kind: "COURSE" as const,
  },
  {
    subject: "Chemistry",
    title: "Organic Chemistry Basics",
    level: "Grade 11",
    uploader: "Admin",
    color: "#7c3aed",
    pricing: "SUBSCRIPTION",
    price: null,
    videos: 16,
    duration: "4h 45m",
    liveSessions: true,
    isFeatured: false,
    href: "/courses",
    thumbnailUrl: null as string | null,
    kind: "COURSE" as const,
  },
  {
    subject: "English",
    title: "Essay Writing Fundamentals",
    level: "Grade 9-10",
    uploader: "Verified Teacher",
    color: "#f59e0b",
    pricing: "FREE",
    price: null,
    videos: 10,
    duration: "2h 35m",
    liveSessions: false,
    isFeatured: false,
    href: "/courses",
    thumbnailUrl: null as string | null,
    kind: "COURSE" as const,
  },
];

function CourseLibrary({
  isDark,
  items = [],
}: {
  isDark: boolean;
  items?: LandingLibraryItem[];
}) {
  const { ref, visible } = useScrollReveal();
  const border = isDark ? "rgba(31,118,110,0.22)" : "rgba(31,118,110,0.16)";

  // Real published catalogue when there is one; samples only as a cold-start
  // placeholder so a brand-new platform doesn't show an empty section.
  const courses =
    items.length > 0
      ? items.map((item, index) => ({
          subject: item.subject,
          title: item.title,
          level: item.level,
          uploader: item.uploader,
          color: getLandingItemColor(item, index),
          pricing: item.pricing,
          price: item.price ?? undefined,
          videos: item.lessons,
          duration: formatLandingDuration(item.durationMinutes),
          liveSessions: item.liveSessions,
          isFeatured: item.isFeatured,
          href: item.href,
          thumbnailUrl: item.thumbnailUrl,
          kind: item.kind,
        }))
      : SAMPLE_LIBRARY_ITEMS;

  const pricingBadge = (pricing: string, price?: string) => {
    if (pricing === "FREE") {
      return { bg: "rgba(34,197,94,0.15)", color: "#22c55e", label: "FREE" };
    } else if (pricing === "SUBSCRIPTION") {
      return {
        bg: "rgba(124,58,237,0.15)",
        color: "#7c3aed",
        label: "SUBSCRIPTION",
      };
    } else {
      return {
        bg: "rgba(245,158,11,0.15)",
        color: "#f59e0b",
        label: price || "PAID",
      };
    }
  };

  return (
    <section
      ref={ref}
      style={{ padding: "6rem 1.5rem", maxWidth: 1100, margin: "0 auto" }}
    >
      <SectionLabel label="Video Courses" />
      <h2 style={headingStyle(isDark)}>
        Learn beyond one answer with video courses
      </h2>
      <p style={subStyle(isDark)}>
        Verified teachers and admins can publish structured courses with three
        pricing paths: free, subscription-included, or one-time purchase.
        Premium courses can also include live sessions and progress tracking.
      </p>

      <div
        className="lpb-two-by-two"
        style={{
          display: "grid",
          gap: 20,
          marginTop: "3rem",
        }}
      >
        {courses.map(
          (
            {
              subject,
              title,
              level,
              uploader,
              color,
              pricing,
              price,
              videos,
              duration,
              liveSessions,
              isFeatured,
              href,
              thumbnailUrl,
              kind,
            },
            i,
          ) => {
            const badge = pricingBadge(pricing, price ?? undefined);
            return (
              <Link
                href={href}
                key={`${title}-${i}`}
                style={{
                  display: "block",
                  textDecoration: "none",
                  color: "inherit",
                  borderRadius: 18,
                  border: `1px solid ${border}`,
                  background: isDark
                    ? "rgba(15,35,30,0.7)"
                    : "rgba(255,255,255,0.85)",
                  backdropFilter: "blur(16px)",
                  overflow: "hidden",
                  cursor: "pointer",
                  opacity: visible ? 1 : 0,
                  transform: visible ? "translateY(0)" : "translateY(20px)",
                  transition: `all 0.45s ${i * 0.08}s`,
                  boxShadow: `0 4px 20px rgba(0,0,0,${isDark ? "0.25" : "0.05"})`,
                  position: "relative",
                }}
              >
                {isFeatured && (
                  <div
                    style={{
                      position: "absolute",
                      top: 12,
                      left: 12,
                      zIndex: 10,
                      background: "linear-gradient(135deg,#f59e0b,#e05c2a)",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "3px 10px",
                      borderRadius: 20,
                      letterSpacing: "0.05em",
                    }}
                  >
                    FEATURED
                  </div>
                )}

                {kind === "CHAPTER" && (
                  <div
                    style={{
                      position: "absolute",
                      top: 12,
                      right: 12,
                      zIndex: 10,
                      background: "rgba(31,118,110,0.9)",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "3px 10px",
                      borderRadius: 20,
                      letterSpacing: "0.05em",
                    }}
                  >
                    CHAPTER
                  </div>
                )}

                <div
                  style={{
                    height: 140,
                    background: `linear-gradient(135deg,${color}25,${color}08)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderBottom: `1px solid ${border}`,
                    position: "relative",
                  }}
                >
                  {thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbnailUrl}
                      alt={title}
                      loading="lazy"
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <>
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          backgroundImage: `repeating-linear-gradient(45deg,${color}08 0,${color}08 1px,transparent 0,transparent 50%)`,
                          backgroundSize: "20px 20px",
                        }}
                      />
                      <div
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: "50%",
                          background: `${color}20`,
                          border: `2px solid ${color}40`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          position: "relative",
                        }}
                      >
                        <PlayCircleIcon size={28} color={color} />
                      </div>
                    </>
                  )}
                </div>

                <div style={{ padding: "14px 16px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: color,
                        background: `${color}15`,
                        padding: "2px 7px",
                        borderRadius: 5,
                        letterSpacing: "0.04em",
                      }}
                    >
                      {subject} · {level}
                    </span>
                  </div>

                  <p
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: isDark ? "#f9fafb" : "#030712",
                      margin: "0 0 8px",
                      lineHeight: 1.3,
                    }}
                  >
                    {title}
                  </p>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 10,
                    }}
                  >
                    <PlayCircleIcon
                      size={12}
                      color={isDark ? "#e5e7eb" : "#1f2937"}
                    />
                    <span
                      style={{
                        fontSize: 11,
                        color: isDark ? "#e5e7eb" : "#1f2937",
                      }}
                    >
                      {videos} {videos === 1 ? "video" : "videos"} · {duration}
                    </span>
                    {liveSessions && (
                      <>
                        <span style={{ color: isDark ? "#e5e7eb" : "#1f2937" }}>
                          ·
                        </span>
                        <CalendarIcon size={12} color="#7c3aed" />
                        <span
                          style={{
                            fontSize: 11,
                            color: "#7c3aed",
                            fontWeight: 600,
                          }}
                        >
                          Live
                        </span>
                      </>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: badge.color,
                        background: badge.bg,
                        padding: "4px 10px",
                        borderRadius: 6,
                      }}
                    >
                      {badge.label}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: isDark ? "#e5e7eb" : "#1f2937",
                      }}
                    >
                      by {uploader}
                    </span>
                  </div>
                </div>
              </Link>
            );
          },
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))",
          gap: 16,
          marginTop: "3rem",
        }}
      >
        {[
          {
            icon: BookOpenIcon,
            title: "Structured video lessons",
            desc: "Courses are organized into sections and videos so students can revisit the exact lesson they need.",
            color: "#1f766e",
          },
          {
            icon: PlayCircleIcon,
            title: "Progress tracking",
            desc: "Students can keep track of completed lessons and continue from where they stopped.",
            color: "#2176ae",
          },
          {
            icon: CalendarIcon,
            title: "Live sessions on eligible premium courses",
            desc: "Teachers can schedule live classes for supported premium courses when a topic needs real-time teaching.",
            color: "#7c3aed",
          },
          {
            icon: UsersIcon,
            title: "Teacher and admin publishing",
            desc: "The same platform that powers live answers also lets teachers and admins publish full learning tracks.",
            color: "#f59e0b",
          },
        ].map(({ icon: Icon, title, desc, color }, i) => (
          <div
            key={title}
            style={{
              ...glassCard(isDark),
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(16px)",
              transition: `all 0.4s ${0.5 + i * 0.08}s`,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: `${color}15`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon size={18} color={color} />
            </div>
            <div>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: isDark ? "#f9fafb" : "#030712",
                  margin: "0 0 4px",
                }}
              >
                {title}
              </p>
              <p
                style={{
                  fontSize: 12.5,
                  color: isDark ? "#e5e7eb" : "#1f2937",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────── TRUST / COMPARISON ─────────────────────── */
function Comparison({ isDark }: { isDark: boolean }) {
  const { ref, visible } = useScrollReveal();
  const rows = [
    { feature: "15-minute answer timer", us: true, other: false },
    { feature: "Teacher acceptance workflow", us: true, other: false },
    { feature: "Audio + video calls inside questions", us: true, other: false },
    { feature: "File sharing on the answer screen", us: true, other: false },
    { feature: "Teacher wallet and earnings tracking", us: true, other: false },
    { feature: "AI quiz practice with points", us: true, other: false },
    { feature: "Video courses and live sessions", us: true, other: false },
    { feature: "Public or private answer visibility", us: true, other: true },
  ];
  const border = isDark ? "rgba(31,118,110,0.2)" : "rgba(31,118,110,0.15)";

  return (
    <section
      ref={ref}
      style={{
        padding: "6rem 1.5rem",
        background: isDark ? "rgba(10,30,25,0.5)" : "rgba(31,118,110,0.03)",
        borderTop: `1px solid ${border}`,
        borderBottom: `1px solid ${border}`,
      }}
    >
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <SectionLabel label="Why Question Call" />
        <h2 style={{ ...headingStyle(isDark), textAlign: "center" }}>
          Built around real teaching moments
        </h2>

        <div
          style={{
            marginTop: "2.5rem",
            borderRadius: 18,
            border: `1px solid ${border}`,
            background: isDark
              ? "rgba(15,35,30,0.85)"
              : "rgba(255,255,255,0.9)",
            backdropFilter: "blur(20px)",
            overflow: "hidden",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(24px)",
            transition: "all 0.5s 0.1s",
            boxShadow: `0 20px 60px rgba(0,0,0,${isDark ? "0.3" : "0.07"})`,
          }}
        >
          <div
            className="lpb-compare-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 120px 120px",
              borderBottom: `1px solid ${border}`,
              background: isDark
                ? "rgba(31,118,110,0.08)"
                : "rgba(31,118,110,0.06)",
            }}
          >
            <div style={{ padding: "12px 16px" }} />
            <div
              style={{
                padding: "12px 8px",
                textAlign: "center",
                fontSize: 12,
                fontWeight: 700,
                color: "#1f766e",
              }}
            >
              {APP_NAME}
            </div>
            <div
              style={{
                padding: "12px 8px",
                textAlign: "center",
                fontSize: 12,
                fontWeight: 600,
                color: isDark ? "#9ca3af" : "#6b7280",
              }}
            >
              Generic Q&A
            </div>
          </div>
          {rows.map(({ feature, us, other }, i) => (
            <div
              key={feature}
              className="lpb-compare-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 120px 120px",
                borderTop: i ? `1px solid ${border}` : "none",
              }}
            >
              <div
                style={{
                  padding: "11px 16px",
                  fontSize: 13.5,
                  color: isDark ? "#d1d5db" : "#374151",
                }}
              >
                {feature}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {us ? (
                  <CheckCircleIcon size={17} color="#1f766e" />
                ) : (
                  <span
                    style={{ fontSize: 14, color: isDark ? "#5a9990" : "#aaa" }}
                  >
                    —
                  </span>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {other ? (
                  <CheckCircleIcon size={17} color="#aaa" />
                ) : (
                  <span
                    style={{ fontSize: 14, color: isDark ? "#5a9990" : "#ccc" }}
                  >
                    —
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── CTA ─────────────────────── */
function CTASection({
  isDark,
  trialDays,
}: {
  isDark: boolean;
  trialDays: number;
}) {
  const { ref, visible } = useScrollReveal();
  return (
    <section
      ref={ref}
      style={{
        padding: "7rem 1.5rem",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            top: "10%",
            left: "20%",
            width: 500,
            height: 500,
            borderRadius: "50%",
            background:
              "radial-gradient(circle,rgba(31,118,110,0.14) 0%,transparent 70%)",
            filter: "blur(80px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "0%",
            right: "15%",
            width: 400,
            height: 400,
            borderRadius: "50%",
            background:
              "radial-gradient(circle,rgba(33,118,174,0.1) 0%,transparent 70%)",
            filter: "blur(60px)",
          }}
        />
      </div>

      <div
        style={{
          position: "relative",
          maxWidth: 620,
          margin: "0 auto",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(30px)",
          transition: "all 0.6s",
        }}
      >
        <div className="shiny-pill">
          <SparklesIcon size={13} color="#1f766e" />
          <span className="shiny-text">
            {trialDays}-day free trial for students
          </span>
        </div>

        
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 14,
            justifyContent: "center",
          }}
        >
          <Link
            href={getSignUpPath("STUDENT")}
            className="lpb-btn lpb-btn-primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "0.9rem 2rem",
              borderRadius: 14,
              color: "#fff",
              fontWeight: 700,
              fontSize: 15.5,
              textDecoration: "none",
            }}
          >
            <GraduationCapIcon size={18} /> Sign up as Student
          </Link>
          <Link
            href={getSignUpPath("TEACHER")}
            className={`lpb-btn ${isDark ? "lpb-btn-dark" : "lpb-btn-secondary"}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "0.9rem 2rem",
              borderRadius: 14,
              color: isDark ? "#d1d5db" : "#374151",
              fontWeight: 700,
              fontSize: 15.5,
              textDecoration: "none",
              backdropFilter: "blur(12px)",
            }}
          >
            <Users2Icon size={18} /> Sign up as Teacher
          </Link>
        </div>

        <p
          style={{
            fontSize: 13,
            color: isDark ? "#ffffff" : "#19191aff",
            marginTop: "1.5rem",
          }}
        >
          Student trial available · Teacher onboarding built in
        </p>
      </div>
    </section>
  );
}

/* ─────────────────────── FOOTER ─────────────────────── */
function Footer({
  isDark,
  customerService,
  socialLinks,
}: {
  isDark: boolean;
  customerService: CustomerServiceDetails;
  socialLinks?: PlatformSocialLinks;
}) {
  const border = isDark ? "rgba(31,118,110,0.18)" : "rgba(31,118,110,0.14)";
  const hasCustomerService =
    customerService.phoneNumbers.length > 0 ||
    customerService.emails.length > 0;
  return (
    <footer
      style={{
        borderTop: `1px solid ${border}`,
        background: isDark ? "rgba(8,20,18,0.8)" : "rgba(248,252,251,0.9)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div
        className="lpb-footer-shell"
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "4rem 1.5rem 3rem",
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr 1.5fr",
          gap: "3rem",
          alignItems: "start",
        }}
      >
        <div className="lpb-footer-brand" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              <Image
                src="/logo.png"
                alt="Question Call logo"
                width={32}
                height={32}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
            <span
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: isDark ? "#f9fafb" : "#030712",
              }}
            >
              {APP_NAME}
            </span>
          </div>
          <div style={{ marginTop: 4 }}>
            {socialLinks ? <SocialHandlesDirect links={socialLinks} /> : null}
          </div>
          <div style={{ marginTop: "auto", paddingTop: 16 }}>
            <span
              // href="https://github.com/siddthecoder"
              className="lpb-footer-link"
              // target="_blank"
              // rel="noreferrer"
              style={{
                fontSize: 11,
                color: isDark ? "#e5e7eb" : "#374151",
                textDecoration: "none",
                fontWeight: 600,
                display: "inline-block",
                padding: "6px 12px",
                borderRadius: 8,
                background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
                marginLeft: "-10px",
              }}
            >
              Learning & Earning at same time
            </span>
          </div>
          <p
            style={{
              fontSize: 12,
              color: isDark ? "#9ca3af" : "#6b7280",
              margin: 0,
              marginTop: 4,
            }}
          >
            © {new Date().getFullYear()} {APP_NAME}. All rights reserved. {" "}
            <Link href="/legal" style={{ marginLeft: 8, textDecoration: "underline", color: "inherit" }}>Privacy Policy</Link>
          </p>
        </div>

        <div className="lpb-footer-links" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h4 style={{ fontSize: 12, fontWeight: 800, color: isDark ? "#9ca3af" : "#6b7280", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Quick Links</h4>
          {/* Public content sections come first: these are the crawlable entry
              points Google can surface alongside the sign-up links. */}
          {[
            ["/courses", "Courses"],
            ["/chapters", "Chapters"],
            ["/quiz", "Quiz Practice"],
            ["/pricing", "Pricing"],
            [getSignInPath(), "Sign in"],
            [getSignUpPath("STUDENT"), "Students"],
            [getSignUpPath("TEACHER"), "Teachers"],
            ["#how-it-works", "How it works"],
            ["#faq", "FAQ"],
            ["/legal", "Privacy Policy"],
          ].map(([href, label]) => (
            <Link
              key={label}
              href={href}
              className="lpb-footer-link"
              style={{
                fontSize: 13,
                color: isDark ? "#e5e7eb" : "#1f2937",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              {label}
            </Link>
          ))}
        </div>

        <div
          className="lpb-footer-meta"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            height: "100%",
          }}
        >
          {hasCustomerService ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div>
                <h4 style={{ fontSize: 12, fontWeight: 800, color: isDark ? "#9ca3af" : "#6b7280", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Contact us</h4>
                <p
                  style={{
                    fontSize: 13,
                    color: isDark ? "#e5e7eb" : "#1f2937",
                    margin: 0,
                    fontWeight: 500,
                  }}
                >
                  Customer service
                </p>
              </div>
              <div
                className="lpb-footer-contact-row"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                {customerService.phoneNumbers.map((phoneNumber) => (
                  <a
                    key={phoneNumber}
                    href={`tel:${phoneNumber.replace(/[^\d+]/g, "")}`}
                    className="lpb-footer-contact-chip"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "0.5rem 0.85rem",
                      borderRadius: 999,
                      border: `1px solid ${isDark ? "rgba(31,118,110,0.24)" : "rgba(31,118,110,0.18)"}`,
                      background: isDark
                        ? "rgba(15,35,30,0.68)"
                        : "rgba(255,255,255,0.82)",
                      color: isDark ? "#d1d5db" : "#1a1f28ff",
                      textDecoration: "none",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <PhoneIcon size={12} />
                    {phoneNumber}
                  </a>
                ))}
                {customerService.emails.map((email) => (
                  <a
                    key={email}
                    href={`mailto:${email}`}
                    className="lpb-footer-contact-chip"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "0.5rem 0.85rem",
                      borderRadius: 999,
                      border: "1px solid rgba(31,118,110,0.28)",
                      background: isDark
                        ? "rgba(31,118,110,0.2)"
                        : "rgba(31,118,110,0.12)",
                      color: isDark ? "#d2f2ed" : "#051e1cff",
                      textDecoration: "none",
                      fontSize: 12,
                      fontWeight: 700,
                      boxShadow: "0 10px 24px rgba(31,118,110,0.08)",
                    }}
                  >
                    <MailIcon size={12} />
                    {email}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </footer>
  );
}

/* ─────────────────────── SHARED ATOMS ─────────────────────── */
function SectionLabel({
  label,
  color = "#1f766e",
}: {
  label: string;
  color?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        marginBottom: "1rem",
      }}
    >
      <span
        className="lpb-section-pill"
        style={{
          fontSize: 11.5,
          fontWeight: 800,
          color,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          background: `${color}12`,
          padding: "0.3rem 1rem",
          borderRadius: 100,
          border: `1px solid ${color}28`,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function FeatureCard({
  Icon,
  title,
  desc,
  isDark,
  delay,
  visible,
  compact,
}: {
  Icon: React.ElementType;
  title: string;
  desc: string;
  isDark: boolean;
  delay: number;
  visible: boolean;
  compact?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...glassCard(isDark),
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: `all 0.5s ${delay}s`,
        outline: hovered
          ? "1.5px solid rgba(31,118,110,0.4)"
          : "1.5px solid transparent",
        display: compact ? "flex" : "block",
        gap: compact ? 14 : 0,
        alignItems: compact ? "flex-start" : undefined,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: hovered
            ? "rgba(31,118,110,0.18)"
            : "rgba(31,118,110,0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginBottom: compact ? 0 : 14,
          transition: "background 0.2s",
        }}
      >
        <Icon size={18} color="#1f766e" />
      </div>
      <div>
        <h3
          style={{
            fontSize: compact ? 14 : 15.5,
            fontWeight: 700,
            color: isDark ? "#f9fafb" : "#030712",
            margin: "0 0 6px",
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h3>
        <p
          style={{
            fontSize: 13.5,
            lineHeight: 1.6,
            color: isDark ? "#e5e7eb" : "#1f2937",
            margin: 0,
          }}
        >
          {desc}
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────── STYLE HELPERS ─────────────────────── */
function glassCard(isDark: boolean): React.CSSProperties {
  return {
    borderRadius: 16,
    border: `1px solid rgba(31,118,110,${isDark ? "0.22" : "0.16"})`,
    background: isDark ? "rgba(15,35,30,0.7)" : "rgba(255,255,255,0.8)",
    backdropFilter: "blur(16px)",
    padding: "20px 22px",
    boxShadow: `0 4px 24px rgba(0,0,0,${isDark ? "0.2" : "0.05"})`,
    transition: "all 0.25s ease",
  };
}

function headingStyle(isDark: boolean): React.CSSProperties {
  return {
    fontSize: "clamp(1.7rem,3.5vw,2.4rem)",
    fontWeight: 800,
    letterSpacing: "-0.04em",
    color: isDark ? "#f9fafb" : "#030712",
    textAlign: "center",
    margin: "0 0 1rem",
  };
}

function subStyle(isDark: boolean): React.CSSProperties {
  return {
    fontSize: "clamp(0.95rem,1.8vw,1.1rem)",
    color: isDark ? "#e5e7eb" : "#1f2937",
    textAlign: "center",
    lineHeight: 1.7,
    margin: "0 auto 0",
    maxWidth: 580,
  };
}

/* ─────────────────────── FAQ SECTION ─────────────────────── */

const faqs = [
  {
    question: "Why should I use QuestionCall instead of just asking an AI chatbot?",
    answer:
      "AI chatbots can give you instant answers, but they often miss the mark — especially when your question is tied to a specific textbook, curriculum, or concept you're genuinely stuck on. QuestionCall connects you with a real, verified teacher who listens, asks follow-up questions, and explains things your way. You can share images, send voice notes, and even jump on a live video call.",
  },
  {
    question: "How quickly will I get help after I post a question?",
    answer:
      "Most questions are picked up within minutes since our teachers are active throughout the day. Once a teacher accepts your question, they have a strict 15-minute timer to deliver a clear and accurate answer — so there's no waiting around.",
  },
  {
    question: "Can I keep my question private, or does everyone see it?",
    answer:
      "That's completely up to you. Post publicly so other students with the same doubt can benefit too, or post privately for direct one-on-one help sent straight to your inbox. Either way, you're in control.",
  },
  {
    question: "How do I know the teachers are actually qualified?",
    answer:
      "Every teacher goes through a qualification process before they can start helping students. They must accurately answer test questions first — so by the time a teacher picks up your question, they've already proven they know their stuff. You'll also see their ratings and track record on their profile.",
  },
  {
    question: "Which subjects can I get help with?",
    answer:
      "We cover all major academic subjects — Mathematics, Science, English, Computer Science, and more. Whether it's a tricky algebra problem, a confusing chemistry concept, or a coding error you can't debug, there's likely a teacher ready to help.",
  },
  {
    question: "Is there anything to do on the platform other than asking questions?",
    answer:
      "Plenty! You can enroll in structured video courses, attend live scheduled classes, and take AI-generated quizzes to test your knowledge. The quiz portal even rewards you with money for scoring well — think of it as your full academic toolkit.",
  },
  {
    question: "Can I use QuestionCall on my phone without downloading an app?",
    answer:
      "Yes — QuestionCall works as a Progressive Web App (PWA), so you can install it directly from your browser on any device. No app store needed. It supports dark mode and sends push notifications so you never miss a reply.",
  },
  {
    question: "How does payment work if I want a course or private help?",
    answer:
      "QuestionCall supports eSewa and Khalti — the most trusted payment options in Nepal. Paying for a course or a private session is quick and straightforward, and your full transaction history is always visible in your account.",
  },
];

export function FAQSection({ isDark }: { isDark: boolean }) {
  const { ref, visible } = useScrollReveal();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => setOpenIndex(openIndex === i ? null : i);

  const borderColor = isDark ? "rgba(31,118,110,0.22)" : "rgba(31,118,110,0.15)";
  const dividerColor = isDark ? "rgba(31,118,110,0.18)" : "rgba(31,118,110,0.12)";
  const cardBg       = isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.7)";
  const cardBgOpen   = isDark ? "rgba(31,118,110,0.08)"  : "rgba(31,118,110,0.05)";
  const iconBg       = isDark ? "rgba(31,118,110,0.18)"  : "rgba(31,118,110,0.1)";
  const iconColor    = isDark ? "#7fb8b2" : "#1f766e";
  const questionColor= isDark ? "#f9fafb" : "#030712";
  const answerColor = isDark ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.7)";
  const chevronColor = isDark ? "rgba(127,184,178,0.5)"  : "rgba(31,118,110,0.4)";

  return (
    <section
      id="faq"
      ref={ref}
      style={{ padding: "6rem 1.5rem", position: "relative" }}
    >
      <div style={{ maxWidth: 800, margin: "0 auto", position: "relative", zIndex: 2 }}>
        <SectionLabel label="FAQ - Frequently Asked Questions" color="#7c3aed" />

        <h2
          style={{
            fontSize: "clamp(1.6rem, 3vw, 2.2rem)",
            fontWeight: 700,
            color: questionColor,
            margin: "0 0 0.4rem",
          }}
        >
          Got Questions?
        </h2>
        <p
          style={{
            fontSize: 15,
            color: answerColor,
            margin: "0 0 2.5rem",
          }}
        >
          Everything you need to know about QuestionCall.
        </p>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(24px)",
            transition: "opacity 0.6s ease, transform 0.6s ease",
          }}
        >
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={i}
                onClick={() => toggle(i)}
                style={{
                  background: isOpen ? cardBgOpen : cardBg,
                  border: `1px solid ${isOpen ? "rgba(31,118,110,0.45)" : borderColor}`,
                  borderRadius: 14,
                  overflow: "hidden",
                  cursor: "pointer",
                  transition: "border-color 0.25s ease, background 0.25s ease",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                }}
              >
                {/* Question row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "0.85rem 1.25rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 32,
                      height: 32,
                      borderRadius: 9,
                      background: iconBg,
                      flexShrink: 0,
                    }}
                  >
                    <PlusIcon size={16} color={iconColor} />
                  </div>

                  <span
                    style={{
                      flex: 1,
                      fontSize: 14.5,
                      fontWeight: 600,
                      color: questionColor,
                      lineHeight: 1.45,
                    }}
                  >
                    {faq.question}
                  </span>

                  <ChevronDown
                    size={18}
                    color={isOpen ? iconColor : chevronColor}
                    style={{
                      flexShrink: 0,
                      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.3s ease, color 0.25s ease",
                    }}
                  />
                </div>

                {/* Answer — only rendered when open, no extra wrappers */}
                {isOpen && (
                  <div
                    style={{
                      borderTop: `1px solid ${dividerColor}`,
                      padding: "0.75rem 1.25rem 0.9rem",
                      paddingLeft: `calc(1.25rem + 32px + 14px)`,
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: 14,
                        lineHeight: 1.7,
                        color: answerColor,
                        fontWeight: 400,
                      }}
                    >
                      {faq.answer}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── ROOT EXPORT ─────────────────────── */
export function PublicLanding({
  trialDays = PLATFORM.trialDays,
  customerService = DEFAULT_CUSTOMER_SERVICE_DETAILS,
  socialLinks,
  landingDisplayUserCount = 0,
  libraryItems = [],
}: {
  trialDays?: number;
  customerService?: CustomerServiceDetails;
  socialLinks?: PlatformSocialLinks;
  landingDisplayUserCount?: number;
  libraryItems?: LandingLibraryItem[];
}) {
  const { resolvedTheme } = useTheme();
  const hasHydrated = useHasHydrated();
  const isDark = hasHydrated && resolvedTheme === "dark";

  return (
    <div
      style={{
        minHeight: "100vh",
        scrollBehavior: "smooth",
        background: isDark ? "#081412" : "#f8fcfb",
        color: isDark ? "#f9fafb" : "#030712",
      }}
    >
      <LandingStyles />
      <Nav />
      <main>
        <Hero
          isDark={isDark}
          landingDisplayUserCount={landingDisplayUserCount}
        />
        <StatsBar isDark={isDark} />
        <HowItWorks isDark={isDark} />
        <ForStudents isDark={isDark} trialDays={trialDays} />
        <ForTeachers isDark={isDark} />
        <QuizPortal isDark={isDark} />
        <CourseLibrary isDark={isDark} items={libraryItems} />
        <Comparison isDark={isDark} />
        <FAQSection isDark={isDark} />
        <CTASection isDark={isDark} trialDays={trialDays} />
      </main>
      <Footer isDark={isDark} customerService={customerService} socialLinks={socialLinks} />
    </div>
  );
}
