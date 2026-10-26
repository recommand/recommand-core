import { create } from "zustand";
import { useMemo } from "react";
import { useUserStore } from "./user-store";

export interface OnboardingStep {
  id: string;
  scope: "user" | "team";
  title: string;
  description?: string;
  showContinueButton?: boolean;
  // Position among the steps (lower comes first, default 0). Steps with equal
  // order keep registration order, which across packages follows effect timing,
  // so a step that has to come before another package's steps pins itself.
  order?: number;
  render: ({
    onComplete,
  }: {
    onComplete: () => Promise<void>;
  }) => React.ReactNode;
}

interface OnboardingStore {
  steps: OnboardingStep[];
  registerOnboardingStep: (step: OnboardingStep) => void;
}

const useOnboardingStore = create<OnboardingStore>((set, get) => ({
  steps: [],
  registerOnboardingStep: (step: OnboardingStep) => {
    set((state) => {
      const existingIndex = state.steps.findIndex(
        (existingItem) => existingItem.id === step.id
      );
      if (existingIndex >= 0) {
        const newSteps = [...state.steps];
        newSteps[existingIndex] = step;
        return { steps: newSteps };
      }
      return { steps: [...state.steps, step] };
    });
  },
}));

export const useOnboardingSteps = (): OnboardingStep[] => {
  const steps = useOnboardingStore((state) => state.steps);
  // Stable sort: equal (or absent) order preserves registration order.
  return useMemo(
    () => [...steps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [steps]
  );
};

export const useOnboardingActions = (): {
  registerOnboardingStep: (step: OnboardingStep) => void;
} => {
  const registerOnboardingStep = useOnboardingStore(
    (state) => state.registerOnboardingStep
  );
  return useMemo(
    () => ({
      registerOnboardingStep,
    }),
    [registerOnboardingStep]
  );
};

export const useUncompletedOnboardingSteps = (): OnboardingStep[] => {
  const onboardingSteps = useOnboardingSteps();
  const {completedOnboardingSteps, activeTeam} = useUserStore();

  return useMemo(() => {
    return onboardingSteps.filter(
      (step) =>
        !completedOnboardingSteps.some((completedStep) => {
          if (step.id !== completedStep.stepId) {
            return false;
          }

          if (step.scope === "team") {
            // For team steps, we need to check if the teamId is not null and if it matches the active team
            return completedStep.teamId !== null && completedStep.teamId === activeTeam?.id;
          }

          return true;
        })
    );
  }, [onboardingSteps, completedOnboardingSteps, activeTeam]);
};
