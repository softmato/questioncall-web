# Question Call — Agent Documentation

---

## 🚨 MANDATORY RULES

> **RULE 1 — CONFIG:** All config values MUST come from `getPlatformConfig()` via `models/PlatformConfig.ts`. File `lib/config.ts` is seed-only.

> **RULE 2 — AI CALLS:** All AI/LLM calls MUST go through `lib/llm.ts → llmGenerate()`. No direct SDK calls.

> **RULE 3 — TASK TRACKING:** Before any task, create/update `task.md` with chunk info, files to touch, and exit condition.

> **RULE 4 — PAYMENTS:** Subscription, course and chapter purchases use Softmato hosted checkout (`@softmato/sdk`, `lib/payment/softmato.ts`); manual eSewa transfer appears only if Softmato is unreachable. Course purchases use `type: "COURSE_PURCHASE"` and atomically credit teacher wallet minus `coursePurchaseCommissionPercent`. Commission is snapshot in Transaction metadata.

---

## What Are We Building?

**Question Call** is an academic platform with two main portals:

| Portal | Purpose |
|--------|---------|
| **Student** | Ask questions → get answers via channels, take quizzes, watch courses, earn money |
| **Teacher** | Answer questions → earn wallet money, create courses, host live sessions |
| **Admin** | Manage users, config, courses, analytics |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14+ (App Router) |
| Language | TypeScript |
| Auth | NextAuth.js (STUDENT / TEACHER / ADMIN) |
| Database | MongoDB + Mongoose |
| Real-time | Pusher |
| AI | Gemini, Groq, OpenRouter, Mistral, Cerebras (via `lib/llm.ts`) |
| Payments | Softmato SDK (`@softmato/sdk`) |
| Storage | Cloudinary (files + videos) |
| Email | Nodemailer / Resend |
| WhatsApp | Twilio WhatsApp Business API |
| Zoom | Zoom OAuth + REST API (live sessions) |
| Styling | Tailwind CSS |
| Deploy | Vercel + MongoDB Atlas |

---

## Completed Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | Project Setup & Auth | ✅ Done |
| 2 | Question System | ✅ Done |
| 3 | Channel & Real-Time Messaging | ✅ Done |
| 4 | Answer Submission & Channel Closing | ✅ Done |
| 5 | Notifications | ✅ Done |
| 6 | Payments — Softmato | ✅ Done |
| 7 | Teacher Wallet & Monetization | ✅ Done |
| 8 | Student Points & AI Validation | ✅ Done |
| 9 | Leaderboard & Gamification | ✅ Done |
| 10 | Admin Panel | ✅ Done |
| 12 | Quiz Portal | ✅ Done |
| 14 | AI Key Rotation System | ✅ Done |
| 15 | Course Management System | 🚧 In Progress |

---

## App Flow

### Student Flow

```
1. Sign Up / Login
2. Get Questions
3. Ask Question → Select Format (Tier/Channel)
4. Wait for Teacher Answer
5. Submit Answer (Teacher → Student passes)
6. Earn Money (AI validates)
7. Leaderboard
8. Subscribe (Softmato checkout)
9. Take Quizzes
10. Browse Courses
11. Enroll / Buy Course → Watch Videos
12. Attend Live Sessions
```

### Teacher Flow

```
1. Sign Up / Login
2. Join Channels
3. Claim Questions
4. Submit Answers
5. Get Paid (wallet)
6. Create Courses (Free / Subscription / Paid)
7. Go Live (Zoom)
8. View Analytics
```

### Admin Flow

```
1. Manage Users
2. Platform Config
3. Manage Courses
4. Create Coupons
5. View Analytics
```

---

## Directory Structure

```
app/
├── (auth)/                 ← Login/Register pages
├── (workspace)/           ← Student/Teacher workspace
│   ├── questions/        ← Ask/Browse questions
│   ├── channels/         ← Channel listings
│   ├── leaderboard/      ← Money/Leaderboard
│   ├── quizzes/          ← Quiz portal
│   ├── courses/         ← Course browse
│   │   ├── [slug]/      ← Course detail
│   │   ├── watch/       ← Video player
│   │   └── live/        ← Live sessions
│   ├── my/               ← My enrollments
│   ├── profile/         ← User profile
│   ├── wallet/          ← Teacher wallet
│   └── upload-course/    ← Course creator (Teacher)
├── (admin)/admin/        ← Admin panel
│   ├── dashboard/       ← Stats overview
│   ├── users/          ← User management
│   ├── channels/       ← Channel management
│   ├── questions/       ← Q&A analytics
│   ├── courses/        ← Course management
│   ├── coupons/        ← Coupon management
│   ├── live-sessions/  ← Session management
│   ├── config/         ← Platform config
│   └── settings/       ← Admin settings
└── api/                ← All API routes
```

---

## Key Services

| Service | File | Purpose |
|---------|------|---------|
| Config | `lib/config.ts` + `models/PlatformConfig.ts` | Fetch admin settings |
| AI | `lib/llm.ts` | All AI calls (quiz gen, validation) |
| Auth | `lib/auth.ts` | NextAuth setup |
| Database | `lib/db.ts` | Mongoose connection |
| Payments | `lib/payment/softmato.ts` | Softmato checkout + settlement |
| Cloudinary | `lib/cloudinary.ts` | File/video upload |
| Email | `lib/email.ts` | Nodemailer/Resend |
| WhatsApp | `lib/whatsapp.ts` | Twilio integration |
| Pusher | `lib/pusher.ts` | Real-time messages |

---

## Database Models

| Model | File | Purpose |
|-------|------|---------|
| User | `models/User.ts` | All user types |
| Question | `models/Question.ts` | Student questions |
| Channel | `models/Channel.ts` | Q&A channels |
| Answer | `models/Answer.ts` | Teacher answers |
| Transaction | `models/Transaction.ts` | Payments/wallet |
| Quiz | `models/Quiz.ts` | Quiz sessions |
| QuizQuestion | `models/QuizQuestion.ts` | Quiz questions |
| PlatformConfig | `models/PlatformConfig.ts` | Admin config |
| Course | `models/Course.ts` | Courses |
| CourseSection | `models/CourseSection.ts` | Course sections |
| CourseVideo | `models/CourseVideo.ts` | Video lessons |
| LiveSession | `models/LiveSession.ts` | Zoom sessions |
| CourseEnrollment | `models/CourseEnrollment.ts` | Enrollments |
| VideoProgress | `models/VideoProgress.ts` | Watch progress |
| CourseCoupon | `models/CourseCoupon.ts` | Discount codes |

---

## API Routes Summary

| Prefix | Description |
|--------|-------------|
| `/api/auth/*` | Login/Logout/Session |
| `/api/questions/*` | Q&A system |
| `/api/channels/*` | Channel management |
| `/api/answers/*` | Answer submission |
| `/api/users/*` | User management |
| `/api/transactions/*` | Wallet/Payments |
| `/api/quizzes/*` | Quiz system |
| `/api/courses/*` | Course system |
| `/api/payments/softmato/*` | Softmato checkout + webhook |

---

## Phase 15 — Course Management (In Progress)

### Three Pricing Models

| Pricing Model | Access | Payment |
|---------------|--------|---------|
| `FREE` | Anyone | Free |
| `SUBSCRIPTION_INCLUDED` | Subscriber or coupon | Subscription fee |
| `PAID` | Buyer or coupon | Course price |

### Key Rules

- PAID courses are independent of subscription
- Platform takes `coursePurchaseCommissionPercent` on each sale
- Commission is snapshot in Transaction metadata
- `FREE` courses cannot have live sessions
- Coupons unlock any course but teacher earns nothing

### Models Added (Phase 15)

- `Course` — title, slug, pricingModel, price, instructor
- `CourseSection` — sections within a course
- `CourseVideo` — video lessons
- `LiveSession` — Zoom schedule
- `CourseEnrollment` — student access record
- `VideoProgress` — watch tracking
- `CourseCoupon` — discount codes

### API Routes (Phase 15)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/courses` | GET | List courses |
| `/api/courses` | POST | Create course |
| `/api/courses/[id]` | GET | Course detail |
| `/api/courses/[id]/enroll` | POST | Enroll (FREE/SUB) |
| `/api/courses/[id]/purchase/initiate` | POST | Start payment |
| `/api/courses/[id]/sections` | GET/POST | Sections |
| `/api/courses/[id]/videos` | POST | Upload video |
| `/api/courses/[id]/videos/[vid]/progress` | PATCH | Update progress |
| `/api/courses/[id]/live-sessions` | POST | Schedule live |
| `/api/courses/coupons/validate` | POST | Validate coupon |
| `/api/payments/softmato/checkout` | POST | Start hosted checkout |
| `/api/payments/softmato/webhook` | POST | Verify + provision |

---

## Platform Config Keys

| Key | Default | Description |
|-----|---------|-------------|
| `trialDays` | 3 | Free trial duration |
| `commissionPercent` | 20 | Platform cut (Q&A) |
| `qualificationThreshold` | 10 | Answers before monetization |
| `quizTimeLimitSeconds` | 1800 | Quiz timer |
| `quizPassPercent` | 90 | Pass threshold |
| `quizPointReward` | 5 | Money on pass |
| `quizQuestionCount` | 50 | Questions per quiz |
| `coursePurchaseCommissionPercent` | 20 | Platform cut (courses) |
| `maxVideoDurationMinutes` | 60 | Max video upload |
| `courseProgressCompletionThreshold` | 90 | % to complete video |
| `liveSessionNotificationLeadMinutes` | 30 | Reminder lead time |

---

## Getting Started

1. **Read this file** — understand phases and flow
2. **Check `task.md`** — see current task
3. **Explore relevant models** — understand data structure
4. **Check existing routes** — see patterns used
5. **Implement** — follow API patterns
6. **Test** — verify functionality

---

## Notes

- Tiers = Formats in this app (not "tiers", "formats")
- Routes live under `app/(workspace)/` for main app
- Admin at `app/(admin)/admin/`
- All AI calls MUST use `llmGenerate()`
- All config MUST use `getPlatformConfig()`
