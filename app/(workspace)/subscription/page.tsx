import { redirect } from "next/navigation";
import { getSafeServerSession } from "@/lib/auth";
import { SubscriptionClient } from "./subscription-client";
import { getPlatformConfig, getHydratedPlans } from "@/models/PlatformConfig";
import { getQuizSubscriptionSnapshot } from "@/lib/quiz";
import { connectToDatabase } from "@/lib/mongodb";
import { createNoIndexMetadata } from "@/lib/seo";
import { resolveStudentSubscriptionState } from "@/lib/subscription-state";
import Transaction from "@/models/Transaction";
import User from "@/models/User";

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = createNoIndexMetadata({
  title: "Subscription",
  description: "Manage your QuestionCall subscription and question limits.",
});

export default async function SubscriptionPage() {
  const session = await getSafeServerSession();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  if (session.user.role === "TEACHER") {
    redirect("/wallet");
  }

  if (session.user.role === "ADMIN") {
    redirect("/admin/settings");
  }

  await connectToDatabase();

  const pendingTx = await Transaction.findOne({
    userId: session.user.id,
    type: "SUBSCRIPTION_MANUAL",
    status: "PENDING",
  }).sort({ createdAt: -1 });

  const subscription = await getQuizSubscriptionSnapshot(session.user.id);
  const user = await User.findById(session.user.id).select(
    "planSlug questionsAsked bonusQuestions referralCode subscriptionEnd",
  );
  const resolvedSubscription = resolveStudentSubscriptionState({
    userPlanSlug: user?.planSlug,
    userSubscriptionEnd: user?.subscriptionEnd ?? null,
    snapshotPlanSlug: subscription.planSlug,
    snapshotStatus: subscription.subscriptionStatus,
    snapshotEnd: subscription.subscriptionEnd,
  });
  
  const config = await getPlatformConfig();
  const plans = getHydratedPlans(config);
  const currentPlan =
    plans.find((p) => p.slug === resolvedSubscription.planSlug) || plans[0];
  const baseMaxQuestions = currentPlan?.maxQuestions ?? 0;
  const bonusQuestions = user?.bonusQuestions ?? 0;
  const maxQuestions = baseMaxQuestions > 0 ? baseMaxQuestions + bonusQuestions : baseMaxQuestions;
  const questionsAsked = user?.questionsAsked ?? 0;
  const questionsRemaining = maxQuestions > 0 ? Math.max(0, maxQuestions - questionsAsked) : null;

  const initialSubscriptionData = {
    subscriptionStatus: resolvedSubscription.subscriptionStatus,
    subscriptionEnd: resolvedSubscription.subscriptionEnd,
    pendingManualPayment: !!pendingTx,
    questionsAsked,
    questionsRemaining,
    maxQuestions,
    baseMaxQuestions,
    bonusQuestions,
    referralCode: user?.referralCode || null,
    planSlug: resolvedSubscription.planSlug,
  };

  return (
    <SubscriptionClient
      hydratedPlans={JSON.parse(JSON.stringify(plans))}
      trialDays={config.trialDays}
      referralBonusQuestions={config.referralBonusQuestions ?? 1}
      referrerBonusQuestions={config.referrerBonusQuestions ?? 3}
      bonusQuestionValueNpr={config.bonusQuestionValueNpr ?? 10}
      initialSubscriptionData={initialSubscriptionData}
    />
  );
}
