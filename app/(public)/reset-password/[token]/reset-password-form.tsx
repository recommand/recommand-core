import { useState } from "react";
import { Button } from "../../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
import { PasswordInput } from "../../../../components/form/password-input";
import { Label } from "../../../../components/ui/label";
import { rc } from "@recommand/lib/client";
import type { Auth } from "api/auth";
import { toast } from "../../../../components/ui/sonner";
import { stringifyActionFailure } from "@recommand/lib/utils";
import { useTranslation } from "@core/hooks/use-translation";
import { useUIConfig } from "../../../../lib/ui-config-store";

const client = rc<Auth>("core");

interface ResetPasswordFormProps {
  token: string;
}

export default function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { t } = useTranslation();
  const logoSrc = useUIConfig("auth.logo-src", "/logo.svg");
  const logoClassName = useUIConfig("auth.logo-class", "h-12 w-auto");
  const containerClassName = useUIConfig("auth.container-class", "flex flex-col gap-6");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    if (password !== confirmPassword) {
      toast.error(t`Passwords do not match`);
      setIsSubmitting(false);
      return;
    }

    if (password.length < 8) {
      toast.error(t`Password must be at least 8 characters long`);
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await client.auth["reset-password"].$post({
        json: { token, password },
      });
      const data = await res.json();

      if (data.success) {
        toast.success(t`Password reset successfully`);
        // Redirect to login page on success
        window.location.href = "/login";
      } else {
        toast.error(t`Failed to reset password`, {
          description: stringifyActionFailure(data.errors),
        });
      }
    } catch (err) {
      toast.error(t`Failed to reset password`, {
        description:
          err instanceof Error ? err.message : t`An unexpected error occurred`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={containerClassName}>
      <div className="flex justify-center mb-4">
        <img
          src={logoSrc}
          alt="Logo"
          className={logoClassName}
        />
      </div>
      <Card className="mx-auto">
      <CardHeader>
        <CardTitle>{t`Reset password`}</CardTitle>
        <CardDescription>
          {t`Enter a new password for your account.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="password">{t`Password`}</Label>
            <PasswordInput
              id="password"
              placeholder={t`Enter new password`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirmPassword">{t`Confirm Password`}</Label>
            <PasswordInput
              id="confirmPassword"
              placeholder={t`Confirm new password`}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t`Resetting...` : t`Reset Password`}
          </Button>
        </form>
      </CardContent>
    </Card>
    </div>
  );
}
