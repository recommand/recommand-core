import { db } from "@recommand/db";
import { completedOnboardingSteps, teamMembers } from "@core/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";

export type CompletedOnboardingStep =
  typeof completedOnboardingSteps.$inferSelect;

export const getCompletedOnboardingSteps = async (userId: string) => {
  const steps = await db
    .select({
      userId: completedOnboardingSteps.userId,
      teamId: completedOnboardingSteps.teamId,
      stepId: completedOnboardingSteps.stepId,
      createdAt: completedOnboardingSteps.createdAt,
      updatedAt: completedOnboardingSteps.updatedAt,
    })
    .from(completedOnboardingSteps)
    .leftJoin(
      teamMembers,
      eq(completedOnboardingSteps.teamId, teamMembers.teamId)
    )
    .where(
      or(
        eq(completedOnboardingSteps.userId, userId),
        eq(teamMembers.userId, userId)
      )
    );

  return steps;
};

export const completeOnboardingStep = async (
  userId: string,
  teamId: string | null,
  stepId: string
) => {
  const [row] = await db
    .insert(completedOnboardingSteps)
    .values({ userId, teamId, stepId })
    .onConflictDoNothing()
    .returning();

  if (row) return row;

  const [existing] = await db
    .select()
    .from(completedOnboardingSteps)
    .where(
      and(
        eq(completedOnboardingSteps.stepId, stepId),
        eq(completedOnboardingSteps.userId, userId),
        teamId !== null
          ? eq(completedOnboardingSteps.teamId, teamId)
          : isNull(completedOnboardingSteps.teamId)
      )
    );

  return existing;
};
