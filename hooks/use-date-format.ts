import { useTranslation } from "@core/hooks/use-translation";

/** Formats timestamps the same way across the dashboard: a medium date and a short time, in the user's language. */
export const useDateFormat = () => {
  const { language } = useTranslation();

  const formatDateTime = (value: Date | string) =>
    new Date(value).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" });

  return { formatDateTime };
};
