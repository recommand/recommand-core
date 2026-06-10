import { Section, Text } from "@react-email/components";
import {
  Button,
  EmailLayout,
  EmailHeading,
  InfoSection,
  baseUrl,
} from "./components/shared";
import { fallbackT, type TranslationFunction } from "@core/lib/translations";

interface PasswordResetEmailProps {
  firstName: string | null;
  resetPasswordLink: string;
  t?: TranslationFunction;
}

export const PasswordResetEmail = ({
  firstName,
  resetPasswordLink,
  t = fallbackT,
}: PasswordResetEmailProps) => (
  <EmailLayout preview={t`Reset your Recommand password`} t={t}>
    <EmailHeading>{t`Reset your password`}</EmailHeading>
    <Text className="mb-4">{t`Hello ${firstName ?? t`there`},`}</Text>
    <Text className="mb-4">
      {t`We received a request to reset your password for your Recommand account.`}
    </Text>
    <Section className="my-6 text-center">
      <Button variant="primary" href={resetPasswordLink}>
        {t`Reset password`}
      </Button>
    </Section>
    <InfoSection>
      <Text className="my-1 text-sm">
        {t`This link will expire in 1 hour for security reasons.`}
      </Text>
      <Text className="my-1 text-sm">
        {t`If you didn't request this, you can safely ignore this email.`}
      </Text>
    </InfoSection>
  </EmailLayout>
);

PasswordResetEmail.PreviewProps = {
  firstName: "Max",
  resetPasswordLink: `${baseUrl}/reset-password/sample-token`,
} as PasswordResetEmailProps;

export default PasswordResetEmail;

export const subject = (props: { t?: TranslationFunction }) => {
  const t = props.t ?? fallbackT;
  return t`Reset your Recommand password`;
};
