# QuestionCall

<div align="center">
  <img src="https://questioncall.com/logo.png" alt="QuestionCall Logo" width="200" />
  <h1>The Smarter Way to Learn</h1>
  <p>A dual-portal academic platform connecting students with expert teachers through interactive questions, video courses, live sessions, and gamified learning.</p>
</div>

---

## Why QuestionCall?

| Traditional Learning | QuestionCall |
|---------------------|--------------|
| Ask a question, wait days for answer | Get verified answers in timed channels |
| Passive video watching | Interactive progress tracking |
| No monetization for teachers | Earn from courses & subscriptions |
| Generic quizzes | AI-powered personalized tests |
| No community engagement | Leaderboards & achievements |

---

## ✨ Features

### 🎓 Question & Answer System
- **Structured Channels** - Teachers create topic-specific channels for organized Q&A
- **Timed Responses** - Urgency drives faster solutions
- **AI Validation** - Quality-checked answers before acceptance

### 📺 Video Courses (Phase 15)
Three ways to access:
- **Free** - Open to all authenticated users
- **Subscription** - Included with monthly plan
- **Paid** - One-time purchase per course

Features:
- Cloudinary-powered video streaming
- Section-based curriculum
- Progress tracking (90% watched = complete)
- Teacher earnings after platform commission

### 🔴 Live Sessions
- Zoom integration for real-time classes
- Email & WhatsApp notifications
- Recording access for enrolled students
- Available for Subscription & Paid courses only

### 🧠 AI-Powered Quizzes
- Generated using Gemini/Groq
- Timed test sessions
- 90%+ to pass & earn money
- Randomized question pools

### 💳 Payments & Wallets
- Softmato payments (hosted checkout via `@softmato/sdk`)
- Subscription purchases
- Course purchases
- Teacher commission payouts
- Secure withdrawal system

### 🏆 Gamification
- Money for answered questions
- Quiz pass rewards
- Leaderboard rankings
- Achievement badges

### 🤖 AI Key Rotation
- Multiple LLM providers (Gemini, Groq, Mistral, Cerebras)
- Automatic failover
- Cost optimization

---

## 👥 Who Is It For?

### Students
- Ask questions and get verified answers
- Enroll in video courses
- Join live classes
- Take quizzes and track progress
- Compete on leaderboards

### Teachers
- Answer questions and build reputation
- Create and sell courses
- Schedule live sessions
- Earn from sales & subscriptions
- Manage earnings in wallet

### Admins
- Manage users and content
- Configure platform settings
- View analytics
- Manage AI providers

---

## 🏗️ Tech Stack

```
Frontend       → Next.js 14 + TypeScript + Tailwind CSS
Database       → MongoDB (Mongoose)
Auth           → NextAuth.js
Real-time      → Pusher
AI             → Gemini, Groq, Mistral, Cerebras
Payments       → Softmato SDK
Videos         → Cloudinary + Zoom API
Notifications  → Nodemailer, Twilio WhatsApp
```

---