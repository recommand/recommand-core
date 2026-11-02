import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppLogo } from "@core/components/app-logo";
import { ButtonLink } from "@core/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@core/components/ui/empty";
import { Spinner } from "@core/components/ui/spinner";
import { useTranslation } from "@core/hooks/use-translation";
import { rc } from "@recommand/lib/client";
import type { NotificationsApi } from "@core/api/notifications";
import { ConfirmActionForm, type ActionLink } from "./confirm-action-form";

const client = rc<NotificationsApi>("core");

type Outcome = "done" | "alreadyHandled" | "denied" | "expired" | "invalid" | "wrongUser" | "failed";

/**
 * The page an action link in a notification opens. Opening it changes
 * nothing: the user confirms the action here, which posts it.
 */
export default function NotificationActionPage() {
  const { t } = useTranslation();
  const { token = "" } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [link, setLink] = useState<ActionLink | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const loginUrl = `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;

  const load = useCallback(async () => {
    try {
      const res = await client["notification-actions"][":token"].$get({ param: { token } });
      const data = await res.json();
      if (!data.success) {
        setOutcome("failed");
      } else if (data.state === "loginRequired") {
        navigate(loginUrl, { replace: true });
      } else if (data.state === "ready") {
        setLink(data as ActionLink);
      } else {
        setOutcome(data.state);
      }
    } catch {
      setOutcome("failed");
    }
  }, [token, loginUrl, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const messages: Record<Outcome, { title: string; description: string }> = {
    done: { title: t`Done`, description: t`Your choice is recorded. You can close this page.` },
    alreadyHandled: {
      title: t`Already handled`,
      description: t`This request was handled already, or it is no longer needed. Nothing changed.`,
    },
    denied: { title: t`Not allowed`, description: t`You can no longer act on this request. Nothing changed.` },
    expired: {
      title: t`This link expired`,
      description: t`Links in notifications work for 72 hours. Open the request in the app instead.`,
    },
    invalid: { title: t`Unknown link`, description: t`This link does not exist. Check that you copied all of it.` },
    wrongUser: {
      title: t`This link is for another user`,
      description: t`Sign in with the account that received the email.`,
    },
    failed: { title: t`Something went wrong`, description: t`Try again in a moment.` },
  };

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col px-5 py-8 sm:py-12">
      <AppLogo className="mb-8 h-8 w-auto self-start" />
      {outcome ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyTitle>{messages[outcome].title}</EmptyTitle>
            <EmptyDescription>{messages[outcome].description}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <ButtonLink variant="outline" href={outcome === "wrongUser" ? loginUrl : "/"}>
              {outcome === "wrongUser" ? t`Sign in` : t`Open the app`}
            </ButtonLink>
          </EmptyContent>
        </Empty>
      ) : link ? (
        <ConfirmActionForm
          token={token}
          link={link}
          initialAction={searchParams.get("action")}
          onDone={(result) => setOutcome(result)}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="size-6 text-muted-foreground" />
        </div>
      )}
    </main>
  );
}
