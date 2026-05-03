"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateTimePickerProps {
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
  /**
   * Earliest selectable date; defaults to today (no past deadlines).
   */
  fromDate?: Date;
  placeholder?: string;
  id?: string;
  className?: string;
}

/**
 * Date + time picker built on shadcn Calendar + Popover.
 *
 * Behaviour:
 * - Trigger is a full-width button with a visible calendar icon and the
 *   currently-selected datetime (or placeholder), so there's no "hidden
 *   click area" like the native datetime-local input.
 * - Picking a date in the calendar **closes the popover immediately**; the
 *   time input below it stays accessible via re-opening or by tabbing into
 *   the embedded time field.
 * - Time defaults to 23:59 of the picked day so deadlines feel "end of day"
 *   unless the user explicitly narrows them.
 */
export function DateTimePicker({
  value,
  onChange,
  fromDate,
  placeholder = "Pick a date",
  id,
  className,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);

  // The HTML time input expects HH:mm; mirror it from `value` so opening a
  // pre-filled picker shows the right time.
  const timeString = React.useMemo(() => {
    if (!value) return "23:59";
    return format(value, "HH:mm");
  }, [value]);

  function handleSelect(day: Date | undefined) {
    if (!day) {
      onChange(undefined);
      return;
    }
    const [hh, mm] = timeString.split(":").map((n) => parseInt(n, 10));
    const next = new Date(day);
    next.setHours(
      Number.isFinite(hh) ? hh : 23,
      Number.isFinite(mm) ? mm : 59,
      0,
      0,
    );
    onChange(next);
    // Close popover immediately on selection so the user gets a confirmation
    // beat. The time can still be tweaked by re-opening.
    setOpen(false);
  }

  function handleTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value; // "HH:mm"
    const [hh, mm] = raw.split(":").map((n) => parseInt(n, 10));
    const base = value ?? new Date();
    const next = new Date(base);
    next.setHours(
      Number.isFinite(hh) ? hh : 0,
      Number.isFinite(mm) ? mm : 0,
      0,
      0,
    );
    onChange(next);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start gap-2 text-left font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 opacity-70" />
          {value ? (
            <span>{format(value, "PPP 'at' p")}</span>
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={handleSelect}
          disabled={
            fromDate
              ? { before: fromDate }
              : { before: new Date(new Date().setHours(0, 0, 0, 0)) }
          }
          autoFocus
        />
        <div className="border-t p-3">
          <label
            htmlFor={`${id ?? "datetime"}-time`}
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Time
          </label>
          <Input
            id={`${id ?? "datetime"}-time`}
            type="time"
            value={timeString}
            onChange={handleTimeChange}
            className="w-full"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
