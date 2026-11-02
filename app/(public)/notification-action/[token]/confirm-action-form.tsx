import { useState } from "react";
import { AsyncButton } from "@core/components/async-button";
import { Button } from "@core/components/ui/button";
import { Card } from "@core/components/ui/card";
import { Label } from "@core/components/ui/label";
import { Textarea } from "@core/components/ui/textarea";
import { toast } from "@core/components/ui/sonner";
import { useTranslation } from "@core/hooks/use-translation";
import type { NotificationsApi } from "@core/api/notifications";
import type { NotificationActionDefinition, NotificationContent } from "@core/lib/notifications/types";
import { rc } from "@recommand/lib/client";
import { stringifyActionFailure } from "@recommand/lib/utils";

const client = rc<NotificationsApi>("core");

export type ActionLink = {
  userEmail: string;
  content: NotificationContent;
  actions: NotificationActionDefinition[];
};

type Props = {
  token: string;
  link: ActionLink;
  initialAction: string | null;
  onDone: (result: "done" | "alreadyHandled" | "denied" | "expired" | "invalid" | "wrongUser") => void;
};

export function ConfirmActionForm({ token, link, initialAction, onDone }: Props) {
  const { t } = useTranslation();
  const { content, actions } = link;
  const [selected, setSelected] = useState(
    actions.find((action) => action.action === initialAction)?.action ?? actions[0]?.action
  );
  const [reason, setReason] = useState("");
  const action = actions.find((candidate) => candidate.action === selected) ?? actions[0];
  if (!action) {
    return null;
  }
  const missingReason = action.reason === "required" && reason.trim() === "";

  const submit = async () => {
    try {
      const res = await client["notification-actions"][":token"].$post({
        param: { token },
        json: { action: action.action, reason: action.reason === "none" ? null : reason },
      });
      const data = await res.json();
      if (data.success) {
        onDone(data.state);
      } else if (res.status === 401) {
        window.location.reload();
      } else if (res.status === 403 || res.status === 404 || res.status === 410) {
        onDone(res.status === 403 ? "wrongUser" : res.status === 404 ? "invalid" : "expired");
      } else {
        toast.error(stringifyActionFailure(data.errors));
      }
    } catch {
      toast.error(t`Could not take the action`);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="text-3xl font-title">{action.confirmTitle ?? content.title}</h1>
      {content.summary && <p className="mt-2 text-muted-foreground">{content.summary}</p>}

      {(content.fields?.length || content.note) && (
        <Card className="mt-6 gap-0 overflow-hidden py-0">
          {content.fields && (
            <dl className="divide-y px-5">
              {content.fields.map((field, fieldIndex) => (
                <div key={fieldIndex} className="flex justify-between gap-4 py-3 text-sm">
                  <dt className="text-muted-foreground">{field.label}</dt>
                  <dd
                    className={`text-right ${field.style === "strong" ? "font-semibold" : ""} ${field.style === "mono" ? "font-mono" : ""}`}
                  >
                    {(Array.isArray(field.value) ? field.value : [field.value]).map((line, lineIndex) => (
                      <div key={lineIndex}>{line}</div>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {content.note && (
            <div className="border-t bg-muted/50 px-5 py-3 text-sm">
              <p>{content.note.title}</p>
              {content.note.text && <p className="mt-1 text-muted-foreground">{content.note.text}</p>}
            </div>
          )}
        </Card>
      )}
      {content.link && (
        <a href={content.link.url} className="mt-3 self-start text-sm underline">
          {content.link.label}
        </a>
      )}

      {action.reason !== "none" && (
        <div className="mt-6 grid gap-2">
          <Label htmlFor="reason">{action.reason === "required" ? t`Reason` : t`Comment, optional`}</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={action.reasonPlaceholder}
            rows={3}
          />
        </div>
      )}

      <div className="mt-auto pt-8">
        <AsyncButton size="lg" className="w-full" onClick={submit} disabled={missingReason}>
          {action.confirmLabel ?? action.label}
        </AsyncButton>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
          <div className="flex gap-4">
            {actions
              .filter((other) => other.action !== action.action)
              .map((other) => (
                <Button key={other.action} variant="link" onClick={() => setSelected(other.action)}>
                  {t`${other.label} instead`}
                </Button>
              ))}
          </div>
          <span className="text-muted-foreground">{t`Signing as ${link.userEmail}`}</span>
        </div>
      </div>
    </div>
  );
}
