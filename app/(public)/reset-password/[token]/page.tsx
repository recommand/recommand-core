import ResetPasswordForm from "./reset-password-form";
import { useParams } from "react-router-dom";
import { useTranslation } from "@core/hooks/use-translation";

interface ResetPasswordPageProps {
  params: {
    token: string;
  };
}

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const { token } = useParams();
  if (!token) {
    return <div>{t`Invalid token`}</div>;
  }
  return (
    <main className="flex min-h-svh w-full items-center justify-center">
      <ResetPasswordForm token={token} />
    </main>
  );
}
