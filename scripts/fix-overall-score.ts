import { connectToDatabase } from "@/lib/mongodb";
import User from "@/models/User";

const BAYESIAN_SEED_VOTES = 5;
const BAYESIAN_SEED_SCORE = 1;

/**
 * Migration: repair `overallScore` values that fall outside the 0-5 range.
 *
 * Legacy documents carry raw point totals (e.g. 10000) in this field. Because
 * the schema used to declare `max: 5`, any `user.save()` on those documents
 * threw a ValidationError — which is what made deleting a question fail.
 *
 * Recomputes the Bayesian average where rating data exists, otherwise clamps.
 */
async function fixOverallScore() {
  try {
    await connectToDatabase();

    const result = await User.collection.updateMany(
      {
        $or: [
          { overallScore: { $lt: 0 } },
          { overallScore: { $gt: 5 } },
          { overallScore: { $type: "null" } },
        ],
      },
      [
        {
          $set: {
            overallScore: {
              $min: [
                5,
                {
                  $max: [
                    0,
                    {
                      $divide: [
                        {
                          $add: [
                            BAYESIAN_SEED_SCORE * BAYESIAN_SEED_VOTES,
                            { $ifNull: ["$overallRatingSum", 0] },
                          ],
                        },
                        {
                          $add: [
                            BAYESIAN_SEED_VOTES,
                            { $ifNull: ["$overallRatingCount", 0] },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
    );

    console.log(
      `✅ Migration complete: ${result.modifiedCount} users repaired (${result.matchedCount} matched)`,
    );
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

fixOverallScore();
