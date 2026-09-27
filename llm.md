# QuestionCall (LISTNERS) - LLM Context Document

This document is specifically designed to provide large language models (LLMs) with comprehensive, high-level, and technical context about the **QuestionCall** (also referred to internally as **LISTNERS**) platform.

---

## 1. Platform Overview
**QuestionCall** is a dynamic, dual-portal academic platform that connects students with expert teachers. It serves as an all-in-one educational hub featuring interactive question-and-answer functionality, video courses, live sessions, gamified learning, and real-time one-on-one help. 

**Core Value Proposition:** Fast, trusted, two-way communication between students and verified teachers for academic doubt resolution, combined with structured learning (courses/quizzes) and an internal economy for teachers to monetize their expertise.

## 2. Why It Was Built
Traditional learning and existing online platforms often leave students waiting days for answers, rely on generic passive videos, or give robotic/unverified AI answers. **QuestionCall** was built to solve these problems by:
- Creating a **fast, timed response system** (15-minute answer timers once a teacher accepts a question).
- Enabling **two-way real-time communication** (chat, audio, video) instead of static forums.
- Allowing teachers to directly **monetize** their knowledge through a wallet system, paid courses, and subscriptions.
- Bundling multiple expensive EdTech features (video calling, courses, quizzes, real-time chat, payments) into a single, cohesive, and affordable system.

## 3. Who Is It For? (User Personas)

### Students
- Can post academic questions with media/files.
- Have the choice of posting publicly (community learning) or privately (direct inbox help).
- Receive verified, real-time help via chat, audio, or video calls.
- Can enroll in video courses and attend live scheduled classes.
- Take AI-generated quizzes to earn money and climb leaderboards.

### Teachers
- Can pick up questions from a live feed and lock them in to answer.
- Answer questions using an integrated workspace (text, images, files, or live video).
- Must pass a qualification phase (answering initial test questions) before gaining full visibility/earning potential.
- Can create and sell structured video courses.
- Schedule and run live premium sessions.
- Manage earnings via an internal wallet system with real-world withdrawals.

### Admins
- Manage platform health, user suspension, transaction approvals, and withdrawal processing.
- Configure AI API keys, payment gateways, pricing plans, and coupons.

## 4. Core Features & Capabilities

### 🎓 Real-Time Question & Answer System
- Questions can be public or private.
- Questions appear in a live feed; teachers claim them.
- **Timer Mechanism:** Accepted questions come with a fast 15-minute answer timer.
- Both users enter a live screen to chat, share files, and verify the solution.

### 🎥 Real-Time Communication (Video & Chat)
- **Live Chat:** Instant messaging powered by Pusher.
- **Video Calling:** Real-time 1-on-1 video and audio calls powered by LiveKit.
- Incoming call overlay, accept/reject flows, missed call detection, and duration limits.

### 📺 Course Library & Live Sessions
- Teachers can upload video courses (Cloudinary/Mux).
- Courses can be Free, Subscription-based, or Paid (one-time).
- Section-based curriculum with strict progress tracking (requires 90% watch time).
- Teachers can schedule associated **Live Sessions** (Zoom integration) for enrolled students.

### 🧠 AI-Powered Quiz Portal
- AI dynamically generates Multiple Choice Questions based on subjects and topics.
- Supported by a multi-LLM setup (Gemini, Groq, Mistral, Cerebras).
- Gamified scoring: Scoring 90%+ grants users money for their wallet/renewals.

### 💳 Payments, Wallet & Internal Economy
- Built-in digital wallet for teachers to accumulate earnings.
- Payments via Softmato hosted checkout (eSewa, Khalti and others behind one SDK).
- Features money-based rewards, referral bonuses, manual payments, and secure withdrawals.

### 🏆 Gamification & PWA
- Progressive Web App (PWA) functionality: Installable, offline caching, push notifications.
- Leaderboards, achievement badges, and visible ratings for teachers.

## 5. Technical Architecture & Stack

If you are writing code or debugging for QuestionCall, keep this stack in mind:
- **Frontend / Framework:** Next.js 14 (App Router), React, TypeScript, Tailwind CSS, Shadcn UI.
- **Backend / Database:** Next.js Server Actions / API Routes + MongoDB (using Mongoose). Over 25 complex data models (User, Question, Answer, Course, Transaction, Wallet, etc.).
- **Authentication:** NextAuth.js with JWT sessions and strict role-based access control (`STUDENT`, `TEACHER`, `ADMIN`).
- **Real-Time WebSockets:** Pusher for live chat, notifications, and feed syncing.
- **Video / Media:** LiveKit for 1-on-1 calls. Cloudinary & Mux for course video hosting/streaming. Zoom API for live group classes.
- **AI Integration:** Multi-provider AI key rotation system (Gemini, Groq, Mistral) with automatic failover to prevent downtime and optimize costs.
- **Validation:** Zod schemas.
- **Notifications:** Nodemailer (Email), VAPID (Web Push Notifications).

## 6. Important Notes for LLMs Assisting in Development
- **Role-Based Routing:** Ensure that components explicitly check for roles. The workspace shell heavily depends on whether the user is a `STUDENT`, `TEACHER`, or `ADMIN`.
- **Aesthetic Priority:** When adding frontend features, always adhere to the established premium UI. Use glassmorphism, subtle micro-animations (e.g., hover effects, scroll reveals), modern typography, and Shadcn components where applicable. Avoid plain Tailwind utility classes if a branded component already exists.
- **Performance:** Because of the heavy real-time nature of the app (Pusher, LiveKit), always ensure proper cleanup of WebSockets, event listeners, and WebRTC connections in `useEffect` hooks.
- **Bundled Application:** This platform is essentially multiple SaaS products bundled into one (a Udemy clone + an Omegle/Zoom clone + a ChatGPT wrapper + a forum). Keep cross-domain impacts in mind when modifying core schemas like `User` or `Wallet`.
