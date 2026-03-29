import { useState, useEffect } from "react";
import { Button } from "../../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
import { rc } from "@recommand/lib/client";
import type { Auth } from "api/auth";
import { toast } from "../../../../components/ui/sonner";
import { stringifyActionFailure } from "@recommand/lib/utils";
import { useNavigate } from "react-router-dom";
import { useUserStore } from "../../../../lib/user-store";
import { useTranslation } from "@core/hooks/use-translation";
import { useUIConfig } from "../../../../lib/ui-config-store";

const client = rc<Auth>("core");

interface EmailConfirmationFormProps {
  token: string;
}

export default function EmailConfirmationForm({
  token,
}: EmailConfirmationFormProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { fetchUser } = useUserStore();
  const { t } = useTranslation();
  const logoSrc = useUIConfig("auth.logo-src", "/logo.svg");
  const logoClassName = useUIConfig("auth.logo-class", "h-12 w-auto");
  const containerClassName = useUIConfig("auth.container-class", "flex flex-col gap-6");

  useEffect(() => {
    if (token) {
      confirmEmail();
    }
  }, [token]);

  const confirmEmail = async () => {
    if (!token) {
      setError(t`Invalid confirmation link`);
      return;
    }

    setIsConfirming(true);
    setError(null);

    try {
      const res = await client.auth["confirm-email"].$post({
        json: { token },
      });
      const data = await res.json();

      if (data.success) {
        setIsConfirmed(true);
        // Fetch user data after successful confirmation
        await fetchUser();
        toast.success(t`Email confirmed successfully!`);
        // Redirect to dashboard after a short delay
        setTimeout(() => {
          navigate("/");
        }, 2000);
      } else {
        setError(stringifyActionFailure(data.errors));
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t`An unexpected error occurred`
      );
    } finally {
      setIsConfirming(false);
    }
  };

  if (isConfirming) {
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
          <CardTitle className="text-2xl">{t`Confirming Email`}</CardTitle>
          <CardDescription>
            {t`Please wait while we confirm your email address...`}
          </CardDescription>
        </CardHeader>
      </Card>
      </div>
    );
  }

  if (isConfirmed) {
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
          <CardTitle className="text-2xl">{t`Email Confirmed!`}</CardTitle>
          <CardDescription>
            {t`Your email has been successfully confirmed. You are now logged in and will be redirected to the dashboard.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => navigate("/")} className="w-full">
            {t`Go to Dashboard`}
          </Button>
        </CardContent>
      </Card>
      </div>
    );
  }

  if (error) {
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
          <CardTitle className="text-2xl">{t`Confirmation Failed`}</CardTitle>
          <CardDescription className="text-destructive">
            {error}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t`Your confirmation link may have expired or been used already.`}
          </p>
          <div className="flex flex-col space-y-2">
            <Button
              onClick={() => navigate("/signup")}
              variant="outline"
              className="w-full"
            >
              {t`Create New Account`}
            </Button>
            <Button onClick={() => navigate("/login")} className="w-full">
              {t`Try Logging In`}
            </Button>
          </div>
        </CardContent>
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
        <CardTitle className="text-2xl">{t`Invalid Link`}</CardTitle>
        <CardDescription>
          {t`The confirmation link appears to be invalid or missing.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={() => navigate("/login")} className="w-full">
          {t`Go to Login`}
        </Button>
      </CardContent>
    </Card>
    </div>
  );
}
