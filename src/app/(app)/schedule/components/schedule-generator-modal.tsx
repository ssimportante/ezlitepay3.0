
"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, parseISO, isValid as isValidDate } from "date-fns"; // Added parseISO and isValidDate

type GenerationScope = "weekly" | "monthly";

export interface DayOfWeekSelection {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
}

export interface ScheduleGeneratorFormValues {
  generationScope: GenerationScope;
  startDate: string; // yyyy-MM-dd string
  selectedEmployeeIds: string[];
  daysToInclude: DayOfWeekSelection;
  defaultShift: {
    timeIn: string; // HH:mm
    timeOut: string; // HH:mm
    lunchStart: string; // HH:mm
    lunchEnd: string; // HH:mm
  };
  overwrite: boolean;
  notes: string;
}

interface ScheduleGeneratorModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerateSchedules: (values: ScheduleGeneratorFormValues) => void;
  employees: { id: string; name: string }[];
}

const initialFormValues: ScheduleGeneratorFormValues = {
  generationScope: "weekly",
  startDate: format(new Date(), "yyyy-MM-dd"), // Stays as string
  selectedEmployeeIds: ["all"],
  daysToInclude: {
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: false,
    sunday: false,
  },
  defaultShift: {
    timeIn: "09:00",
    timeOut: "19:00",
    lunchStart: "12:00",
    lunchEnd: "13:00",
  },
  overwrite: false,
  notes: "",
};

const daysOfWeekMap: { key: keyof DayOfWeekSelection; label: string }[] = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

export function ScheduleGeneratorModal({ isOpen, onOpenChange, onGenerateSchedules, employees }: ScheduleGeneratorModalProps) {
  const [formValues, setFormValues] = useState<ScheduleGeneratorFormValues>(initialFormValues);
  const [isAllEmployeesSelected, setIsAllEmployeesSelected] = useState(initialFormValues.selectedEmployeeIds.includes("all"));

  useEffect(() => {
    if (isOpen) {
      const newInitialStartDate = format(new Date(), "yyyy-MM-dd");
      setFormValues({
        ...initialFormValues,
        startDate: newInitialStartDate, // Ensure startDate is current on open
        selectedEmployeeIds: ["all"], // Default to "all" selected
      });
      setIsAllEmployeesSelected(true); // Sync checkbox state
    }
  }, [isOpen]);

  const handleEmployeeSelectionChange = (employeeId: string) => {
    setFormValues(prev => {
      let newSelectedIds: string[];
      if (employeeId === "all") {
        newSelectedIds = prev.selectedEmployeeIds.includes("all") ? [] : ["all"];
        setIsAllEmployeesSelected(newSelectedIds.includes("all"));
      } else {
        const currentSelected = prev.selectedEmployeeIds.filter(id => id !== "all");
        if (currentSelected.includes(employeeId)) {
          newSelectedIds = currentSelected.filter(id => id !== employeeId);
        } else {
          newSelectedIds = [...currentSelected, employeeId];
        }
        // Determine if "all" should be re-selected or de-selected
        if (newSelectedIds.length === employees.length && employees.length > 0) {
            newSelectedIds = ["all"];
            setIsAllEmployeesSelected(true);
        } else {
            setIsAllEmployeesSelected(false);
        }
      }
      return { ...prev, selectedEmployeeIds: newSelectedIds.length > 0 ? newSelectedIds : [] }; // Ensure it's never empty if meant to be empty
    });
  };

  const handleAllEmployeesCheckboxChange = (checked: boolean | string ) => {
    const isChecked = checked === true || checked === 'indeterminate';
    setIsAllEmployeesSelected(isChecked);
    setFormValues(prev => ({
      ...prev,
      selectedEmployeeIds: isChecked ? ["all"] : []
    }));
  };


  const handleDayOfWeekChange = (dayKey: keyof DayOfWeekSelection, checked: boolean | string) => {
    setFormValues(prev => ({
      ...prev,
      daysToInclude: { ...prev.daysToInclude, [dayKey]: Boolean(checked) },
    }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (name.startsWith("defaultShift.")) {
      const field = name.split(".")[1];
      setFormValues(prev => ({
        ...prev,
        defaultShift: { ...prev.defaultShift, [field]: value },
      }));
    } else if (type === "checkbox" && name === "overwrite") {
        setFormValues(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    }
    else {
      setFormValues(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = () => {
    if (formValues.selectedEmployeeIds.length === 0 && !isAllEmployeesSelected) { // Check if explicitly empty and "all" is not selected
        alert("Please select at least one employee or 'All Active Employees'.");
        return;
    }
    // Ensure startDate is a valid "yyyy-MM-dd" string before passing to onGenerateSchedules
    const startDateObj = parseISO(formValues.startDate);
    if (!isValidDate(startDateObj)) {
      alert("Invalid start date format. Please use YYYY-MM-DD.");
      return;
    }
    
    const finalSelectedIds = isAllEmployeesSelected ? ["all"] : formValues.selectedEmployeeIds.filter(id => id !== "all");


    onGenerateSchedules({
        ...formValues,
        selectedEmployeeIds: finalSelectedIds.length > 0 ? finalSelectedIds : (isAllEmployeesSelected ? ["all"] : []),
        startDate: format(startDateObj, "yyyy-MM-dd") // Pass as string
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generate Bulk Schedules</DialogTitle>
          <DialogDescription>
            Set parameters to generate schedules for multiple employees over a period.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] p-1">
        <div className="grid gap-6 py-4 pr-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="generationScope">Generation Scope</Label>
              <RadioGroup
                id="generationScope"
                name="generationScope"
                value={formValues.generationScope}
                onValueChange={(value) => setFormValues(prev => ({ ...prev, generationScope: value as GenerationScope }))}
                className="flex space-x-4 mt-1"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="weekly" id="weekly" />
                  <Label htmlFor="weekly">Weekly</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="monthly" id="monthly" />
                  <Label htmlFor="monthly">Monthly</Label>
                </div>
              </RadioGroup>
            </div>
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                name="startDate"
                type="date"
                value={formValues.startDate} // Expects "yyyy-MM-dd" string
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div>
            <Label>Employees</Label>
            <div className="mt-1 p-3 border rounded-md max-h-48 overflow-y-auto space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="all-employees"
                  checked={isAllEmployeesSelected}
                  onCheckedChange={handleAllEmployeesCheckboxChange}
                />
                <Label htmlFor="all-employees" className="font-medium">All Active Employees</Label>
              </div>
              {!isAllEmployeesSelected && employees.map(emp => (
                <div key={emp.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`employee-${emp.id}`}
                    checked={formValues.selectedEmployeeIds.includes(emp.id)}
                    onCheckedChange={(checked) => handleEmployeeSelectionChange(emp.id)}
                  />
                  <Label htmlFor={`employee-${emp.id}`}>{emp.name}</Label>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label>Days to Include in Schedule</Label>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2 mt-1 border p-3 rounded-md">
              {daysOfWeekMap.map(day => (
                <div key={day.key} className="flex items-center space-x-2">
                  <Checkbox
                    id={day.key}
                    checked={formValues.daysToInclude[day.key]}
                    onCheckedChange={(checked) => handleDayOfWeekChange(day.key, checked)}
                  />
                  <Label htmlFor={day.key}>{day.label}</Label>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label>Default Shift Times</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-1 border p-3 rounded-md">
              <div>
                <Label htmlFor="defaultShift.timeIn" className="text-xs">Time In</Label>
                <Input id="defaultShift.timeIn" name="defaultShift.timeIn" type="time" value={formValues.defaultShift.timeIn} onChange={handleInputChange} />
              </div>
              <div>
                <Label htmlFor="defaultShift.timeOut" className="text-xs">Time Out</Label>
                <Input id="defaultShift.timeOut" name="defaultShift.timeOut" type="time" value={formValues.defaultShift.timeOut} onChange={handleInputChange} />
              </div>
              <div>
                <Label htmlFor="defaultShift.lunchStart" className="text-xs">Lunch Start</Label>
                <Input id="defaultShift.lunchStart" name="defaultShift.lunchStart" type="time" value={formValues.defaultShift.lunchStart} onChange={handleInputChange} />
              </div>
              <div>
                <Label htmlFor="defaultShift.lunchEnd" className="text-xs">Lunch End</Label>
                <Input id="defaultShift.lunchEnd" name="defaultShift.lunchEnd" type="time" value={formValues.defaultShift.lunchEnd} onChange={handleInputChange} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <div>
              <Label htmlFor="notes">Default Notes (Optional)</Label>
              <Input id="notes" name="notes" value={formValues.notes} onChange={handleInputChange} placeholder="e.g., Standard Shift" />
            </div>
            <div className="flex items-center space-x-2 pt-5">
              <Checkbox id="overwrite" name="overwrite" checked={formValues.overwrite} onCheckedChange={(checked) => setFormValues(prev => ({ ...prev, overwrite: Boolean(checked) }))} />
              <Label htmlFor="overwrite">Overwrite existing schedules in period</Label>
            </div>
          </div>
        </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} className="bg-primary hover:bg-primary/90">Generate Schedules</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


