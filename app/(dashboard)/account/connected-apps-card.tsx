import type { FunctionComponent } from "react";
import { useEffect, useState } from "react";
import type { OAuthConnectedApps } from "@core/api/oauth/connected-apps";
import { ConfirmDialog } from "@core/components/confirm-dialog";
import { Button } from "@core/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@core/components/ui/card";
import { toast } from "@core/components/ui/sonner";
import { useTranslation } from "@core/hooks/use-translation";
import { rc } from "@recommand/lib/client";
import { stringifyActionFailure } from "@recommand/lib/utils";

const client = rc<OAuthConnectedApps>("core");

type ConnectedApp = {
  client: { host: string | null; id: string; name: string | null; uri: string | null };
  connectedAt: string;
  lastUsedAt: string | null;
  teams: { id: string; name: string; permissions: { id: string; name: string }[] }[];
};

export const ConnectedAppsCard: FunctionComponent = () => {
  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const { language, t } = useTranslation();

  const fetchApps = async () => {
    try {
      const response = await client.oauth["connected-apps"].$get();
      const data = await response.json();
      setApps(data.apps);
    } catch {
      toast.error(t`Failed to load connected apps`);
    }
  };

  useEffect(() => {
    fetchApps();
  }, []);

  const disconnect = async (clientId: string) => {
    try {
      const response = await client.oauth["connected-apps"].$delete({ query: { clientId } });
      const data = await response.json();
      if (data.success) {
        toast.success(t`App disconnected`);
      } else {
        toast.error(stringifyActionFailure(data.errors));
      }
    } catch {
      toast.error(t`Failed to disconnect the app`);
    }
    await fetchApps();
  };

  const formatDate = (date: string) => new Date(date).toLocaleString(language);
  const appName = (app: ConnectedApp) => app.client.name ?? app.client.host ?? t`An app`;

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle>{t`Connected apps`}</CardTitle>

        <CardDescription>{t`Apps you allowed to access your teams. Disconnect any app you no longer use.`}</CardDescription>
      </CardHeader>

      <CardContent>
        {apps.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t`No connected apps`}</p>
        ) : (
          <ul className="divide-y">
            {apps.map((app) => (
              <li className="flex flex-wrap items-center justify-between gap-4 py-3" key={app.client.id}>
                <div className="space-y-1">
                  <div className="font-medium">{appName(app)}</div>

                  <div className="text-sm text-muted-foreground">
                    {app.client.host ? <>{t`Identified by ${app.client.host}`} · </> : null}

                    {t`Connected ${formatDate(app.connectedAt)}`} ·{" "}
                    {app.lastUsedAt ? t`Last used ${formatDate(app.lastUsedAt)}` : t`Not used yet`}
                  </div>

                  <ul className="text-sm">
                    {app.teams.map((team) => (
                      <li key={team.id}>
                        <span className="font-medium">{team.name}</span>:{" "}
                        {/* Sorted as they read, in the user's language */}
                        {team.permissions
                          .map((permission) => t(permission.name))
                          .toSorted((a, b) => a.localeCompare(b))
                          .join(", ")}
                      </li>
                    ))}
                  </ul>
                </div>

                <ConfirmDialog
                  confirmButtonText={t`Disconnect`}
                  description={t`${appName(app)} will lose access to your teams right away.`}
                  onConfirm={() => disconnect(app.client.id)}
                  title={t`Disconnect ${appName(app)}`}
                  trigger={
                    <Button size="sm" variant="outline">
                      {t`Disconnect`}
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
