import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/unified-auth";
import mongoose from "mongoose";
import WalletHistoryEvent from "@/models/WalletHistoryEvent";
import Question from "@/models/Question";
import User from "@/models/User";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const period = searchParams.get("period") || "month"; // "day" | "week" | "month" | "year"
    const range = parseInt(searchParams.get("range") || "12", 10);

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    await connectToDatabase();

    const user = await User.findById(userId).select("role createdAt");
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const isTeacher = user.role === "TEACHER";

    // A teacher's activity is their earnings, penalties and bonuses: owner and admins only.
    if (isTeacher) {
      const viewer = await getAuthenticatedUser(req);
      if (viewer?.id !== userId && viewer?.role !== "ADMIN") {
        return NextResponse.json({ error: "This activity is private." }, { status: 403 });
      }
    }

    // Determine start date based on period and range
    const now = new Date();
    let startDate = new Date();
    if (period === "day") {
      startDate.setDate(now.getDate() - range);
    } else if (period === "week") {
      startDate.setDate(now.getDate() - range * 7);
    } else if (period === "month") {
      startDate.setMonth(now.getMonth() - range);
    } else if (period === "year") {
      startDate.setFullYear(now.getFullYear() - range);
    }

    // If startDate is before user creation, clamp it and set a message
    const userCreatedAt = user.createdAt ? new Date(user.createdAt) : null;
    let rangeMessage: string | null = null;

    if (userCreatedAt && startDate < userCreatedAt) {
      startDate = new Date(userCreatedAt);
      rangeMessage = `Showing data from ${userCreatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} (account creation date). No earlier activity exists.`;
    }

    let dataPoints: any[] = [];
    let summary: any = {};
    let typeBreakdown: any[] = [];

    if (isTeacher) {
      // Group by day/week/month
      let format = "%Y-%m-%d";
      if (period === "month" || period === "year") {
        format = "%Y-%m";
      }

      dataPoints = await WalletHistoryEvent.aggregate([
        { 
          $match: { 
            userId: new mongoose.Types.ObjectId(userId), 
            occurredAt: { $gte: startDate } 
          } 
        },
        { 
          $group: {
            _id: { $dateToString: { format, date: "$occurredAt" } },
            totalEarned: { 
              $sum: { 
                $cond: [{ $gt: ["$pointsDelta", 0] }, "$pointsDelta", 0] 
              } 
            },
            totalPenalty: { 
              $sum: { 
                $cond: [{ $lt: ["$pointsDelta", 0] }, { $abs: "$pointsDelta" }, 0] 
              } 
            },
            netEarning: { $sum: "$pointsDelta" },
            answerRewards: {
              $sum: {
                $cond: [{ $in: ["$type", ["ANSWER_REWARD", "AUTO_CLOSE_REWARD"]] }, { $cond: [{ $gt: ["$pointsDelta", 0] }, "$pointsDelta", 0] }, 0]
              }
            },
            bonuses: {
              $sum: {
                $cond: [{ $in: ["$type", ["MONTHLY_BONUS", "DAILY_TARGET_BONUS"]] }, "$pointsDelta", 0]
              }
            },
            penalties: {
              $sum: {
                $cond: [{ $in: ["$type", ["LOW_RATING_PENALTY", "TIMEOUT_PENALTY"]] }, { $abs: "$pointsDelta" }, 0]
              }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Type breakdown aggregation (for pie chart)
      typeBreakdown = await WalletHistoryEvent.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(userId),
            occurredAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: "$type",
            total: { $sum: { $abs: "$pointsDelta" } },
            count: { $sum: 1 }
          }
        },
        { $sort: { total: -1 } }
      ]);

      let totalEarned = 0;
      let totalPenalty = 0;
      let netEarning = 0;
      let totalActiveDays = dataPoints.length;
      let bestDay = { date: "", amount: 0 };
      let totalBonuses = 0;
      let totalAnswerRewards = 0;

      dataPoints = dataPoints.map(dp => {
        totalEarned += dp.totalEarned;
        totalPenalty += dp.totalPenalty;
        netEarning += dp.netEarning;
        totalBonuses += dp.bonuses;
        totalAnswerRewards += dp.answerRewards;
        if (dp.netEarning > bestDay.amount) {
          bestDay = { date: dp._id, amount: dp.netEarning };
        }
        return {
          date: dp._id,
          earned: dp.totalEarned,
          penalty: dp.totalPenalty,
          net: dp.netEarning,
          answerRewards: dp.answerRewards,
          bonuses: dp.bonuses,
          penalties: dp.penalties,
          count: dp.count
        };
      });

      summary = {
        totalEarned,
        totalPenalty,
        netEarning,
        totalActiveDays,
        bestDay,
        totalBonuses,
        totalAnswerRewards
      };
    } else {
      let format = "%Y-%m-%d";
      if (period === "month" || period === "year") {
        format = "%Y-%m";
      }

      dataPoints = await Question.aggregate([
        { 
          $match: { 
            askerId: new mongoose.Types.ObjectId(userId), 
            createdAt: { $gte: startDate } 
          } 
        },
        { 
          $group: {
            _id: { $dateToString: { format, date: "$createdAt" } },
            questionsAsked: { $sum: 1 },
            solved: {
              $sum: { $cond: [{ $eq: ["$status", "SOLVED"] }, 1, 0] }
            },
            pending: {
              $sum: { $cond: [{ $in: ["$status", ["PENDING", "ACCEPTED"]] }, 1, 0] }
            }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Status breakdown for pie chart
      typeBreakdown = await Question.aggregate([
        {
          $match: {
            askerId: new mongoose.Types.ObjectId(userId),
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]);

      let totalAsked = 0;
      let totalSolved = 0;
      let totalActiveDays = dataPoints.length;
      let bestDay = { date: "", amount: 0 };

      dataPoints = dataPoints.map(dp => {
        totalAsked += dp.questionsAsked;
        totalSolved += dp.solved;
        if (dp.questionsAsked > bestDay.amount) {
          bestDay = { date: dp._id, amount: dp.questionsAsked };
        }
        return {
          date: dp._id,
          questionsAsked: dp.questionsAsked,
          solved: dp.solved,
          pending: dp.pending
        };
      });

      summary = {
        totalAsked,
        totalSolved,
        totalActiveDays,
        bestDay
      };
    }

    return NextResponse.json({
      role: user.role,
      period,
      dataPoints,
      summary,
      typeBreakdown,
      rangeMessage
    });
  } catch (error: any) {
    console.error("Activity API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
