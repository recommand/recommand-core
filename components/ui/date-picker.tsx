"use client";

import { useState } from "react";
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
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date | undefined>(date);
  const resolvedPlaceholder = placeholder ?? t`Pick a date`;
  const dateFormatter = new Intl.DateTimeFormat(language, {
    dateStyle: "long",
  });

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setMonth(date);
      }}
    >
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
          month={month}
          onMonthChange={setMonth}
          defaultMonth={date}
          autoFocus
          disabled={disabled}
        />
      </PopoverContent>
    </Popover>
  );
}
