import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@core/components/ui/card";
import { Switch } from "@core/components/ui/switch";
import { toast } from "@core/components/ui/sonner";
import { useTranslation } from "@core/hooks/use-translation";
import type { NotificationsApi } from "@core/api/notifications";
import { rc } from "@recommand/lib/client";
import { stringifyActionFailure } from "@recommand/lib/utils";

const client = rc<NotificationsApi>("core");

type Preferences = {
  channels: Array<{ channel: string; label: string }>;
  groups: Array<{
    group: string;
    kinds: Array<{ kind: string; label: string; description: string | null; channels: string[] }>;
  }>;
};

/** Per notification kind, a switch for each channel. Shown in the account settings. */
export function NotificationPreferencesCard() {
  const { t } = useTranslation();
  const [preferences, setPreferences] = useState<Preferences | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await client.account["notification-preferences"].$get();
      const data = await res.json();
      if (data.success) {
        setPreferences(data);
      }
    } catch {
      toast.error(t`Could not load notification preferences`);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (kind: string, current: string[], channel: string, on: boolean) => {
    const channels = on ? [...current, channel] : current.filter((value) => value !== channel);
    setPreferences((previous) =>
      previous && {
        ...previous,
        groups: previous.groups.map((group) => ({
          ...group,
          kinds: group.kinds.map((entry) => (entry.kind === kind ? { ...entry, channels } : entry)),
        })),
      }
    );
    try {
      const res = await client.account["notification-preferences"][":kind"].$put({
        param: { kind },
        json: { channels },
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(stringifyActionFailure(data.errors));
        await load();
      }
    } catch {
      toast.error(t`Could not save the notification preference`);
      await load();
    }
  };

  if (!preferences || preferences.groups.length === 0) {
    return null;
  }

  return (
    <Card id="notifications" className="md:col-span-2">
      <CardHeader>
        <CardTitle>{t`Notifications`}</CardTitle>
        <CardDescription>{t`Choose how you hear about what needs your attention.`}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {preferences.groups.map((group) => (
          <section key={group.group}>
            <div className="flex items-end justify-between gap-4 border-b pb-2">
              <h3 className="text-sm font-title">{group.group}</h3>
              <div className="flex gap-6 text-xs text-muted-foreground">
                {preferences.channels.map((channel) => (
                  <span key={channel.channel} className="w-10 text-center">
                    {channel.label}
                  </span>
                ))}
              </div>
            </div>
            <ul className="divide-y">
              {group.kinds.map((kind) => (
                <li key={kind.kind} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm">{kind.label}</p>
                    {kind.description && <p className="text-xs text-muted-foreground">{kind.description}</p>}
                  </div>
                  <div className="flex shrink-0 gap-6">
                    {preferences.channels.map((channel) => (
                      <div key={channel.channel} className="flex w-10 justify-center">
                        <Switch
                          checked={kind.channels.includes(channel.channel)}
                          onCheckedChange={(on) => toggle(kind.kind, kind.channels, channel.channel, on)}
                          aria-label={`${kind.label}: ${channel.label}`}
                        />
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
