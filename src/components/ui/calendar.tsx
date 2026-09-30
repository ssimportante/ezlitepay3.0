
"use client"

import * as React from "react"
import * as CSS from "csstype"
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react"
import { DayPicker, type CaptionProps as DayPickerCaptionProps, useNavigation, DayPickerSingleProps, DayPickerMultipleProps, DayPickerRangeProps, DateRange, DayClickEventHandler, SelectSingleEventHandler, SelectMultipleEventHandler, SelectRangeEventHandler, Matcher, DayPickerDefaultProps, ModifiersClassNames, StyledElement, InternalModifiersElement } from "react-day-picker"
import { format, getMonth, getYear, setMonth, setYear, addMonths, subMonths } from "date-fns"

import { cn } from "@/lib/utils"
import { buttonVariants, Button } from "@/components/ui/button"


// This complex type is necessary to correctly model the props of react-day-picker,
// which uses a discriminated union based on the `mode` property.
export type CalendarProps = (
  | DayPickerDefaultProps
  | DayPickerSingleProps
  | DayPickerMultipleProps
  | DayPickerRangeProps
) & {
  onSelect?:
    | SelectSingleEventHandler
    | SelectMultipleEventHandler
    | SelectRangeEventHandler
    | ((day: Date | undefined, selectedDay: Date, activeModifiers: object, e: React.MouseEvent) => void);
};


// Custom Caption Component
function CustomCalendarCaption(
  // Props passed by DayPicker's "components.Caption"
  captionProps: DayPickerCaptionProps & {
    // Custom props we pass down from our Calendar wrapper
    fromYear?: number;
    toYear?: number;
  }
) {
  const { displayMonth } = captionProps;
  const { goToMonth, previousMonth, nextMonth } = useNavigation(); // Hook for navigation

  // Fallback if essential props are missing
  if (!displayMonth || typeof goToMonth !== 'function') {
    console.error(
      "[Calendar] CustomCalendarCaption: Essential props 'displayMonth' or 'goToMonth' from useNavigation are missing or invalid.",
      { displayMonthProvided: !!displayMonth, goToMonthType: typeof goToMonth }
    );
    return <div className="flex h-[56px] items-center justify-center p-2 text-destructive">Calendar caption error!</div>;
  }

  const defaultFromYear = getYear(new Date()) - 100;
  const defaultToYear = getYear(new Date()) + 10;

  const currentFromYear = captionProps.fromYear || defaultFromYear;
  const currentToYear = captionProps.toYear || defaultToYear;

  const years = React.useMemo(() => {
    const yrs = [];
    for (let i = currentToYear; i >= currentFromYear; i--) {
      yrs.push({ value: i.toString(), label: i.toString() });
    }
    return yrs;
  }, [currentFromYear, currentToYear]);

  const months = React.useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      value: i.toString(),
      label: format(setMonth(new Date(2000, 0, 1), i), "MMMM"),
    }));
  }, []);

  const handleMonthChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonthIndex = parseInt(event.target.value, 10);
    const currentYear = getYear(displayMonth);
    // Use day 1 of the month to avoid issues with varying month lengths (e.g., going from Mar 31 to Feb)
    const newDate = setMonth(new Date(currentYear, 0, 1), newMonthIndex);
    goToMonth(newDate);
  };

  const handleYearChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newYear = parseInt(event.target.value, 10);
    const currentMonthIndex = getMonth(displayMonth);
    // Use day 1 of the month
    const newDate = setYear(new Date(2000, currentMonthIndex, 1), newYear);
    goToMonth(newDate);
  };

  return (
    <div className="flex flex-col gap-2 px-2 pt-1.5 pb-1 border-b mb-1">
      <div className="flex justify-between items-center h-7">
        <span
          className="text-sm font-medium cursor-pointer hover:text-primary flex items-center gap-1"
          onClick={() => console.log("Month Year label clicked. Current displayMonth:", displayMonth)}
        >
          {format(displayMonth, "MMMM yyyy")}
          <ChevronDown className="h-3 w-3 opacity-70" />
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-6 w-6 rounded-md border-input"
            onClick={() => previousMonth && goToMonth(previousMonth)}
            disabled={!previousMonth}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-6 w-6 rounded-md border-input"
            onClick={() => nextMonth && goToMonth(nextMonth)}
            disabled={!nextMonth}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex justify-start items-center gap-1.5">
        <label htmlFor={`month-select-${captionProps.id}`} className="text-xs text-muted-foreground sr-only">Month:</label>
        <select
          id={`month-select-${captionProps.id}`}
          aria-label="Select month"
          value={getMonth(displayMonth)}
          onChange={handleMonthChange}
          className={cn(
            "appearance-none outline-none",
            "h-7 rounded-md border border-input bg-transparent px-1.5 py-0.5 text-xs shadow-sm",
            "focus:ring-1 focus:ring-ring",
            "cursor-pointer min-w-[5.5rem]"
          )}
        >
          {months.map((month) => (
            <option key={month.value} value={month.value}>
              {month.label}
            </option>
          ))}
        </select>
        <label htmlFor={`year-select-${captionProps.id}`} className="text-xs text-muted-foreground sr-only">Year:</label>
        <select
          id={`year-select-${captionProps.id}`}
          aria-label="Select year"
          value={getYear(displayMonth)}
          onChange={handleYearChange}
          className={cn(
            "appearance-none outline-none",
            "h-7 rounded-md border border-input bg-transparent px-1.5 py-0.5 text-xs shadow-sm",
            "focus:ring-1 focus:ring-ring",
            "cursor-pointer min-w-[4rem]"
          )}
        >
          {years.map((year) => (
            <option key={year.value} value={year.value}>
              {year.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {

  const handleClear = () => {
      // Type guard to ensure we have the correct onSelect for the mode
      if (props.mode === 'range' && props.onSelect) {
        props.onSelect(undefined, new Date(), {}, new MouseEvent('click') as any);
      } else if (props.mode === 'multiple' && props.onSelect) {
        props.onSelect(undefined, new Date(), {}, new MouseEvent('click') as any);
      } else if (props.mode === 'single' && props.onSelect) {
        props.onSelect(undefined, new Date(), {}, new MouseEvent('click') as any);
      } else if (!props.mode && props.onSelect) {
        // This handles 'default' mode
        (props.onSelect as SelectSingleEventHandler)(undefined, new Date(), {}, new MouseEvent('click') as any);
      }
  };
  
  const handleToday = () => {
      const today = new Date();
      // Type guard for single and default modes
      if ((props.mode === 'single' || !props.mode) && props.onSelect) {
         (props.onSelect as SelectSingleEventHandler)(today, today, { today: true, selected: true }, new MouseEvent('click') as any);
      }
      // Note: 'Today' button is not implemented for range or multiple modes in this example.
  };

  const isClearDisabled = () => {
    if (props.mode === 'range') return !props.selected?.from;
    if (props.mode === 'multiple') return !props.selected?.length;
    if (props.mode === 'single' || !props.mode) return !props.selected;
    return true;
  };

  const footer = (
    <div className="flex justify-end gap-2 px-2 pb-2 pt-1.5 border-t border-border">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-xs h-7 px-2"
        onClick={handleClear}
        disabled={isClearDisabled()}
      >
        Clear
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-xs h-7 px-2"
        onClick={handleToday}
      >
        Today
      </Button>
    </div>
  );

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("bg-background rounded-md shadow-lg border w-fit", className)}
      classNames={{
        months: "flex flex-col sm:flex-row sm:space-x-4 sm:space-y-0",
        month: "space-y-1.5 p-1.5 pt-0",
        table: "w-full border-collapse",
        head_row: "flex justify-around mb-1",
        head_cell: "text-muted-foreground rounded-md w-7 font-normal text-[0.7rem]",
        row: "flex w-full mt-0.5 justify-around",
        cell: cn(
          "relative p-0 text-center text-xs focus-within:relative focus-within:z-20",
          "h-7 w-7",
          "[&:has([aria-selected])]:rounded-full",
          "has-[[aria-selected].day-outside]:bg-accent/30",
          "has-[[aria-selected].day-range-end]:rounded-r-full",
          "has-[[aria-selected].day-range-start]:rounded-l-full"
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-7 w-7 p-0 font-normal aria-selected:opacity-100 rounded-full text-xs"
        ),
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground rounded-full",
        day_today: "bg-accent text-accent-foreground rounded-full aria-selected:bg-primary aria-selected:text-primary-foreground",
        day_outside:
          "day-outside text-muted-foreground opacity-40 aria-selected:bg-accent/20 aria-selected:text-muted-foreground aria-selected:opacity-30 rounded-full",
        day_disabled: "text-muted-foreground opacity-40 rounded-full",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground rounded-none",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        Caption: (captionComponentProps) => (
          <CustomCalendarCaption
            {...captionComponentProps} 
            fromYear={'fromYear' in props ? props.fromYear : undefined}
            toYear={'toYear' in props ? props.toYear : undefined}
          />
        ),
        IconLeft: () => null, 
        IconRight: () => null,
      }}
      formatters={{
        formatWeekdayName: (date) => format(date, "EEEEE") 
      }}
      footer={footer}
      {...props as any} 
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
