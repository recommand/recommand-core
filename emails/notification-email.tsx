import { Column, Row } from "@react-email/components";
import { fallbackT, type TranslationFunction } from "@core/lib/translations";
import type { NotificationContent, NotificationDelivery } from "@core/lib/notifications/types";
import {
  Button,
  EmailHeading,
  EmailLayout,
  EmailLink,
  InfoSection,
  Link,
  Section,
  Text,
  baseUrl,
  emailColors,
} from "./components/shared";

export interface NotificationEmailProps {
  content: NotificationContent;
  actions: NotificationDelivery["actions"];
  settingsUrl: string;
  t?: TranslationFunction;
}

/** Makes an app path such as `/documents/1` absolute, for use in an email. */
export function absoluteUrl(url: string) {
  return /^https?:\/\//.test(url) ? url : `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * The one email layout of all notifications: an eyebrow, the title, a summary,
 * a table of fields, a note, the action buttons and why the user gets it.
 */
export const NotificationEmail = ({ content, actions, settingsUrl, t = fallbackT }: NotificationEmailProps) => (
  <EmailLayout
    preview={content.summary ?? content.title}
    t={t}
    signOff={false}
    footer={
      <>
        {content.explanation && `${content.explanation} `}
        <Link href={settingsUrl} className={`text-[${emailColors.muted}] underline`}>
          {t`Change which messages you get`}
        </Link>
      </>
    }
  >
    {content.eyebrow && (
      <Text className="mt-0 mb-2 text-sm">
        <span className={`mr-2 inline-block h-2.5 w-2.5 bg-[${emailColors.attention}]`} />
        {content.eyebrow}
      </Text>
    )}
    <EmailHeading>{content.title}</EmailHeading>
    {content.summary && <Text className={`mt-0 mb-6 text-base text-[${emailColors.muted}]`}>{content.summary}</Text>}
    {content.fields && content.fields.length > 0 && (
      <Section className={`mb-6 border-0 border-t border-solid border-[${emailColors.border}]`}>
        {content.fields.map((field, index) => (
          <Row key={index} className={`border-0 border-b border-solid border-[${emailColors.border}]`}>
            <Column className={`w-2/5 py-3 align-top text-sm text-[${emailColors.muted}]`}>{field.label}</Column>
            <Column
              className={`py-3 text-right align-top text-sm ${field.style === "strong" ? "font-semibold" : ""} ${field.style === "mono" ? "font-mono" : ""}`}
            >
              {(Array.isArray(field.value) ? field.value : [field.value]).map((line, lineIndex) => (
                <div key={lineIndex}>{line}</div>
              ))}
            </Column>
          </Row>
        ))}
      </Section>
    )}
    {content.note && (
      <InfoSection>
        <Text className="my-0 text-sm font-medium">{content.note.title}</Text>
        {content.note.text && <Text className={`my-1 text-sm text-[${emailColors.muted}]`}>{content.note.text}</Text>}
      </InfoSection>
    )}
    {actions.length > 0 && (
      <Section className="mt-6">
        {/* Side by side when they fit, else one per row at the same width (a
            phone). No media query: not every mail app supports one. */}
        {actions.map((action, index) => (
          <div key={action.action} className="mr-2 mb-2 inline-block w-full max-w-[200px] align-top">
            <Button
              href={action.url}
              variant={index === 0 ? "primary" : "secondary"}
              className="box-border block w-full text-center"
            >
              {action.label}
            </Button>
          </div>
        ))}
        <Text className={`mt-2 mb-0 text-xs text-[${emailColors.muted}]`}>
          {actions.length === 1
            ? t`The button opens a page where you confirm, so opening this email changes nothing. It works once, only for you.`
            : t`The buttons open a page where you confirm, so opening this email changes nothing. They work once, only for you.`}
        </Text>
      </Section>
    )}
    {content.link && (
      <Text className="mt-6 mb-0 text-sm">
        <EmailLink href={absoluteUrl(content.link.url)}>{content.link.label}</EmailLink>
      </Text>
    )}
  </EmailLayout>
);

NotificationEmail.PreviewProps = {
  content: {
    eyebrow: "Approval needed",
    title: "Your sign-off for Staalbouw Lemmens",
    subject: "Approve: Staalbouw Lemmens, € 18.900,20, due 11 Nov",
    summary: "Noordhaven Logistics asks you to approve this invoice. All lines are on your project.",
    fields: [
      { label: "From", value: "Staalbouw Lemmens NV" },
      { label: "Document number", value: "F2026-0412", style: "mono" },
      { label: "Due", value: "11 Nov 2026" },
      { label: "Lines", value: ["Steel beams S235 IPE 200 · 14.760,00", "Cutting to size · 520,00"] },
      { label: "Amount", value: "€ 18.900,20 · net € 15.620,00", style: "strong" },
    ],
    note: { title: "Already approved by Sofie Wouters on 22 Oct", text: "“Steel price agreed in September.”" },
    link: { label: "Open the invoice", url: "/documents/sample" },
    explanation: "You receive this email because the Purchase invoices workflow of Noordhaven Logistics asks you to approve.",
  },
  actions: [
    { action: "approve", label: "Approve", reason: "optional", url: `${baseUrl}/notification-action/sample?action=approve` },
    { action: "reject", label: "Reject", reason: "required", url: `${baseUrl}/notification-action/sample?action=reject` },
  ],
  settingsUrl: `${baseUrl}/account`,
} as NotificationEmailProps;

export default NotificationEmail;

export const subject = (props: NotificationEmailProps) => props.content.subject ?? props.content.title;
