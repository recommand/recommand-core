import {
  Body,
  Button as ReactEmailButton,
  Container,
  Font,
  Head as ReactEmailHead,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Tailwind,
} from "@react-email/components";
import { cva } from "class-variance-authority";
import * as React from "react";
import { fallbackT, type TranslationFunction } from "../../lib/translations";
import {
  STONE,
  DARK_SLATE,
  FILES,
  PROGRESS,
  SHADOW,
  SHEET,
  SHEET_LIGHT,
  SLATE,
} from "../../lib/config/colors";

export const baseUrl = "https://app.recommand.eu";
const websiteUrl = "https://recommand.eu";

export const Head = () => (
  <ReactEmailHead>
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <Font
      fontFamily="Rethink Sans"
      fontWeight={400}
      fontStyle="normal"
      fallbackFontFamily="sans-serif"
    />
  </ReactEmailHead>
);

export const Button = ({
  children,
  variant = "primary",
  href,
}: {
  children: React.ReactNode;
  href: string;
  variant?: "primary" | "secondary";
}) => {
  const buttonVariants = cva(
    "cursor-pointer whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium",
    {
      variants: {
        variant: {
          primary: `bg-[${SLATE}] text-[${SHEET}]`,
          secondary: `bg-[${FILES}] text-[${DARK_SLATE}]`,
        },
      },
    }
  );

  return (
    <ReactEmailButton href={href} className={buttonVariants({ variant })}>
      {children}
    </ReactEmailButton>
  );
};

interface EmailLayoutProps {
  preview: string;
  children: React.ReactNode;
  t?: TranslationFunction;
}

export function EmailLayout({ preview, children, t = fallbackT }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body className={`font-sans text-[${DARK_SLATE}]`}>
          <Container
            className={`mx-auto my-8 max-w-xl border bg-[${SHEET}] p-6 border-[${SHADOW}] border-solid rounded-xl`}
          >
            <Img
              src={`${baseUrl}/icon.png`}
              alt="Recommand Logo"
              className="mx-auto mb-6 w-12"
            />
            {children}
            <Text className={`text-[${DARK_SLATE}] mt-6 mb-0`}>
              {t`Best regards,`}
              <br />
              {t`The Recommand Team`}
            </Text>
            <Hr className={`mt-6 mb-4 border-[${SHADOW}]`} />
            <Section className="text-center">
              <Text className={`text-xs text-[${STONE}] my-1`}>
                <Link
                  href={websiteUrl}
                  className={`text-[${STONE}] no-underline`}
                >
                  Recommand
                </Link>
                {" · "}
                <Link
                  href="mailto:support@recommand.eu"
                  className={`text-[${STONE}] no-underline`}
                >
                  support@recommand.eu
                </Link>
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

interface EmailHeadingProps {
  children: React.ReactNode;
}

export function EmailHeading({ children }: EmailHeadingProps) {
  return (
    <Heading className="mb-4 mt-0 text-2xl font-semibold">{children}</Heading>
  );
}

interface EmailLinkProps {
  href: string;
  children: React.ReactNode;
}

export function EmailLink({ href, children }: EmailLinkProps) {
  return (
    <Link href={href} className={`break-all text-[${PROGRESS}]`}>
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
      className={`my-4 p-4 rounded-lg border border-solid bg-[${SHEET_LIGHT}] border-[${SHADOW}]`}
    >
      {children}
    </Section>
  );
}

export { Heading, Hr, Link, Section, Text };
