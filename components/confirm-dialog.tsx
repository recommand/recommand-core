import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@core/components/ui/alert-dialog";
import type { ReactNode } from "react";
import { useTranslation } from "@core/hooks/use-translation";

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmButtonText: string;
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
  trigger: ReactNode;
  variant?: "default" | "destructive";
  cancelButtonText?: string;
}

export function ConfirmDialog({
  title,
  description,
  confirmButtonText,
  onConfirm,
  isLoading = false,
  trigger,
  variant = "destructive",
  cancelButtonText,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  const handleConfirm = async () => {
    await onConfirm();
    setOpen(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isLoading) {
      setOpen(newOpen);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>
            {cancelButtonText ?? t`Cancel`}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={
              variant === "destructive"
                ? "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40"
                : undefined
            }
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {confirmButtonText}...
              </>
            ) : (
              confirmButtonText
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
