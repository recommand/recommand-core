import { useState, useEffect, useCallback } from "react";
import { PageTemplate } from "@core/components/page-template";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@core/components/ui/card";
import { Label } from "@core/components/ui/label";
import { Input } from "@core/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@core/components/ui/select";
import { PasswordInput } from "@core/components/form/password-input";
import { AsyncButton } from "@core/components/async-button";
import { toast } from "@core/components/ui/sonner";
import { useTranslation } from "@core/hooks/use-translation";
import { useUser } from "@core/hooks/user";
import { useUserStore } from "@core/lib/user-store";
import { rc } from "@recommand/lib/client";
import type { Languages } from "@core/api/languages";
import type { Account } from "@core/api/account";
import { stringifyActionFailure } from "@recommand/lib/utils";

const languagesClient = rc<Languages>("core");
const accountClient = rc<Account>("core");

type Language = { code: string; name: string };

export default function AccountPage() {
  const { t } = useTranslation();
  const user = useUser();
  const fetchUser = useUserStore((state) => state.fetchUser);

  const [languages, setLanguages] = useState<Language[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState(user?.language ?? "en");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const fetchLanguages = useCallback(async () => {
    try {
      const res = await languagesClient.languages.$get();
      const data = await res.json();
      if (data.success) {
        setLanguages(data.languages);
      }
    } catch {
      console.error("Failed to load languages");
    }
  }, []);

  useEffect(() => {
    fetchLanguages();
  }, [fetchLanguages]);

  useEffect(() => {
    if (user?.language) {
      setSelectedLanguage(user.language);
    }
  }, [user?.language]);

  const handleSaveProfile = async () => {
    try {
      const res = await accountClient.account.profile.$put({
        json: { language: selectedLanguage },
      });
      const data = await res.json();
      if (data.success) {
        await fetchUser();
        toast.success(t`Profile updated`);
      } else {
        toast.error(stringifyActionFailure(data.errors));
      }
    } catch {
      toast.error(t`Failed to update profile`);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error(t`Passwords do not match`);
      return;
    }
    if (newPassword.length < 8) {
      toast.error(t`Password must be at least 8 characters`);
      return;
    }

    try {
      const res = await accountClient.account.password.$put({
        json: { currentPassword, newPassword },
      });
      const data = await res.json();
      if (data.success) {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        toast.success(t`Password changed successfully`);
      } else {
        toast.error(stringifyActionFailure(data.errors));
      }
    } catch {
      toast.error(t`Failed to change password`);
    }
  };

  return (
    <PageTemplate
      breadcrumbs={[
        { label: t`Dashboard`, href: "/" },
        { label: t`Account` },
      ]}
      description={t`Manage your account settings`}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t`Profile`}</CardTitle>
            <CardDescription>{t`Your personal information`}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="email">{t`Email`}</Label>
              <Input
                id="email"
                type="email"
                value={user?.email ?? ""}
                disabled
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="language">{t`Language`}</Label>
              <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t`Select a language`} />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <AsyncButton onClick={handleSaveProfile} disabled={selectedLanguage === user?.language}>
              {t`Save`}
            </AsyncButton>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t`Change password`}</CardTitle>
            <CardDescription>{t`Update your password`}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="currentPassword">{t`Current password`}</Label>
              <PasswordInput
                name="currentPassword"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="newPassword">{t`New password`}</Label>
              <PasswordInput
                name="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">{t`Confirm new password`}</Label>
              <PasswordInput
                name="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <AsyncButton
              onClick={handleChangePassword}
              disabled={!currentPassword || !newPassword || !confirmPassword}
            >
              {t`Change password`}
            </AsyncButton>
          </CardContent>
        </Card>
      </div>
    </PageTemplate>
  );
}
