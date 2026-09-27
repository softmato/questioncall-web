# Question Call Money Flow Overview

This document explains, in plain language, how money, bonuses, and penalties move inside Question Call.

## 1. What the platform tracks

Question Call currently has four value systems:

- `Subscription money (NPR)`: what students pay to access paid plans.
- `Course purchase money (NPR)`: what students pay to unlock paid courses.
- `Withdrawable wallet balance`: the teacher-facing balance used for answer rewards, monthly bonuses, and paid course earnings.
- `Student money and bonus questions`: rewards students can earn through quizzes, milestones, and referrals.

## 2. Student subscription flow

- A new student starts with a free trial.
- If the student buys a subscription, the payment is recorded first and access is activated only after verification.
- Manual subscription payments stay pending until an admin approves them.
- eSewa subscription payments are verified online before the subscription is activated.
- When a subscription is activated or renewed, the student gets an updated end date and the per-cycle `questionsAsked` counter is reset.
- Early renewals are additive: remaining active days are preserved and the new plan time is added on top.
- Subscription revenue belongs to the platform.

## 3. Student question and quiz rewards

- Asking questions consumes the student’s question allowance from the active plan.
- Passing quizzes can credit money to the student account.
- AI milestone rewards on peer comments can also credit money to the student account.
- Referral signup rewards do not pay cash. They increase bonus questions for the referrer and the new student.

## 4. Teacher answer earnings

- A teacher must first reach the qualification threshold before answer rewards unlock.
- The answer count is recorded when the teacher submits an answer.
- Money is not credited at answer submission time.
- Rewards are credited when the channel is finally closed and rated, or when the channel is auto-closed with an answer.
- The amount credited depends on:
  - the answer format chosen by the student,
  - the final rating,
  - the live platform config.
- Low ratings and missed deadlines can deduct money from the teacher wallet.
- Teachers with strong ratings can also receive monthly bonus money.

## 5. Course sales and teacher payout

- Free courses generate no payment.
- Subscription-included courses unlock through subscription or coupon, with no separate course sale payout.
- Paid courses create a purchase transaction first, then unlock only after payment verification.
- Manual paid course purchases are reviewed by admin.
- eSewa paid course purchases are verified online.
- Once a paid course purchase is completed:
  - the student is enrolled,
  - the platform commission is applied,
  - the teacher receives the net amount,
  - the commission snapshot is stored on the transaction for audit history.
- Coupon-based unlocks give the student access, but the teacher does not earn from that coupon redemption.

## 6. Platform commission

- Subscription sales are platform revenue.
- Paid course sales apply `coursePurchaseCommissionPercent`.
- The teacher receives the net amount after that commission.
- The commission used for a sale is stored with the transaction so historical records stay correct even if config changes later.

## 7. Withdrawals

- The current codebase allows withdrawals from the wallet view for both teachers and students.
- In practice, teachers withdraw teaching and course earnings, while students can only withdraw reward money that was credited to their account.
- The user enters the amount and eSewa number and submits a withdrawal request.
- The requested balance is held immediately at request time.
- That held amount is no longer available for spending or another withdrawal while the request is pending.
- Admin reviews the request and sends the real NPR payout manually.
- When admin marks the request as completed:
  - the payout record is finalized,
  - the user’s withdrawn total is updated,
  - the held balance stays deducted because it was already reserved earlier.
- When admin rejects the request:
  - the request is marked rejected,
  - the held balance is returned to the user wallet.

## 8. Penalties and score impacts

- Rating `1/5` deducts penalty money from the teacher.
- Channel expiry without an answer also deducts penalty money.
- Penalty totals are tracked separately so reporting can show:
  - total earned,
  - total withdrawn,
  - total penalties,
  - currently available balance.

## 9. Ratings and leaderboard side effects

- Teacher rating metrics update when a final rating is recorded.
- The app keeps both raw rating totals and a backward-compatible overall score.
- Teacher verification and monetization depend on answer completion counts, so accurate counting is important for fair payout eligibility.

## 10. What the wallet means today

- The current teacher wallet is a single withdrawable balance.
- In the current codebase, both answer rewards and paid course sale credits flow into that same withdrawable balance.
- From a business point of view, it is best to think of it as the teacher payout wallet.

## 11. Current repository reality

- Subscription, course and chapter payments go through Softmato hosted checkout, settled by webhook (`lib/payment/softmato.ts`).
- Manual eSewa transfer + admin review is a fallback shown only when Softmato is unreachable.

## 12. Simple end-to-end summary

- Students pay the platform for subscriptions.
- Students pay for paid courses when a course is not free and not included in subscription.
- Teachers earn from:
  - rated answers after monetization,
  - paid course sales after platform commission,
  - monthly bonus rewards.
- Teachers lose balance through:
  - low-rating penalties,
  - missed-answer penalties,
  - successful withdrawals.
- Students gain extra non-cash value through:
  - quiz money,
  - AI milestone money,
  - referral bonus questions.
