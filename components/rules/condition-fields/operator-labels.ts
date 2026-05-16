import type { EventFieldOperator } from "../../../lib/rules/types";

export const operatorLabels: Record<EventFieldOperator, string> = {
  eq: "Equals",
  neq: "Doesn't equal",
  in: "Is one of",
  notIn: "Is not one of",
  contains: "Contains",
  exists: "Exists",
};
