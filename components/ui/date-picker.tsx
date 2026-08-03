"use client";

import { Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@core/lib/utils";
import { Button } from "@core/components/ui/button";
import { Calendar } from "@core/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@core/components/ui/popover";
import { useTranslation } from "@core/hooks/use-translation";

interface DatePickerProps {
  date?: Date;
  onDateChange?: (date: Date | undefined) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function DatePicker({
  date,
  onDateChange,
  disabled = false,
  placeholder,
}: DatePickerProps) {
  const { t, language } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t`Pick a date`;
  const dateFormatter = new Intl.DateTimeFormat(language, {
    dateStyle: "long",
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground"
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? dateFormatter.format(date) : <span>{resolvedPlaceholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onDateChange}
          autoFocus
          disabled={disabled}
        />
      </PopoverContent>
    </Popover>
  );
}
