import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { PasswordInput } from "../../../components/form/password-input";
import { type FormEvent, useState } from "react";
import { toast } from "../../../components/ui/sonner";
import { cn } from "../../../lib/utils";
import { useUserStore } from "../../../lib/user-store";
import { rc } from "@recommand/lib/client";
import type { Auth } from "api/auth";
import { stringifyActionFailure } from "@recommand/lib/utils";
import { useTranslation } from "@core/hooks/use-translation";
import { Checkbox } from "../../../components/ui/checkbox";
import { useLegalDocuments } from "@core/hooks/use-legal-documents";
import { useUIConfig } from "../../../lib/ui-config-store";

const client = rc<Auth>("core");

export default function SignupForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignupComplete, setIsSignupComplete] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const { signup } = useUserStore();
  const { t } = useTranslation();
  const logoSrc = useUIConfig("auth.logo-src", "/logo.svg");
  const logoClassName = useUIConfig("auth.logo-class", "h-12 w-auto");
  const containerClassName = useUIConfig("auth.container-class", "flex flex-col gap-6");
  const {
    hasLegalDocuments,
    hasTermsOfUse,
    hasPrivacyPolicy,
    termsOfUseUrls,
    privacyPolicyUrls,
  } = useLegalDocuments();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (hasLegalDocuments && !acceptedTerms) {
      toast.error(t`You must accept the terms to continue`);
      return;
    }
    try {
      const response = await signup(email, password);
      if (response?.success) {
        setIsSignupComplete(true);
        toast.success(t`Account created successfully!`, {
          description:
            response.message ||
            t`Please check your email to confirm your account.`,
        });
      }
    } catch (error) {
      toast.error(t`Signup failed`, {
        description:
          error instanceof Error
            ? error.message
            : t`An unexpected error occurred`,
      });
    }
  };

  const handleResendConfirmation = async () => {
    setIsResending(true);
    try {
      const res = await client.auth["resend-confirmation"].$post({
        json: { email },
      });
      const data = await res.json();

      if (data.success) {
        toast.success(t`Confirmation email sent!`, {
          description: data.message,
        });
      } else {
        toast.error(t`Failed to resend confirmation`, {
          description: stringifyActionFailure(data.errors),
        });
      }
    } catch (error) {
      toast.error(t`Failed to resend confirmation`, {
        description:
          error instanceof Error
            ? error.message
            : t`An unexpected error occurred`,
      });
    } finally {
      setIsResending(false);
    }
  };

  if (isSignupComplete) {
    return (
      <div className={cn(containerClassName, className)} {...props}>
        <div className="flex justify-center mb-4">
          <img
            src={logoSrc}
            alt="Logo"
            className={logoClassName}
          />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{t`Check your email`}</CardTitle>
            <CardDescription>
              {t`We've sent a confirmation link to`} <strong>{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t`Please check your email and click the confirmation link to activate your account.`}
            </p>
            <div className="flex flex-col space-y-2">
              <Button
                onClick={handleResendConfirmation}
                disabled={isResending}
                variant="outline"
                className="w-full"
              >
                {isResending ? t`Sending...` : t`Resend confirmation email`}
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              {t`Already have an account?`}{" "}
              <a href="/login" className="underline underline-offset-4">
                {t`Login`}
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn(containerClassName, className)} {...props}>
      <div className="flex justify-center mb-4">
        <img
          src={logoSrc}
          alt="Logo"
          className={logoClassName}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{t`Sign up`}</CardTitle>
          <CardDescription>
            {t`Enter your email below to create your account`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">{t`Email`}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  tabIndex={1}
                  value={email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setEmail(e.target.value)
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">{t`Password`}</Label>
                <PasswordInput
                  name="password"
                  required
                  tabIndex={2}
                  value={password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setPassword(e.target.value)
                  }
                />
              </div>
              {hasLegalDocuments && (
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="terms"
                    checked={acceptedTerms}
                    onCheckedChange={(checked) =>
                      setAcceptedTerms(checked === true)
                    }
                  />
                  <label
                    htmlFor="terms"
                    className="text-sm font-normal leading-snug cursor-pointer"
                  >
                    {t`I agree to the`}{" "}
                    {hasTermsOfUse && (
                      <a
                        href={termsOfUseUrls[0]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-4 hover:text-primary"
                      >
                        {t`Terms of Use`}
                      </a>
                    )}
                    {hasTermsOfUse && hasPrivacyPolicy && ` ${t`and`} `}
                    {hasPrivacyPolicy && (
                      <a
                        href={privacyPolicyUrls[0]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-4 hover:text-primary"
                      >
                        {t`Privacy Policy`}
                      </a>
                    )}
                  </label>
                </div>
              )}
              <Button
                type="submit"
                className="w-full"
                tabIndex={3}
                disabled={hasLegalDocuments && !acceptedTerms}
              >
                {t`Sign up`}
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              {t`Already have an account?`}{" "}
              <a
                href="/login"
                className="underline underline-offset-4"
                tabIndex={4}
              >
                {t`Login`}
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
