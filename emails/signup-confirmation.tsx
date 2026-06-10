import { Section, Text } from "@react-email/components";
import { Button, EmailLayout, EmailHeading, InfoSection, baseUrl } from "./components/shared";
import { fallbackT, type TranslationFunction } from "@core/lib/translations";

interface EmailConfirmationProps {
  firstName: string | null;
  confirmationUrl: string;
  t?: TranslationFunction;
}

export const SignupEmailConfirmation = ({
  firstName,
  confirmationUrl,
  t = fallbackT,
}: EmailConfirmationProps) => (
  <EmailLayout preview={t`Confirm your email address`} t={t}>
    <EmailHeading>{t`Confirm your email`}</EmailHeading>
    <Text className="mb-4">{t`Hello ${firstName ?? t`there`},`}</Text>
    <Text className="mb-4">
      {t`Thank you for signing up for Recommand. Please confirm your email address to get started.`}
    </Text>
    <Section className="my-6 text-center">
      <Button variant="primary" href={confirmationUrl}>
        {t`Confirm email address`}
      </Button>
    </Section>
    <InfoSection>
      <Text className="my-1 text-sm">
        {t`If you didn't create an account, you can safely ignore this email.`}
      </Text>
    </InfoSection>
  </EmailLayout>
);

SignupEmailConfirmation.PreviewProps = {
  firstName: "Max",
  confirmationUrl: `${baseUrl}/email-confirmation/sample-token`,
} as EmailConfirmationProps;

export default SignupEmailConfirmation;

export const subject = (props: { t?: TranslationFunction }) => {
  const t = props.t ?? fallbackT;
  return t`Confirm your email address`;
};
