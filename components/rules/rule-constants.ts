import type { VersionedAction } from "../../lib/rules/types";

export const wildcardEventType = "*";

export const emptyWebhookAction: VersionedAction = {
  type: "webhook",
  version: 1,
  config: {
    url: "",
  },
};

export const emptyEmailAction: VersionedAction = {
  type: "email",
  version: 1,
  config: {
    to: [],
  },
};
