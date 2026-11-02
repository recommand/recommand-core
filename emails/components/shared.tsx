import {
  Body,
  Container,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Button as ReactEmailButton,
  Head as ReactEmailHead,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';
import { getAppIdentity } from '@recommand/lib/app-identity';
import { cva } from 'class-variance-authority';
import type * as React from 'react';
import { fallbackT, type TranslationFunction } from '../../lib/translations';

export const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';

const identity = getAppIdentity();

/**
 * The email palette. Neutral by default; the deployment's app identity
 * (`recommand.app`) sets the accent of buttons and links.
 */
const colors = {
  foreground: '#171717',
  muted: '#737373',
  border: '#E5E5E5',
  surface: '#FAFAFA',
  background: '#FFFFFF',
  accent: identity.emailAccent ?? '#171717',
  accentForeground: identity.emailAccentForeground ?? '#FFFFFF',
  /** Marks something that waits for the reader, such as a notification's eyebrow. */
  attention: '#D08A2E',
};

export const Head = () => (
  <ReactEmailHead>
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
  </ReactEmailHead>
);

export const Button = ({
  children,
  variant = 'primary',
  href,
  className,
}: {
  children: React.ReactNode;
  href: string;
  variant?: 'primary' | 'secondary';
  className?: string;
}) => {
  const buttonVariants = cva(
    'cursor-pointer whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold',
    {
      variants: {
        variant: {
          primary: `border border-solid border-[${colors.accent}] bg-[${colors.accent}] text-[${colors.accentForeground}]`,
          secondary: `border border-solid border-[${colors.border}] bg-[${colors.background}] text-[${colors.foreground}]`,
        },
      },
    },
  );

  return (
    <ReactEmailButton href={href} className={buttonVariants({ variant, className })}>
      {children}
    </ReactEmailButton>
  );
};

interface EmailLayoutProps {
  preview: string;
  children: React.ReactNode;
  t?: TranslationFunction;
  /** Ends the message with "Best regards". Off for messages that are not a letter. */
  signOff?: boolean;
  /** Small print below the message, for example why the user gets it. */
  footer?: React.ReactNode;
}

export function EmailLayout({ preview, children, t = fallbackT, signOff = true, footer }: EmailLayoutProps) {
  const { name, emailLogoUrl, website, supportEmail } = identity;

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body className={`bg-[${colors.surface}] font-sans text-[${colors.foreground}]`}>
          <Container
            className={`mx-auto my-8 max-w-xl rounded-xl border border-solid border-[${colors.border}] bg-[${colors.background}] p-6`}
          >
            {emailLogoUrl ? (
              <Img src={emailLogoUrl} alt={name} className="mb-6 h-8" />
            ) : (
              <Text className="mt-0 mb-6 text-lg font-semibold">{name}</Text>
            )}
            {children}
            {signOff && (
              <Text className={`mt-6 mb-0 text-[${colors.foreground}]`}>
                {t`Best regards,`}
                <br />
                {t`The ${name} team`}
              </Text>
            )}
            {(website || supportEmail) && (
              <>
                <Hr className={`mt-6 mb-4 border-[${colors.border}]`} />
                <Section>
                  <Text className={`my-1 text-xs text-[${colors.muted}]`}>
                    {website && (
                      <Link href={website} className={`text-[${colors.muted}] no-underline`}>
                        {name}
                      </Link>
                    )}
                    {website && supportEmail && ' · '}
                    {supportEmail && (
                      <Link
                        href={`mailto:${supportEmail}`}
                        className={`text-[${colors.muted}] no-underline`}
                      >
                        {supportEmail}
                      </Link>
                    )}
                  </Text>
                </Section>
              </>
            )}
          </Container>
          {footer && (
            <Section className="mx-auto max-w-xl px-6">
              <Text className={`my-1 text-xs text-[${colors.muted}]`}>{footer}</Text>
            </Section>
          )}
        </Body>
      </Tailwind>
    </Html>
  );
}

interface EmailHeadingProps {
  children: React.ReactNode;
}

export function EmailHeading({ children }: EmailHeadingProps) {
  return <Heading className="mt-0 mb-4 text-2xl font-semibold">{children}</Heading>;
}

interface EmailLinkProps {
  href: string;
  children: React.ReactNode;
}

export function EmailLink({ href, children }: EmailLinkProps) {
  return (
    <Link href={href} className={`break-all text-[${colors.accent}] underline`}>
      {children}
    </Link>
  );
}

interface InfoSectionProps {
  children: React.ReactNode;
}

export function InfoSection({ children }: InfoSectionProps) {
  return (
    <Section
      className={`my-4 rounded-lg border border-solid border-[${colors.border}] bg-[${colors.surface}] p-4`}
    >
      {children}
    </Section>
  );
}

export { colors as emailColors, Heading, Hr, Link, Section, Text };
