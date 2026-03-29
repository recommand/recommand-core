import { Section, Text } from "@react-email/components";
import {
  Button,
  EmailLayout,
  EmailHeading,
  InfoSection,
  baseUrl,
} from "./components/shared";
import { fallbackT, type TranslationFunction } from "@core/lib/translations";

interface TeamInvitationEmailProps {
  firstName: string | null;
  teamName: string;
  resetPasswordLink: string;
  t?: TranslationFunction;
}

export const TeamInvitationEmail = ({
  firstName,
  teamName = "Team",
  resetPasswordLink = "https://example.com/reset-password/token",
  t = fallbackT,
}: TeamInvitationEmailProps) => (
  <EmailLayout preview={t`You've been invited to join ${teamName} on Recommand`} t={t}>
    <EmailHeading>{t`You're invited`}</EmailHeading>
    <Text className="mb-4">{t`Hello ${firstName ?? t`there`},`}</Text>
    <Text className="mb-4">
      {t`You've been invited to join ${teamName} on Recommand. We've created an account for you.`}
    </Text>
    <Section className="my-6 text-center">
      <Button variant="primary" href={resetPasswordLink}>
        {t`Set your password`}
      </Button>
    </Section>
    <InfoSection>
      <Text className="my-1 text-sm">
        {t`This invitation will expire in 7 days.`}
      </Text>
      <Text className="my-1 text-sm">
        {t`After that, ask your team administrator to resend the invitation.`}
      </Text>
    </InfoSection>
  </EmailLayout>
);

TeamInvitationEmail.PreviewProps = {
  firstName: "Alex",
  teamName: "Acme Corp",
  resetPasswordLink: `${baseUrl}/reset-password/sample-token`,
} as TeamInvitationEmailProps;

export default TeamInvitationEmail;

export const subject = (props: { teamName: string; t?: TranslationFunction }) => {
  const t = props.t ?? fallbackT;
  return t`You've been invited to join ${props.teamName} on Recommand`;
};
