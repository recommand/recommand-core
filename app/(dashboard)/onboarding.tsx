import { toast } from "@core/components/ui/sonner";
import { useActiveTeam } from "@core/hooks/user";
import type { OnboardingStep } from "@core/lib/onboarding-store";
import { useUserStore } from "@core/lib/user-store";
import { rc } from "@recommand/lib/client";
import { stringifyActionFailure } from "@recommand/lib/utils";
import type { Onboarding } from "api/onboarding";
import { Button } from "@core/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "@core/hooks/use-translation";

const client = rc<Onboarding>("core");

export default function Onboarding({ step }: { step: OnboardingStep }) {
  const activeTeam = useActiveTeam();
  const addCompletedOnboardingStep = useUserStore(x => x.addCompletedOnboardingStep);
  const { t } = useTranslation();

  const onComplete = useCallback(async () => {

    if (step.scope === "team") {
      if (!activeTeam?.id) {
        toast.error(t`You must be in a team to complete this step`);
        return;
      }
    }

    try {
      const response = await client.onboarding.complete.$post({
        json: {
          stepId: step.id,
          teamId: activeTeam?.id ?? null,
        },
      });
      const json = await response.json();
      if (json.success) {
        // Add the step to the completed steps
        addCompletedOnboardingStep(json.completedStep);
      } else {
        toast.error(stringifyActionFailure(json.errors));
      }
    } catch (error) {
      toast.error(t`Failed to complete step`);
    }
  }, [activeTeam?.id, addCompletedOnboardingStep, step.id]);

  return <div>
    <div className="flex flex-col items-center py-12 space-y-12 h-svh">
      <img src="/logo.svg" alt="Recommand Logo" className="h-8 w-auto min-w-32" />
      <div className="flex flex-col items-center space-y-2">
        <h1 className="text-2xl font-bold text-center">{step.title}</h1>
        {step.description && <p className="text-sm text-muted-foreground text-balance max-w-sm text-center">{step.description}</p>}
      </div>
      <div>
        {step.render({
          onComplete
        })}
      </div>
      {step.showContinueButton && <div>
        <Button
          onClick={onComplete}
        >
          {t`Continue`}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>}
    </div>
  </div>;
}
