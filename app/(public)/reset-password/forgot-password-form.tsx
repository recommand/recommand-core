import { useState } from "react";
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
import { rc } from "@recommand/lib/client";
import type { Auth } from "api/auth";
import { toast } from "../../../components/ui/sonner";
import { stringifyActionFailure } from "@recommand/lib/utils";
import { useTranslation } from "@core/hooks/use-translation";
import { useUIConfig } from "../../../lib/ui-config-store";

const client = rc<Auth>("core");

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { t } = useTranslation();
  const logoSrc = useUIConfig("auth.logo-src", "/logo.svg");
  const logoClassName = useUIConfig("auth.logo-class", "h-12 w-auto");
  const containerClassName = useUIConfig("auth.container-class", "flex flex-col gap-6");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await client.auth["request-password-reset"].$post({
        json: { email },
      });
      const data = await res.json();

      if (data.success) {
        setIsSubmitted(true);
      } else {
        toast.error(t`Failed to send reset link`, {
          description: stringifyActionFailure(data.errors),
        });
      }
    } catch (err) {
      toast.error(t`Failed to send reset link`, {
        description:
          err instanceof Error ? err.message : t`An unexpected error occurred`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex justify-center mb-4">
          <img
            src="/logo.svg"
            alt="Logo"
            className="h-12 w-auto"
          />
        </div>
        <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">{t`Reset link sent`}</CardTitle>
          <CardDescription>
            {t`A password reset link has been sent to your email address. Please check your inbox and follow the instructions to reset your password.`}
          </CardDescription>
        </CardHeader>
      </Card>
      </div>
    );
  }

  return (
    <div className={containerClassName}>
      <div className="flex justify-center mb-4">
        <img
          src={logoSrc}
          alt="Logo"
          className={logoClassName}
        />
      </div>
      <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">{t`Forgot password`}</CardTitle>
        <CardDescription>
          {t`Enter your email address below and we'll send you a link to reset your password.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">{t`Email`}</Label>
            <Input
              id="email"
              type="email"
              placeholder="m@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t`Sending...` : t`Send reset link`}
          </Button>
        </form>
      </CardContent>
    </Card>
    </div>
  );
}
