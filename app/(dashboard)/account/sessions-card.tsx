import type { FunctionComponent } from "react";
import { useEffect, useState } from "react";
import type { Account } from "@core/api/account";
import { AsyncButton } from "@core/components/async-button";
import { ConfirmDialog } from "@core/components/confirm-dialog";
import { Badge } from "@core/components/ui/badge";
import { Button } from "@core/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@core/components/ui/card";
import { toast } from "@core/components/ui/sonner";
import { useDateFormat } from "@core/hooks/use-date-format";
import { useTranslation } from "@core/hooks/use-translation";
import { describeUserAgent } from "@core/lib/user-agent";
import { rc } from "@recommand/lib/client";
import { stringifyActionFailure } from "@recommand/lib/utils";

const accountClient = rc<Account>("core");

type Session = {
  createdAt: string;
  id: string;
  isCurrent: boolean;
  lastSeenAt: string | null;
  userAgent: string | null;
};

export const SessionsCard: FunctionComponent = () => {
  const { formatDateTime } = useDateFormat();
  const [sessions, setSessions] = useState<Session[]>([]);
  const { t } = useTranslation();

  const fetchSessions = async () => {
    try {
      const res = await accountClient.account.sessions.$get();
      const data = await res.json();
      if (data.success) {
        setSessions(data.sessions);
      } else {
        toast.error(stringifyActionFailure(data.errors));
      }
    } catch {
      toast.error(t`Failed to load sessions`);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleRevoke = async (sessionId: string) => {
    try {
      const res = await accountClient.account.sessions[":sessionId"].$delete({ param: { sessionId } });
      const data = await res.json();
      if (data.success) {
        toast.success(t`Session signed out`);
      } else {
        toast.error(stringifyActionFailure(data.errors));
      }
    } catch {
      toast.error(t`Failed to sign out the session`);
    }
    await fetchSessions();
  };

  const handleRevokeOthers = async () => {
    try {
      const res = await accountClient.account.sessions.$delete();
      const data = await res.json();
      if (data.success) {
        toast.success(t`Other sessions signed out`);
      } else {
        toast.error(stringifyActionFailure(data.errors));
      }
    } catch {
      toast.error(t`Failed to sign out the other sessions`);
    }
    await fetchSessions();
  };

  const describeDevice = (userAgent: string | null) => {
    const { browser, system } = describeUserAgent(userAgent);
    if (browser && system) {
      return t`${browser} on ${system}`;
    }

    return browser ?? system ?? t`Unknown device`;
  };

  const formatDate = (date: string | null) => (date ? formatDateTime(date) : t`N/A`);

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle>{t`Sessions`}</CardTitle>

        <CardDescription>{t`Where you're signed in. Sign out of any session you don't recognize.`}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t`No active sessions`}</p>
        ) : (
          <ul className="divide-y">
            {sessions.map((session) => (
              <li className="flex flex-wrap items-center justify-between gap-4 py-3" key={session.id}>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-medium">
                    {describeDevice(session.userAgent)}
                    {session.isCurrent ? <Badge variant="secondary">{t`This session`}</Badge> : null}
                  </div>

                  <div className="text-sm text-muted-foreground">
                    {t`Signed in ${formatDate(session.createdAt)}`} · {t`Last active ${formatDate(session.lastSeenAt)}`}
                  </div>
                </div>

                {session.isCurrent ? null : (
                  <AsyncButton onClick={() => handleRevoke(session.id)} size="sm" variant="outline">
                    {t`Sign out`}
                  </AsyncButton>
                )}
              </li>
            ))}
          </ul>
        )}

        {sessions.some((session) => !session.isCurrent) ? (
          <ConfirmDialog
            confirmButtonText={t`Sign out`}
            description={t`Every other browser signed in to your account will be signed out.`}
            onConfirm={handleRevokeOthers}
            title={t`Sign out all other sessions`}
            trigger={<Button variant="outline">{t`Sign out all other sessions`}</Button>}
          />
        ) : null}
      </CardContent>
    </Card>
  );
};
