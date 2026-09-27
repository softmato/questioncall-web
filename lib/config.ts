/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║               QUESTION HUB — Platform Config                     ║
 * ║                                                                  ║
 * ║  INITIAL SEED DATA — values below are used ONLY on first boot   ║
 * ║  to populate the PlatformConfig collection in MongoDB.           ║
 * ║  After that, the entire app reads from the DB-cached             ║
 * ║  PlatformConfig via getPlatformConfig() in                       ║
 * ║  models/PlatformConfig.ts. Changing values here will NOT affect  ║
 * ║  an existing deployment — use the Admin Panel instead.           ║
 * ║                                                                  ║
 * ║  ⚙️  Client wants to change trial days? → TRIAL section          ║
 * ║  ⚙️  Client wants to adjust pricing?    → PLANS section          ║
 * ║  ⚙️  Client wants to tweak payouts?     → TEACHER section        ║
 * ║  ⚙️  Client wants to change durations?  → FORMAT section         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// ─────────────────────────────────────────────────────────────────────
// 1. FREE TRIAL
// ─────────────────────────────────────────────────────────────────────

export const TRIAL = {
  /** Number of free trial days given to every new student on signup */
  DURATION_DAYS: 3,

  /** Max questions a student can ask during the free trial */
  MAX_QUESTIONS: 5,
} as const;

// ─────────────────────────────────────────────────────────────────────
// 2. SUBSCRIPTION PLANS
//    Shape used by the pricing UI. Only edit values here.
// ─────────────────────────────────────────────────────────────────────

export type PlanDef = {
  name: string;
  price: number;           // NPR the student pays
  originalPrice: number | null;  // strike-through price (null = no strike)
  badge: string | null;
  suffix: string;
  slug: string;
  color: string;
  titleClass: string;
  features: string[];
  highlight: boolean;
  tax: number;
  durationDays: number;
  maxQuestions: number | null;  // null = unlimited
  includedBonusQuestions: number;
};

// Plan slugs: free, go, plus, pro, max (must match getHydratedPlans)
export const SUBSCRIPTION_PLANS: PlanDef[] = [
  {
    name: "Free Trial",
    price: 0,
    originalPrice: null,
    badge: null,
    suffix: "",
    slug: "free",
    color: "#6EE7B7", // Emerald 300
    titleClass: "text-[#065F46] dark:text-neutral-100",
    features: [
      `${TRIAL.DURATION_DAYS} days (${Math.ceil(TRIAL.DURATION_DAYS / 30)} month) valid`,
      `Ask up to ${TRIAL.MAX_QUESTIONS} questions`,
      "Play 1 Free Quiz daily",
      "Attend Free Courses",
    ],
    highlight: false,
    tax: 0,
    durationDays: TRIAL.DURATION_DAYS,
    maxQuestions: TRIAL.MAX_QUESTIONS,
    includedBonusQuestions: 0,
  },
  {
    name: "GO",
    price: 100,
    originalPrice: null,
    badge: null,
    suffix: "",
    slug: "go",
    color: "#34D399", // Emerald 400
    titleClass: "text-[#065F46] dark:text-neutral-100",
    features: [
      "30 days (1 month) valid",
      "Ask up to 20 questions",
      "Get answers from top 10% teachers",
      "Play 2x more Premium Quizzes",
      "Unlock Subscription Courses",
    ],
    highlight: false,
    tax: 0,
    durationDays: 30,
    maxQuestions: 20,
    includedBonusQuestions: 0,
  },
  {
    name: "Plus",
    price: 250,
    originalPrice: null,
    badge: null,
    suffix: "",
    slug: "plus",
    color: "#10B981", // Emerald 500
    titleClass: "text-[#065F46] dark:text-neutral-100",
    features: [
      "60 days (2 months) valid",
      "Ask up to 50 questions",
      "Get answers from top 10% teachers",
      "Play 5x more Premium Quizzes",
      "Unlock Subscription Courses",
    ],
    highlight: false,
    tax: 0,
    durationDays: 60,
    maxQuestions: 50,
    includedBonusQuestions: 0,
  },
  {
    name: "Pro",
    price: 500,
    originalPrice: null,
    badge: null,
    suffix: "",
    slug: "pro",
    color: "#059669", // Emerald 600
    titleClass: "text-[#065F46] dark:text-neutral-100",
    features: [
      "90 days (3 months) valid",
      "Ask up to 100 questions",
      "Get answers from top 10% teachers",
      "Play 10x more Premium Quizzes",
      "Unlock Subscription Courses",
      "Priority Teacher Matching",
    ],
    highlight: false,
    tax: 0,
    durationDays: 90,
    maxQuestions: 100,
    includedBonusQuestions: 0,
  },
  {
    name: "Max",
    price: 1000,
    originalPrice: null,
    badge: "Best Value",
    suffix: "",
    slug: "max",
    color: "#047857", // Emerald 700
    titleClass: "text-[#065F46] dark:text-neutral-100",
    features: [
      "120 days (4 months) valid",
      "Ask up to 200 questions",
      "Get answers from top 10% teachers",
      "Play 20x more Premium Quizzes",
      "Unlock Subscription Courses",
      "Top Priority & Live sessions",
    ],
    highlight: true,
    tax: 0,
    durationDays: 120,
    maxQuestions: 200,
    includedBonusQuestions: 0,
  },
];

// ─────────────────────────────────────────────────────────────────────
// 3. ANSWER FORMAT DURATIONS & POINTS EARNING
//    Teachers earn POINTS per answer (not cash).
//    Points convert to NPR at a rate set by admin (default 1:1).
// ─────────────────────────────────────────────────────────────────────

export const FORMAT = {
  TEXT: {
    /** Minutes allowed for a text answer */
    DURATION_MINUTES: 15,
    /** Points the teacher earns for a text answer (base, before rating bonus) */
    POINTS: 5,
  },
  PHOTO: {
    DURATION_MINUTES: 15,
    POINTS: 10,
  },
  VIDEO: {
    DURATION_MINUTES: 15,
    POINTS: 20,
  },
  /** Fallback when student picks "ANY" format */
  ANY: {
    DURATION_MINUTES: 15,   // defaults to PHOTO duration
    POINTS: 10,             // defaults to PHOTO points
  },
} as const;

// ─────────────────────────────────────────────────────────────────────
// 4. TEACHER & MONETIZATION
// ─────────────────────────────────────────────────────────────────────

export const TEACHER = {
  /** Number of answers a teacher must complete before earnings unlock */
  QUALIFICATION_THRESHOLD: 10,

  /** Platform commission percentage deducted from teacher earnings */
  COMMISSION_PERCENT: 15,

  /** Rating-based base payout points for a 2-star answer */
  RATING_POINTS_2_STAR: 2,

  /** Rating-based base payout points for a 3-star answer */
  RATING_POINTS_3_STAR: 3,

  /** Rating-based base payout points for a 4-star answer */
  RATING_POINTS_4_STAR: 4,

  /** Rating-based base payout points for a 5-star answer */
  RATING_POINTS_5_STAR: 5,

  /** Score points deducted from teacher when they fail to answer in time */
  TIMEOUT_SCORE_DEDUCTION: 1,

  /**
   * Rating bonus multiplier applied to earnings.
   * Formula: base × (rating / 5) × RATING_BONUS_MULTIPLIER
   * e.g. 1.5 means a 5-star answer earns 1.5× the base rate.
   */
  RATING_BONUS_MULTIPLIER: 1.5,

  /** Bonus points awarded for a 4-star rating */
  BONUS_POINTS_4_STAR: 0.2,

  /** Bonus points awarded for a 5-star rating */
  BONUS_POINTS_5_STAR: 0.4,

  /** Bonus points awarded for a 3-star rating */
  BONUS_POINTS_3_STAR: 0.1,

  /** Bonus points awarded for a 2-star rating */
  BONUS_POINTS_2_STAR: 0.1,

  /** Points deducted for a 1-star rating */
  PENALTY_POINTS_LOW_RATING: 1,

  /** Max times a question can be reset (pushed to top) after rating 1 */
  MAX_QUESTION_RESET_COUNT: 3,

  /** Monthly bonus points for maintaining high score */
  MONTHLY_HIGH_SCORE_BONUS_POINTS: 1,
} as const;

// ─────────────────────────────────────────────────────────────────────
// 5. WITHDRAWAL / POINTS CONVERSION
// ─────────────────────────────────────────────────────────────────────

export const WITHDRAWAL = {
  /** 1 point = this many NPR */
  POINT_TO_NPR_RATE: 1,

  /** Minimum points required to request a withdrawal */
  MIN_WITHDRAWAL_POINTS: 50,
} as const;

// ─────────────────────────────────────────────────────────────────────
// 6. PLATFORM MISC
// ─────────────────────────────────────────────────────────────────────

export const PLATFORM = {
  /** Name shown in headers, emails, etc. */
  NAME: "Question Hub",

  /** Supported payment gateways */
  GATEWAYS: ["SOFTMATO", "MANUAL"] as const,

  /** Default currency */
  CURRENCY: "NPR",

  /** Max file upload size in MB (for screenshots, answers, etc.) */
  MAX_UPLOAD_SIZE_MB: 100,

  /** Max allowed duration for uploaded video attachments */
  MAX_VIDEO_DURATION_MINUTES: 30,
} as const;

// ─────────────────────────────────────────────────────────────────────
// 7. COURSE PLATFORM DEFAULTS (Phase 15 seed values only)
// ─────────────────────────────────────────────────────────────────────

export const COURSE = {
  /** Max allowed duration for uploaded course videos */
  MAX_VIDEO_DURATION_MINUTES: 60,
  /** Max upload size accepted by the current Cloudinary course-video pipeline */
  MAX_CLOUDINARY_VIDEO_UPLOAD_BYTES: 100 * 1024 * 1024,
  /** % watched before a course video is treated as completed */
  PROGRESS_COMPLETION_THRESHOLD: 90,
  /** Minutes before a live session when reminder sends are scheduled */
  LIVE_SESSION_NOTIFICATION_LEAD_MINUTES: 30,
  /** Platform commission deducted from paid course sales */
  PURCHASE_COMMISSION_PERCENT: 20,
} as const;

// ─────────────────────────────────────────────────────────────────────
// 8. PEER COMMENTS & MILESTONE POINTS (Phase 8)
// ─────────────────────────────────────────────────────────────────────

export const PEER_COMMENTS = {
  /** Unique questions commented on before AI evaluation triggers */
  POINT_THRESHOLD: 10,
  /** Minimum points AI can award per milestone */
  MIN_POINT_REWARD: 0.5,
  /** Maximum points AI can award per milestone */
  MAX_POINT_REWARD: 1.0,
} as const;

// ─────────────────────────────────────────────────────────────────────
// 9. QUIZ SERVICE (Phase 12)
// ─────────────────────────────────────────────────────────────────────

export const QUIZ = {
  /** Questions per quiz session */
  QUESTION_COUNT: 20,
  /** Total seconds allowed in a single session */
  TIME_LIMIT_SECONDS: 20 * 60,
  /** Days before served questions can be reused for the same student */
  REPEAT_RESET_DAYS: 15,
  /** Same-day free quiz session cap (Asia/Kathmandu day boundary) */
  FREE_DAILY_SESSION_LIMIT: 1,
  /** Minimum score required to earn the free-quiz reward */
  FREE_PASS_PERCENT: 90,
  /** Decimal points awarded for passing the free quiz */
  FREE_POINT_REWARD: 0.2,
  /** Same-day premium quiz session cap (Asia/Kathmandu day boundary) */
  PREMIUM_DAILY_SESSION_LIMIT: 3,
  /** Same-day premium quiz session cap for the GO plan */
  PREMIUM_DAILY_SESSION_LIMIT_GO: 3,
  /** Same-day premium quiz session cap for the Plus plan */
  PREMIUM_DAILY_SESSION_LIMIT_PLUS: 5,
  /** Same-day premium quiz session cap for the Pro plan */
  PREMIUM_DAILY_SESSION_LIMIT_PRO: 7,
  /** Same-day premium quiz session cap for the Max plan */
  PREMIUM_DAILY_SESSION_LIMIT_MAX: 10,
  /** Minimum score required to earn the premium-quiz reward */
  PREMIUM_PASS_PERCENT: 90,
  /** Decimal points awarded for passing the premium quiz */
  PREMIUM_POINT_REWARD: 2,
  /** Violations allowed before the next one forces auto-submit */
  VIOLATION_WARNING_LIMIT: 2,
} as const;

// ─────────────────────────────────────────────────────────────────────
// 10. REFERRAL SYSTEM
// ─────────────────────────────────────────────────────────────────────

export const REFERRAL = {
  /** Bonus questions awarded to the referrer when someone signs up with their code */
  REFERER_BONUS_QUESTIONS: 3,
  /** Bonus questions awarded to the referee (new user) when they sign up with a referral code */
  REFEREE_BONUS_QUESTIONS: 1,
  /** Quick toggle to disable referrals without deleting data */
  ENABLED: true,
} as const;

// ─────────────────────────────────────────────────────────────────────
// 11. LEGAL CONTENT
//    Seeded into PlatformConfig and editable later from the admin panel.
// ─────────────────────────────────────────────────────────────────────

export const LEGAL = {
  TERMS_OF_USE: `1. Using the platform fairly
Question Hub is built for real academic learning, respectful collaboration, and honest communication. You agree not to misuse the platform, impersonate another person, or submit abusive, misleading, or unlawful content.

2. Accounts and access
You are responsible for the information you provide during sign up and for keeping your login credentials secure. You should not share your account with anyone else.

3. Questions, answers, and learning content
Questions, answers, quizzes, and courses are provided to support learning. Students and teachers should only upload material they are allowed to share and should avoid posting harmful, plagiarized, or inappropriate content.

4. Payments, earnings, and rewards
Subscriptions, discounts, teacher earnings, withdrawals, and other wallet-related actions follow the active rules stored by the platform. Platform misuse, fraudulent payment activity, or policy abuse may lead to restrictions or account suspension.

5. Platform decisions and updates
We may update features, rules, moderation standards, or access requirements when needed to protect users and improve the service. Continued use of the platform means you accept the latest active version of these terms.

6. Deleting and recovering your account
You can delete your account at any time from Menu → Delete Account in the app. Deletion takes effect immediately: you are signed out and your account stops being accessible. For 30 days after deletion we keep your account in a recoverable state so you can change your mind. To recover it within those 30 days, open "Forgot Password" on the sign-in screen, enter the email address on the account, and use the one-time code (OTP) we send to that email to set a new password — this restores your access. After 30 days the account is permanently anonymized and can no longer be recovered. Some records may be retained longer where required for legal, security, or financial-record purposes.

7. Reporting intellectual property infringement
We respect intellectual property rights and expect every user to do the same. If you believe that content uploaded to the platform copies or infringes your work, contact us at the support email listed in the app and include details of the material, where it appears, and proof of your ownership or rights. We review valid reports and may remove the reported content or restrict the responsible account.`,

  PRIVACY_POLICY: `1. Information we collect
We may collect basic account information such as your name, email address, role, profile details, subscription records, and learning activity inside the platform.

2. How your information is used
Your information is used to create your account, operate student and teacher features, process subscriptions and earnings, deliver notifications, improve product experience, and help keep the platform safe.

3. Shared and private content
Questions may appear in shared feeds depending on the feature flow, while private answer and inbox content is handled according to the visibility choice selected in the app. Administrative and moderation staff may review content when required for support, abuse prevention, or legal compliance.

4. Payments and service providers
Payment-related data may be processed through supported third-party providers such as eSewa, Khalti, or other services connected to the platform. We only use the information necessary to complete those flows and support the account experience.

5. Retention and policy changes
We keep information for as long as it is reasonably needed to provide the platform, maintain records, resolve disputes, and meet legal obligations. This policy may be updated over time, and the latest version available in the app will apply.

6. Third-party services we use
To run core features we rely on trusted third-party services that may process limited technical or account data on our behalf: Sentry (app crash and diagnostics reporting), Firebase Cloud Messaging (push notification delivery), Pusher and LiveKit (real-time chat and audio or video calls), Cloudinary and Mux (image and video upload and playback), and eSewa or Khalti (payment processing). These providers only receive the information needed to perform their function, and their handling of that data is also governed by their own privacy policies.`,
} as const;
