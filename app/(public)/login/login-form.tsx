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
import { toast } from "../../../components/ui/sonner";
import { type FormEvent, useState } from "react";
import { cn } from "../../../lib/utils";
import { useUserStore } from "../../../lib/user-store";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@core/hooks/use-translation";
import { useUIConfig } from "../../../lib/ui-config-store";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login } = useUserStore();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const logoSrc = useUIConfig("auth.logo-src", "/logo.svg");
  const logoClassName = useUIConfig("auth.logo-class", "h-12 w-auto");
  const containerClassName = useUIConfig("auth.container-class", "flex flex-col gap-6");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate("/");
    } catch (error) {
      toast.error(t`Login failed`, {
        description:
          error instanceof Error
            ? error.message
            : t`An unexpected error occurred`,
      });
    }
  };

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
          <CardTitle className="text-2xl">{t`Login`}</CardTitle>
          <CardDescription>
            {t`Enter your email below to login to your account`}
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
                <div className="flex items-center">
                  <Label htmlFor="password">{t`Password`}</Label>
                  <a
                    href="/reset-password"
                    className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                    tabIndex={5}
                  >
                    {t`Forgot your password?`}
                  </a>
                </div>
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
              <Button type="submit" className="w-full" tabIndex={3}>
                {t`Login`}
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              {t`Don't have an account?`}{" "}
              <a
                href="/signup"
                className="underline underline-offset-4"
                tabIndex={4}
              >
                {t`Sign up`}
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
