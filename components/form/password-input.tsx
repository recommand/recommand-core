import type { InputHTMLAttributes } from "react";
import { useState } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { useTranslation } from "@core/hooks/use-translation";

interface PasswordInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  className?: string;
}

export function PasswordInput({
  name,
  placeholder,
  required,
  className,
  onChange,
  ...props
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const { t } = useTranslation();

  return (
    <div className="relative">
      <Input
        {...props}
        id={name}
        name={name}
        type={showPassword ? "text" : "password"}
        placeholder={placeholder}
        required={required}
        onChange={onChange}
        className={cn("pr-10", className)}
        aria-label={placeholder ?? t`Password input`}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
        onClick={() => setShowPassword(!showPassword)}
        aria-label={showPassword ? t`Hide password` : t`Show password`}
      >
        {showPassword ? (
          <EyeOffIcon className="h-4 w-4" />
        ) : (
          <EyeIcon className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
