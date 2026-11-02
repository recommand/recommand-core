import { z } from "zod";
import "zod-openapi/extend";

export const NOTIFICATIONS_TAG = "Notifications";

export const takeActionBody = z.object({
  action: z.string().min(1),
  reason: z.string().max(2000).nullish(),
});

export const tokenParam = z.object({ token: z.string().min(1).max(200) });

const preferenceKind = z
  .object({
    kind: z.string(),
    label: z.string(),
    description: z.string().nullable(),
    channels: z.array(z.string()).openapi({ description: "The channels the user gets this kind through. Empty: off." }),
    isDefault: z.boolean().openapi({ description: "True when the user chose nothing and the kind's defaults apply." }),
  })
  .openapi({ ref: "NotificationPreference" });

const preferenceGroup = z
  .object({ group: z.string(), kinds: z.array(preferenceKind) })
  .openapi({ ref: "NotificationPreferenceGroup" });

const channelOption = z.object({ channel: z.string(), label: z.string() }).openapi({ ref: "NotificationChannelOption" });

export const preferencesResponse = z.object({
  channels: z.array(channelOption),
  groups: z.array(preferenceGroup),
});

export const preferenceParam = z.object({ kind: z.string().min(1) });
export const preferenceBody = z.object({
  channels: z.array(z.string()).openapi({ description: "The channels to use. An empty list turns the kind off." }),
});
