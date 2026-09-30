
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Edit, Trash2, XCircle, ChevronLeft, ChevronRight, PlusCircle, CopyPlus, Loader2 } from "lucide-react";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
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
} from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth, isToday, parseISO, addDays, isValid as isValidDateFns, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { getEmployeesService } from "@/lib/firebase/firestore-services/employee-service";
import type { Employee as FullEmployeeType } from "@/app/(app)/employees/components/employee-types";
import {
  addScheduleService,
  getSchedulesService,
  updateScheduleService,
  deleteScheduleService,
  batchProcessSchedules
} from "@/lib/firebase/firestore-services/schedule-service";
import { useAuth } from "@/contexts/auth-context";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScheduleGeneratorModal, type ScheduleGeneratorFormValues, type DayOfWeekSelection } from "./components/schedule-generator-modal";
import type { Schedule } from "@/types/schedule";


export default function SchedulePage() {
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [allEmployees, setAllEmployees] = useState<FullEmployeeType[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeletingSchedules, setIsDeletingSchedules] = useState(false);

  const [dailySelectedDate, setDailySelectedDate] = useState(new Date());
  const [dailyFilterEmployee, setDailyFilterEmployee] = useState("all");
  const [dailySearchNotes, setDailySearchNotes] = useState("");
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<string[]>([]);


  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));

  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [scheduleFormData, setScheduleFormData] = useState<Partial<Schedule>>({
    employeeId: "",
    date: new Date(),
    timeIn: "09:00",
    timeOut: "19:00",
    lunchStart: "12:00",
    lunchEnd: "13:00",
    notes: "",
  });

  const [isGeneratorModalOpen, setIsGeneratorModalOpen] = useState(false);
  const [isDeleteConfirmationModalOpen, setIsDeleteConfirmationModalOpen] = useState(false);
  const [isMoreEmployeesSheetOpen, setIsMoreEmployeesSheetOpen] = useState(false);
  const [selectedDaySchedules, setSelectedDaySchedules] = useState<Schedule[]>([]);


  const activeEmployees = useMemo(() => {
    return allEmployees.filter(emp => {
        const statusLower = emp.status.toLowerCase();
        return statusLower === "active" || statusLower === "on leave";
    });
  }, [allEmployees]);

  const mapEmployeeNamesToSchedules = useCallback((schedulesToMap: Schedule[], employeesList: FullEmployeeType[]): Schedule[] => {
    return schedulesToMap.map(sch => {
      const employee = employeesList.find(emp => emp.employeeId === sch.employeeId);
      return {
        ...sch,
        employeeName: employee ? `${employee.firstName} ${employee.lastName}` : `[ID: ${sch.employeeId}] (Employee Not Found)`
      };
    });
  }, []);

  const loadData = useCallback(async () => {
    if (!user || authLoading) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setSelectedScheduleIds([]);
    console.log(`[SchedulePage] loadData triggered for month: ${format(currentMonth, "yyyy-MM")}`);
    try {
      const [fetchedEmployees, fetchedSchedules] = await Promise.all([
        getEmployeesService(),
        getSchedulesService({ month: currentMonth })
      ]);
      
      setAllEmployees(fetchedEmployees);
      const schedulesWithNames = mapEmployeeNamesToSchedules(fetchedSchedules, fetchedEmployees);
      setSchedules(schedulesWithNames);

      console.log(`[SchedulePage] Successfully fetched and mapped ${fetchedEmployees.length} employees and ${schedulesWithNames.length} schedules.`);
    } catch (error) {
      console.error("Failed to load schedule page data:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load schedule data." });
      setAllEmployees([]);
      setSchedules([]);
    } finally {
      setIsLoading(false);
    }
  }, [user, authLoading, toast, currentMonth, mapEmployeeNamesToSchedules]);

  useEffect(() => {
    loadData();
  }, [loadData]);


  // Reset selected schedules when filters change
  useEffect(() => {
    setSelectedScheduleIds([]);
  }, [dailySelectedDate, dailyFilterEmployee, dailySearchNotes]);


  const filteredDailySchedules = useMemo(() => {
    if (isLoading) return [];
    const formattedDailySelectedDate = format(dailySelectedDate, "yyyy-MM-dd");
    return schedules.filter(sch => {
      if (!sch.date || !isValidDateFns(sch.date)) return false;
      const matchesDate = format(sch.date, "yyyy-MM-dd") === formattedDailySelectedDate;
      const matchesEmployee = dailyFilterEmployee === "all" || sch.employeeId === dailyFilterEmployee;
      const matchesNotes = sch.notes?.toLowerCase().includes(dailySearchNotes.toLowerCase());
      return matchesDate && matchesEmployee && matchesNotes;
    }).sort((a,b) => (a.employeeName || "").localeCompare(b.employeeName || ""));
  }, [schedules, dailySelectedDate, dailyFilterEmployee, dailySearchNotes, isLoading]);

  const daysInMonthView = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const daysArray = eachDayOfInterval({ start, end });
    let prefixDaysCount = getDay(start);
    if (prefixDaysCount === 0) prefixDaysCount = 0; 
    const prefixDays = Array(prefixDaysCount).fill(null);
    return [...prefixDays, ...daysArray];
  }, [currentMonth]);


  const handleEditSchedule = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    let dateForForm: Date = new Date();
    if (schedule.date) {
        if (schedule.date instanceof Date && isValidDateFns(schedule.date)) {
            dateForForm = schedule.date;
        } else if (typeof schedule.date === 'string') {
            const parsed = parseISO(schedule.date);
            if (isValidDateFns(parsed)) dateForForm = parsed;
        }
    }
    setScheduleFormData({
      ...schedule,
      date: dateForForm,
    });
    setIsScheduleModalOpen(true);
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    setIsDeletingSchedules(true);
    try {
      await deleteScheduleService(scheduleId);
      toast({ title: "Schedule Deleted", description: "The schedule has been removed.", variant: "destructive"});
      await loadData();
    } catch (error) {
      console.error("Error deleting schedule:", error);
      toast({ variant: "destructive", title: "Delete Error", description: "Could not delete schedule." });
    } finally {
      setIsDeletingSchedules(false);
    }
  };

  const handleDeleteSelectedSchedules = async () => {
    if (selectedScheduleIds.length === 0) {
      toast({ variant: "default", title: "No Schedules Selected", description: "Please select schedules to delete." });
      setIsDeleteConfirmationModalOpen(false);
      return;
    }
    setIsDeletingSchedules(true);
    try {
      const deletePromises = selectedScheduleIds.map(id => deleteScheduleService(id));
      await Promise.all(deletePromises);
      toast({ title: "Schedules Deleted", description: `Successfully deleted ${selectedScheduleIds.length} selected schedules.` });
      setSelectedScheduleIds([]); // Clear selection
      await loadData();
    } catch (error) {
      console.error("Error deleting selected schedules:", error);
      toast({ variant: "destructive", title: "Deletion Error", description: "Could not delete all selected schedules." });
    } finally {
      setIsDeletingSchedules(false);
      setIsDeleteConfirmationModalOpen(false);
    }
  };

  const handleOpenCreateModal = (scheduleInitData?: Partial<Schedule> & { date?: Date | string }) => {
    setEditingSchedule(null);
    let initialDate = new Date();
    if (scheduleInitData?.date) {
        if (scheduleInitData.date instanceof Date && isValidDateFns(scheduleInitData.date)) {
            initialDate = scheduleInitData.date;
        } else if (typeof scheduleInitData.date === 'string') {
            let parsed = parseISO(scheduleInitData.date);
            if (!isValidDateFns(parsed)) {
                const parts = scheduleInitData.date.split('-');
                if(parts.length === 3){
                    const y = parseInt(parts[0]), m = parseInt(parts[1]) - 1, d = parseInt(parts[2]);
                    parsed = new Date(y,m,d);
                }
            }
            if (isValidDateFns(parsed)) initialDate = parsed;
        }
    }

    const defaultEmployeeId = scheduleInitData?.employeeId || (activeEmployees.length > 0 ? activeEmployees[0].employeeId : "");

    setScheduleFormData({
      employeeId: defaultEmployeeId,
      date: initialDate,
      timeIn: scheduleInitData?.timeIn || "09:00",
      timeOut: scheduleInitData?.timeOut || "19:00",
      lunchStart: scheduleInitData?.lunchStart || "12:00",
      lunchEnd: scheduleInitData?.lunchEnd || "13:00",
      notes: scheduleInitData?.notes || "",
    });
    setIsScheduleModalOpen(true);
  };

  const handleScheduleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setScheduleFormData(prev => {
        if (name === "date") {
            const parsedDate = parseISO(value);
            return { ...prev, [name]: isValidDateFns(parsedDate) ? parsedDate : prev.date };
        }
        return { ...prev, [name]: value };
    });
  };

  const handleSaveSchedule = async () => {
    if (!scheduleFormData.employeeId || !scheduleFormData.date || !scheduleFormData.timeIn || !scheduleFormData.timeOut || !scheduleFormData.lunchStart || !scheduleFormData.lunchEnd) {
        toast({variant: "destructive", title: "Missing fields", description: "All schedule fields (Employee, Date, Times) are required."});
        return;
    }

    if (!(scheduleFormData.date instanceof Date) || !isValidDateFns(scheduleFormData.date)) {
        toast({variant: "destructive", title: "Invalid Date", description: "The schedule date is invalid."});
        return;
    }
    setIsLoading(true);
    const dataToSaveForService: Omit<Schedule, "id" | "employeeName"> = {
      employeeId: scheduleFormData.employeeId!,
      date: scheduleFormData.date,
      timeIn: scheduleFormData.timeIn!,
      timeOut: scheduleFormData.timeOut!,
      lunchStart: scheduleFormData.lunchStart!,
      lunchEnd: scheduleFormData.lunchEnd!,
      notes: scheduleFormData.notes || "",
    };

    try {
      if (editingSchedule) {
          await updateScheduleService(editingSchedule.id, dataToSaveForService);
          toast({ title: "Schedule Updated", description: "The schedule has been updated." });
      } else {
          await addScheduleService(dataToSaveForService);
          toast({ title: "Schedule Created", description: "A new schedule has been added." });
      }
      setIsScheduleModalOpen(false);
      setEditingSchedule(null);
      await loadData();
    } catch (error: any) {
       console.error("Error saving schedule:", error);
       toast({ variant: "destructive", title: "Save Error", description: error.message || "Could not save schedule." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateSchedules = async (values: ScheduleGeneratorFormValues) => {
    const { generationScope, startDate, selectedEmployeeIds, daysToInclude, defaultShift, overwrite, notes } = values;
    setIsLoading(true);
    const targetEmployees = selectedEmployeeIds.includes("all")
        ? activeEmployees
        : activeEmployees.filter(emp => selectedEmployeeIds.includes(emp.employeeId));

    if (targetEmployees.length === 0) {
        toast({variant: "destructive", title: "No Active Employees", description: "No active employees selected or available for schedule generation."});
        setIsLoading(false);
        return;
    }

    const periodStartDate = parseISO(startDate);
    if (!isValidDateFns(periodStartDate)) {
      toast({variant: "destructive", title: "Invalid Start Date", description: "Generator start date is invalid."});
      setIsLoading(false);
      return;
    }
    let periodEndDate: Date;

    if (generationScope === "weekly") {
      periodEndDate = addDays(periodStartDate, 6);
    } else {
      periodEndDate = endOfMonth(periodStartDate);
    }

    const datesInPeriod = eachDayOfInterval({ start: periodStartDate, end: periodEndDate });
    let generatedCount = 0;
    const newSchedulesToProcess: Omit<Schedule, 'id' | "employeeName">[] = [];

    targetEmployees.forEach(employee => {
      datesInPeriod.forEach(date => {
        const dayOfWeekIndex = getDay(date); // 0 (Sun) to 6 (Sat)
        const dayKey = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][dayOfWeekIndex] as keyof DayOfWeekSelection;

        if (daysToInclude[dayKey]) {
          newSchedulesToProcess.push({
            employeeId: employee.employeeId,
            date: date,
            timeIn: defaultShift.timeIn,
            timeOut: defaultShift.timeOut,
            lunchStart: defaultShift.lunchStart,
            lunchEnd: defaultShift.lunchEnd,
            notes: notes || "Generated Shift",
          });
          generatedCount++;
        }
      });
    });

    try {
      const employeeIdsForOverwrite = targetEmployees.map(emp => emp.employeeId);
      await batchProcessSchedules(newSchedulesToProcess, employeeIdsForOverwrite, periodStartDate, periodEndDate, overwrite);
      toast({ title: "Schedules Processed", description: `${generatedCount} schedule entries processed and saved.` });
      setIsGeneratorModalOpen(false);
      if (!isSameMonth(periodStartDate, currentMonth)) {
        setCurrentMonth(startOfMonth(periodStartDate));
      } else {
        await loadData();
      }
    } catch (error) {
      console.error("Error generating bulk schedules:", error);
      toast({ variant: "destructive", title: "Bulk Generation Error", description: "Could not generate schedules." });
    } finally {
      setIsLoading(false);
    }
  };

  const employeesForGenerator = useMemo(() => {
    return activeEmployees.map(emp => ({
      id: emp.employeeId,
      name: `${emp.firstName} ${emp.lastName}`
    }));
  }, [activeEmployees]);

  const handleSelectAllDailySchedules = (checked: boolean) => {
    if (checked) {
      setSelectedScheduleIds(filteredDailySchedules.map(sch => sch.id));
    } else {
      setSelectedScheduleIds([]);
    }
  };

  const handleSelectSingleDailySchedule = (scheduleId: string, checked: boolean) => {
    if (checked) {
      setSelectedScheduleIds(prev => [...prev, scheduleId]);
    } else {
      setSelectedScheduleIds(prev => prev.filter(id => id !== scheduleId));
    }
  };

  const isAllDailySelected = useMemo(() => {
    return filteredDailySchedules.length > 0 && selectedScheduleIds.length === filteredDailySchedules.length;
  }, [filteredDailySchedules, selectedScheduleIds]);


  if (authLoading || isLoading && allEmployees.length === 0 ) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Card className="shadow-md">
          <CardHeader>
              <CardTitle>Manage Schedules</CardTitle>
              <CardDescription>Add individual schedules or generate them in bulk for a week or month.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-2">
              <Button className="w-full sm:w-auto bg-primary hover:bg-primary/90" onClick={() => handleOpenCreateModal()} disabled={authLoading || activeEmployees.length === 0}>
                  <PlusCircle size={16} className="mr-2"/> Add Single Schedule
              </Button>
              <Button className="w-full sm:w-auto" variant="outline" onClick={() => setIsGeneratorModalOpen(true)} disabled={authLoading || activeEmployees.length === 0}>
                  <CopyPlus size={16} className="mr-2"/> Generate Bulk Schedules
              </Button>
          </CardContent>
      </Card>
      
      <Tabs defaultValue="daily" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="daily">Daily View</TabsTrigger>
          <TabsTrigger value="monthly">Monthly View</TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="mt-4">
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="text-xl">Daily Schedule Details</CardTitle>
               <CardDescription>View and manage schedules for a specific day.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-2 mb-4 items-center">
                <Input type="date" className="w-full md:w-auto" value={format(dailySelectedDate, "yyyy-MM-dd")} onChange={e => setDailySelectedDate(parseISO(e.target.value) || new Date())} />
                <Select value={dailyFilterEmployee} onValueChange={setDailyFilterEmployee} disabled={activeEmployees.length === 0}>
                  <SelectTrigger className="w-full md:w-[200px]">
                    <SelectValue placeholder={activeEmployees.length === 0 ? "No active employees" : "Filter by Employee"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees</SelectItem>
                    {activeEmployees.map(emp => <SelectItem key={emp.id} value={emp.employeeId}>{`${emp.firstName} ${emp.lastName}`}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input placeholder="Search Notes..." className="flex-1" value={dailySearchNotes} onChange={e => setDailySearchNotes(e.target.value)} />
                <Button variant="outline" onClick={() => {setDailySelectedDate(new Date()); setDailyFilterEmployee("all"); setDailySearchNotes(""); setSelectedScheduleIds([]);}}><XCircle size={16} className="mr-2 md:hidden lg:inline-block" /> Clear</Button>
                <AlertDialog open={isDeleteConfirmationModalOpen} onOpenChange={setIsDeleteConfirmationModalOpen}>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      className="w-full md:w-auto"
                      disabled={selectedScheduleIds.length === 0 || isLoading || isDeletingSchedules}
                    >
                      {isDeletingSchedules && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <Trash2 size={16} className="mr-2" /> Delete ({selectedScheduleIds.length})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete the selected {selectedScheduleIds.length} schedule(s)? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isDeletingSchedules}>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteSelectedSchedules} disabled={isDeletingSchedules} className="bg-destructive hover:bg-destructive/90">
                        {isDeletingSchedules && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              {(isLoading) && <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
              {!isLoading && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">
                         <Checkbox
                          checked={isAllDailySelected}
                          onCheckedChange={(checked) => handleSelectAllDailySchedules(Boolean(checked))}
                          aria-label="Select all schedules for the day"
                          disabled={filteredDailySchedules.length === 0}
                        />
                      </TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Time (In/Out)</TableHead>
                      <TableHead>Lunch (Start/End)</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDailySchedules.length > 0 ? filteredDailySchedules.map(sch => (
                      <TableRow key={sch.id} data-state={selectedScheduleIds.includes(sch.id) ? "selected" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selectedScheduleIds.includes(sch.id)}
                            onCheckedChange={(checked) => handleSelectSingleDailySchedule(sch.id, Boolean(checked))}
                            aria-label={`Select schedule for ${sch.employeeName}`}
                          />
                        </TableCell>
                        <TableCell>{sch.employeeName || `[ID: ${sch.employeeId}]`}</TableCell>
                        <TableCell>{sch.timeIn} - {sch.timeOut}</TableCell>
                        <TableCell>{sch.lunchStart} - {sch.lunchEnd}</TableCell>
                        <TableCell className="max-w-[150px] truncate" title={sch.notes}>{sch.notes || "-"}</TableCell>
                        <TableCell className="flex gap-1 justify-center">
                          <Button variant="ghost" size="icon" onClick={() => handleEditSchedule(sch)} title="Edit Schedule" disabled={isDeletingSchedules}><Edit size={16} /></Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive/80" onClick={() => handleDeleteSchedule(sch.id)} title="Delete Schedule" disabled={isDeletingSchedules}><Trash2 size={16} /></Button>
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No schedules found for selected criteria.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monthly" className="mt-4">
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="text-xl">Monthly Schedule Overview</CardTitle>
               <CardDescription>View a summary of schedules for the month. Click an entry to manage.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => startOfMonth(subMonths(prev, 1)))}><ChevronLeft /></Button>
                <h3 className="text-lg font-semibold text-center">{format(currentMonth, "MMMM yyyy")}</h3>
                <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => startOfMonth(addMonths(prev, 1)))}><ChevronRight /></Button>
              </div>
              {(isLoading) && <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>}
              {!isLoading && (
              <div className="overflow-x-auto">
                <div className="grid grid-cols-7 gap-px sm:gap-1 border rounded-md overflow-hidden min-w-[600px]">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(dayName => (
                    <div key={dayName} className="text-center font-medium p-1 sm:p-2 text-xs sm:text-sm bg-muted/50">{dayName}</div>
                  ))}
                  {daysInMonthView.map((day, i) => (
                    <div
                        key={day ? format(day, "yyyy-MM-dd") : `empty-${i}`}
                        className={cn(
                            "border-t border-l min-h-[8rem] sm:min-h-[10rem] p-1 sm:p-2 text-left relative",
                            day ? 'bg-background' : 'bg-muted/20 cursor-default',
                            day && isToday(day) && "bg-primary/10 border-primary/30 ring-1 ring-primary",
                            i % 7 === 0 && "border-l-0",
                            i < 7 && "border-t-0"
                        )}
                    >
                      {day && (
                        <>
                          <div
                            className={cn(
                                "text-xs sm:text-sm font-medium mb-1",
                                isSameMonth(day, currentMonth) ? 'text-foreground' : 'text-muted-foreground/50',
                                isToday(day) && "text-primary font-bold"
                            )}
                          >
                            {format(day, "d")}
                          </div>
                          <ScrollArea className="h-[calc(100%-2.5rem)]">
                            <div className="space-y-0.5">
                              {schedules.filter(s => s.date && isValidDateFns(s.date) && format(s.date, "yyyy-MM-dd") === format(day, "yyyy-MM-dd")).slice(0,5).map(sch => {
                                 const displayName = sch.employeeName && !sch.employeeName.includes("(Employee Not Found)")
                                                      ? sch.employeeName?.split(' ')[0]
                                                      : `[ID: ${sch.employeeId}]`;
                                 return (
                                  <Popover key={sch.id}>
                                    <PopoverTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full h-auto p-0.5 sm:p-1 text-left justify-start truncate text-xs bg-primary/10 text-primary hover:bg-primary/20"
                                        title={`${sch.employeeName || `[ID: ${sch.employeeId}]`}: ${sch.timeIn}-${sch.timeOut}`}
                                      >
                                        {displayName}: {sch.timeIn}
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-2 z-50">
                                      <div className="flex flex-col space-y-1">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleEditSchedule(sch)}
                                          className="text-xs w-full justify-start"
                                        >
                                          <Edit size={14} className="mr-1.5" /> Edit
                                        </Button>
                                        <Button
                                          variant="destructive"
                                          size="sm"
                                          onClick={() => handleDeleteSchedule(sch.id)}
                                          className="text-xs w-full justify-start"
                                        >
                                          <Trash2 size={14} className="mr-1.5" /> Delete
                                        </Button>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                 );
                              })}
                              {schedules.filter(s => s.date && isValidDateFns(s.date) && format(s.date, "yyyy-MM-dd") === format(day, "yyyy-MM-dd")).length > 5 &&
                                 <Button
                                   variant="ghost"
                                   size="sm"
                                   className="w-full h-auto p-1 text-[0.6rem] sm:text-xs text-muted-foreground hover:bg-muted/50 justify-center"
                                   onClick={() => { setSelectedDaySchedules(schedules.filter(s => s.date && isValidDateFns(s.date) && format(s.date, "yyyy-MM-dd") === format(day, "yyyy-MM-dd"))); setIsMoreEmployeesSheetOpen(true); }}
                                 >
                                   ...more ({schedules.filter(s => s.date && isValidDateFns(s.date) && format(s.date, "yyyy-MM-dd") === format(day, "yyyy-MM-dd")).length - 5} employees)
                                 </Button>
                              }
                              {day && schedules.filter(s => s.date && isValidDateFns(s.date) && format(s.date, "yyyy-MM-dd") === format(day, "yyyy-MM-dd")).length === 0 && (
                                   <Button variant="ghost" size="sm" className="w-full h-auto p-1 text-xs text-muted-foreground hover:bg-muted/50" onClick={() => handleOpenCreateModal({date: day})}>
                                      <PlusCircle size={12} className="mr-1"/> Add
                                   </Button>
                              )}
                            </div>
                          </ScrollArea>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      <Dialog open={isScheduleModalOpen} onOpenChange={(open) => { setIsScheduleModalOpen(open); if (!open) setEditingSchedule(null); }}>
        <DialogContent className="sm:max-w-md"> 
            <DialogHeader>
                <DialogTitle>{editingSchedule ? "Edit Schedule" : "Add New Schedule"}</DialogTitle>
                <DialogDescription>
                  {editingSchedule ? "Update the details for this shift." : "Create a new shift for an employee."}
                </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[70vh] p-1 pr-3">
            <div className="grid gap-4 py-4 px-1">
                <div className="space-y-1">
                    <Label htmlFor="employeeIdModal">Employee*</Label>
                       <Select name="employeeId" value={scheduleFormData.employeeId || ""} onValueChange={(value) => setScheduleFormData(prev => ({...prev, employeeId: value}))} disabled={isLoading || activeEmployees.length === 0}>
                          <SelectTrigger id="employeeIdModal" className={cn(activeEmployees.length === 0 && "cursor-not-allowed opacity-50")}><SelectValue placeholder={activeEmployees.length === 0 ? "No Active Employees": "Select Employee"}/></SelectTrigger>
                          <SelectContent>{activeEmployees.map(emp => <SelectItem key={emp.id} value={emp.employeeId}>{`${emp.firstName} ${emp.lastName}`}</SelectItem>)}</SelectContent>
                      </Select>
                </div>
                <div className="space-y-1">
                    <Label htmlFor="dateModal">Date*</Label>
                    <Input id="dateModal" name="date" type="date"
                           value={scheduleFormData.date && isValidDateFns(scheduleFormData.date) ? format(scheduleFormData.date, "yyyy-MM-dd") : ""}
                           onChange={handleScheduleFormChange} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <Label htmlFor="timeInModal">Time In*</Label>
                        <Input id="timeInModal" name="timeIn" type="time" value={scheduleFormData.timeIn || ""} onChange={handleScheduleFormChange} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="timeOutModal">Time Out*</Label>
                        <Input id="timeOutModal" name="timeOut" type="time" value={scheduleFormData.timeOut || ""} onChange={handleScheduleFormChange} />
                    </div>
                </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <Label htmlFor="lunchStartModal">Lunch Start*</Label>
                        <Input id="lunchStartModal" name="lunchStart" type="time" value={scheduleFormData.lunchStart || ""} onChange={handleScheduleFormChange} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="lunchEndModal">Lunch End*</Label>
                        <Input id="lunchEndModal" name="lunchEnd" type="time" value={scheduleFormData.lunchEnd || ""} onChange={handleScheduleFormChange} />
                    </div>
                </div>
                <div className="space-y-1">
                    <Label htmlFor="notesModal">Notes</Label>
                    <Input id="notesModal" name="notes" placeholder="Optional notes" value={scheduleFormData.notes || ""} onChange={handleScheduleFormChange} />
                </div>
            </div>
            </ScrollArea>
            <DialogFooter className="border-t pt-4"> 
                <Button variant="outline" onClick={() => setIsScheduleModalOpen(false)}>Cancel</Button>
                <Button onClick={handleSaveSchedule} className="bg-primary hover:bg-primary/90" disabled={isLoading}>{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingSchedule ? "Save Changes" : "Create Schedule"}</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScheduleGeneratorModal
        isOpen={isGeneratorModalOpen}
        onOpenChange={setIsGeneratorModalOpen}
        employees={employeesForGenerator}
        onGenerateSchedules={handleGenerateSchedules}
      />

      <Sheet open={isMoreEmployeesSheetOpen} onOpenChange={setIsMoreEmployeesSheetOpen}>
        <SheetContent className="sm:max-w-md w-full">
          <SheetHeader>
            <SheetTitle>Schedules for {selectedDaySchedules.length > 0 && selectedDaySchedules[0].date && isValidDateFns(selectedDaySchedules[0].date) ? format(selectedDaySchedules[0].date, "MMM dd, yyyy") : "Selected Day"}</SheetTitle>
            <SheetDescription>
              Complete list of all employees scheduled for this day.
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-8rem)] py-4">
            <div className="space-y-3">
              {selectedDaySchedules.map(sch => (
                <Card key={sch.id} className="p-3">
                  <div className="font-semibold text-sm mb-1">{sch.employeeName || `[ID: ${sch.employeeId}]`}</div>
                  <div className="text-xs text-muted-foreground">
                    <p>Shift: {sch.timeIn} - {sch.timeOut}</p>
                    <p>Lunch: {sch.lunchStart} - {sch.lunchEnd}</p>
                    {sch.notes && <p className="mt-1 text-foreground italic truncate" title={sch.notes}>Notes: {sch.notes}</p>}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { handleEditSchedule(sch); setIsMoreEmployeesSheetOpen(false); }}
                      className="text-xs w-full justify-center"
                    >
                      <Edit size={14} className="mr-1.5" /> Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => { handleDeleteSchedule(sch.id); setIsMoreEmployeesSheetOpen(false); }}
                      className="text-xs w-full justify-center"
                    >
                      <Trash2 size={14} className="mr-1.5" /> Delete
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}

    