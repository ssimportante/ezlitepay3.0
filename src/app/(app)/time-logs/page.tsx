
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, Search, XCircle, Edit, Trash2, UserX, Loader2, TimerIcon, Upload, Download, Calendar as CalendarIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { format, isValid, parseISO, differenceInMilliseconds, startOfDay, endOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { getEmployeesService } from "@/lib/firebase/firestore-services/employee-service";
import type { Employee as FullEmployeeType } from "@/app/(app)/employees/components/employee-types";
import {
  getTimeLogEventsService,
  addTimeLogEventService,
  updateTimeLogEventService,
  deleteTimeLogEventService,
  batchAddTimeLogEventsService,
  type TimeLogEvent,
} from "@/lib/firebase/firestore-services/time-log-service";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ImportTimeLogsModal, type TimeLogImportRow } from "./components/import-modal";
import { cn } from "@/lib/utils";


interface ClockedInEmployee {
  id: string;
  name: string;
  clockedInAt: string; // Formatted string
  currentStatusDuration: string;
  status: TimeLogEvent["status"];
}

interface DisplayableTimeLogEvent extends TimeLogEvent {
  statusDurationDisplay: string;
}

const timeLogStatuses: TimeLogEvent["status"][] = ["Clock In", "Start Break", "End Break", "Start Lunch", "End Lunch", "Clock Out"];

// Helper to format duration in milliseconds to a human-readable string
function formatDurationFromMs(ms: number, ongoing: boolean = false): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  // Only show seconds if duration is less than a minute OR if it's ongoing and very short
  if (hours === 0 && minutes === 0 && (seconds >= 0 || ongoing)) {
    parts.push(`${seconds}s`);
  }
  
  const durationStr = parts.length > 0 ? parts.join(" ") : (ongoing ? "0s" : "N/A");
  return ongoing ? `${durationStr}` : durationStr;
}


export default function TimeLogsPage() {
  const { toast } = useToast();
  const [allEmployees, setAllEmployees] = useState<FullEmployeeType[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);

  const [timeLogEvents, setTimeLogEvents] = useState<TimeLogEvent[]>([]);
  const [isLoadingTimeLogs, setIsLoadingTimeLogs] = useState(true);
  const [displayableLogs, setDisplayableLogs] = useState<DisplayableTimeLogEvent[]>([]);

  const [clockedInEmployees, setClockedInEmployees] = useState<ClockedInEmployee[]>([]);
  const [isLoadingClockedIn, setIsLoadingClockedIn] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterEmployeeId, setFilterEmployeeId] = useState("all");
  const [filterDateRange, setFilterDateRange] = useState<DateRange | undefined>({
    from: startOfDay(new Date()),
    to: endOfDay(new Date()),
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<TimeLogEvent | null>(null);
  const [logFormData, setLogFormData] = useState<Partial<Omit<TimeLogEvent, 'dateTime'>>>({});
  const [logFormDateTimeString, setLogFormDateTimeString] = useState("");

  
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [logToDeleteId, setLogToDeleteId] = useState<string | null>(null);
  
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [isMultiDeleteConfirmOpen, setIsMultiDeleteConfirmOpen] = useState(false);


  // For live update of ongoing durations
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000); // Update every second
    return () => clearInterval(timer);
  }, []);

  const activeEmployees = useMemo(() => {
    return allEmployees.filter(emp => emp.status === "active");
  }, [allEmployees]);


  const deriveDisplayableLogs = useCallback((logs: TimeLogEvent[], currentTime: Date) => {
    const sortedLogs = [...logs].sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
    const displayLogs: DisplayableTimeLogEvent[] = [];

    const logsByEmployee = new Map<string, TimeLogEvent[]>();
    for (const log of sortedLogs) {
        if (!logsByEmployee.has(log.employeeId)) {
            logsByEmployee.set(log.employeeId, []);
        }
        logsByEmployee.get(log.employeeId)!.push(log);
    }
    
    for(const log of sortedLogs) {
        let statusDurationDisplay = "N/A";
        
        if (log.status === "Clock Out") {
            statusDurationDisplay = log.sessionWorkDuration || "N/A";
        } else if (log.status === "Start Break" || log.status === "Start Lunch") {
            const employeeLogs = logsByEmployee.get(log.employeeId) || [];
            let nextEvent: TimeLogEvent | undefined;
            const currentLogIndex = employeeLogs.findIndex(l => l.id === log.id);
            if(currentLogIndex > -1 && currentLogIndex + 1 < employeeLogs.length) {
                nextEvent = employeeLogs[currentLogIndex+1];
            }

            if(nextEvent) {
                 const endStatus = log.status === 'Start Break' ? 'End Break' : 'End Lunch';
                 if(nextEvent.status === endStatus || nextEvent.status === 'Clock Out') {
                    const durationMs = differenceInMilliseconds(nextEvent.dateTime, log.dateTime);
                    statusDurationDisplay = formatDurationFromMs(durationMs, false);
                 } else {
                    statusDurationDisplay = "Error (interrupted)";
                 }
            } else {
                 // It's the latest event, so it's ongoing
                 const durationMs = differenceInMilliseconds(currentTime, log.dateTime);
                 statusDurationDisplay = formatDurationFromMs(durationMs, true);
            }
        }
        
        displayLogs.push({ ...log, statusDurationDisplay });
    }
    
    return displayLogs.sort((a, b) => b.dateTime.getTime() - a.dateTime.getTime());
}, []);


  const deriveClockedInEmployees = useCallback((logs: TimeLogEvent[], employees: FullEmployeeType[], currentTime: Date) => {
    const employeeClockStatus: { [employeeId: string]: TimeLogEvent } = {};
    if (!Array.isArray(logs)) {
      console.error("deriveClockedInEmployees received non-array for logs:", logs);
      return [];
    }
    const sortedLogs = [...logs].sort((a, b) => {
      if (!a?.dateTime?.getTime || !b?.dateTime?.getTime) return 0;
      return a.dateTime.getTime() - b.dateTime.getTime();
    });

    sortedLogs.forEach(log => {
        if(log && log.employeeId) employeeClockStatus[log.employeeId] = log; // Keep overriding with the latest
    });
    
    const activeSessions = Object.values(employeeClockStatus)
        .filter(log => log && ["Clock In", "Start Break", "Start Lunch", "End Break", "End Lunch"].includes(log.status));

    return activeSessions.map(log => {
        const employee = employees.find(e => e.employeeId === log.employeeId);
        let currentStatusDuration = "0s";
        const durationMs = differenceInMilliseconds(currentTime, log.dateTime);
        currentStatusDuration = formatDurationFromMs(durationMs, true);

        return {
            id: log.employeeId,
            name: employee ? `${employee.firstName} ${employee.lastName}` : log.employeeName,
            clockedInAt: format(log.dateTime, "MMM dd, HH:mm"), // This is time of last status change
            currentStatusDuration: currentStatusDuration,
            status: log.status,
        };
    });
  }, []);

  const fetchAllData = useCallback(async (showToast = false) => {
      setIsLoadingEmployees(true); 
      setIsLoadingTimeLogs(true); 
      setIsLoadingClockedIn(true);
      try {
        const [fetchedEmployees, fetchedTimeLogs] = await Promise.all([
          getEmployeesService(),
          getTimeLogEventsService({ 
            startDate: filterDateRange?.from, 
            endDate: filterDateRange?.to ? endOfDay(filterDateRange.to) : undefined // Use endOfDay for endDate
          }),
        ]);
        setAllEmployees(fetchedEmployees);
        setTimeLogEvents(fetchedTimeLogs);
        if (showToast) {
            toast({ title: "Data Refreshed", description: "Successfully loaded the latest time logs and employees."});
        }
      } catch (error: any) {
        console.error("Error Loading Data:", error);
        toast({ variant: "destructive", title: "Error Loading Data", description: error.message || "Could not load data." });
      } finally {
        setIsLoadingEmployees(false); 
        setIsLoadingTimeLogs(false); 
        setIsLoadingClockedIn(false);
      }
  }, [toast, filterDateRange]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

 useEffect(() => {
    if (timeLogEvents.length > 0 || !isLoadingTimeLogs) { 
        setDisplayableLogs(deriveDisplayableLogs(timeLogEvents, now));
    }
    if ((timeLogEvents.length > 0 || !isLoadingTimeLogs) && (allEmployees.length > 0 || !isLoadingEmployees)) {
        setClockedInEmployees(deriveClockedInEmployees(timeLogEvents, allEmployees, now));
    }
  }, [now, timeLogEvents, allEmployees, deriveDisplayableLogs, deriveClockedInEmployees, isLoadingTimeLogs, isLoadingEmployees]);


  const filteredDisplayableLogs = useMemo(() => {
    if (isLoadingTimeLogs) return [];
    return displayableLogs.filter(event => {
      const matchesSearch = event.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (event.notes && event.notes.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesEmployee = filterEmployeeId === "all" || event.employeeId === filterEmployeeId;

      return matchesSearch && matchesEmployee;
    });
  }, [displayableLogs, searchTerm, filterEmployeeId, isLoadingTimeLogs]);
  
   useEffect(() => {
    setSelectedLogIds([]);
  }, [searchTerm, filterEmployeeId, filterDateRange]);


  const handleOpenModal = (log?: TimeLogEvent) => {
    if (log) {
      setEditingLog(log);
      const { dateTime, ...restOfLog } = log;
      let formattedDateTime = "";
      if (isValid(dateTime)) {
          formattedDateTime = format(dateTime, "yyyy-MM-dd'T'HH:mm");
      } else {
        console.error("Error parsing dateTime for editing log:", dateTime);
        formattedDateTime = format(new Date(), "yyyy-MM-dd'T'HH:mm");
      }
      setLogFormData(restOfLog);
      setLogFormDateTimeString(formattedDateTime);
    } else {
      setEditingLog(null);
      setLogFormData({
        employeeId: allEmployees[0]?.employeeId || "",
        status: "Clock In",
        notes: ""
      });
      setLogFormDateTimeString(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    }
    setIsModalOpen(true);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'dateTime') {
      setLogFormDateTimeString(value);
    } else {
      setLogFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSaveLog = async () => {
    if (!logFormData.employeeId || !logFormDateTimeString || !logFormData.status) {
      toast({ variant: "destructive", title: "Missing fields", description: "Employee, date/time, and status are required." });
      return;
    }
    const employee = allEmployees.find(emp => emp.employeeId === logFormData.employeeId);
    if (!employee) {
      toast({ variant: "destructive", title: "Invalid Employee", description: "Selected employee not found." });
      return;
    }

    let isoDateTimeObject: Date;
    try {
        isoDateTimeObject = parseISO(logFormDateTimeString);
        if(!isValid(isoDateTimeObject)){
            toast({ variant: "destructive", title: "Invalid Date/Time", description: "The provided date/time is not valid."});
            return;
        }
    } catch (error) {
        console.error("Invalid Date/Time Format:", error);
        toast({ variant: "destructive", title: "Invalid Date/Time Format", description: "Could not parse the date/time."});
        return;
    }

    const finalLogDataForService: Omit<TimeLogEvent, 'id' | 'createdAt' | 'updatedAt' | 'sessionWorkDuration'> = {
      employeeId: logFormData.employeeId,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      dateTime: isoDateTimeObject,
      status: logFormData.status!,
      notes: logFormData.notes || "",
    };

 try {
    let savedLog: TimeLogEvent;
    setIsLoadingTimeLogs(true); 
    if (editingLog) {
        // When updating, we must also pass the dateTime to the service to allow for recalculation
        const updatePayload = {...finalLogDataForService, dateTime: isoDateTimeObject, sessionWorkDuration: editingLog.sessionWorkDuration};
        savedLog = await updateTimeLogEventService(editingLog.id, updatePayload);
        toast({ title: "Log Updated", description: "Time log event has been updated and related durations recalculated." });
    } else {
         savedLog = await addTimeLogEventService(finalLogDataForService);
         toast({ title: "Log Added", description: "New time log event has been added." });
    }
     await fetchAllData();
     setIsModalOpen(false);
     setEditingLog(null);
    } catch (error: any) {
        console.error("Save Error:", error);
        toast({ variant: "destructive", title: "Save Error", description: `Failed to save the time log event: ${error.message}` });
    } finally {
        setIsLoadingTimeLogs(false);
    }
  };

  const handleDeleteLog = async (logId: string | null) => {
    if (!logId) return;
     try {
        setIsLoadingTimeLogs(true);
        await deleteTimeLogEventService(logId);
        setTimeLogEvents(prev => prev.filter(log => log.id !== logId));
        toast({ title: "Log Deleted", description: "Time log event has been removed.", variant: "destructive" });
     } catch (error: any)
        {
        console.error("Delete Error:", error);
        toast({ variant: "destructive", title: "Delete Error", description: `Failed to delete the time log event: ${error.message}` });
     } finally {
        setIsLoadingTimeLogs(false);
        setLogToDeleteId(null);
        setIsDeleteConfirmOpen(false);
     }
  };

  const openDeleteConfirmModal = (logId: string) => {
    setLogToDeleteId(logId);
    setIsDeleteConfirmOpen(true);
  };
  
  const handleDeleteSelectedLogs = async () => {
    if(selectedLogIds.length === 0) return;
    setIsLoadingTimeLogs(true);
    try {
      await Promise.all(selectedLogIds.map(id => deleteTimeLogEventService(id)));
      setTimeLogEvents(prev => prev.filter(log => !selectedLogIds.includes(log.id)));
      toast({ title: "Logs Deleted", description: `${selectedLogIds.length} time log events have been removed.`, variant: "destructive" });
      setSelectedLogIds([]);
    } catch (error: any) {
      console.error("Delete Error:", error);
      toast({ variant: "destructive", title: "Delete Error", description: `Failed to delete all selected logs: ${error.message}` });
    } finally {
      setIsLoadingTimeLogs(false);
      setIsMultiDeleteConfirmOpen(false);
    }
  };

  const handleForceClockOut = async (employeeId: string) => {
    const employee = allEmployees.find(emp => emp.employeeId === employeeId);
    if (!employee) return;

    const newLogDataForService = {
      employeeId: employee.employeeId,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      dateTime: new Date(),
      status: "Clock Out" as TimeLogEvent["status"],
      notes: "Forced clock out by admin."
    };
    try {
        setIsLoadingTimeLogs(true);
        const newLog = await addTimeLogEventService(newLogDataForService);
        setTimeLogEvents(prev => [...prev, newLog].sort((a,b) => b.dateTime.getTime() - a.dateTime.getTime()));
        toast({ title: "Forced Clock Out", description: `${employee.firstName} ${employee.lastName} has been clocked out.` });
    } catch (error: any) {
        console.error("Force Clock Out Error:", error);
        toast({ variant: "destructive", title: "Force Clock Out Error", description: `Failed to force clock out: ${error.message}` });
    } finally {
        setIsLoadingTimeLogs(false);
    }
  };
  
  const handleSelectAll = (checked: boolean | string) => {
    if(checked) {
      setSelectedLogIds(filteredDisplayableLogs.map(log => log.id));
    } else {
      setSelectedLogIds([]);
    }
  };
  
  const handleSelectOne = (logId: string, checked: boolean | string) => {
    if(checked) {
      setSelectedLogIds(prev => [...prev, logId]);
    } else {
      setSelectedLogIds(prev => prev.filter(id => id !== logId));
    }
  };
  
  const handleImport = async (data: TimeLogImportRow[]) => {
    const employeeMap = new Map(allEmployees.map(emp => [emp.employeeId, `${emp.firstName} ${emp.lastName}`]));
    const dataWithNames = data.map(row => ({
      ...row,
      employeeName: employeeMap.get(row.employeeId) || 'Unknown Employee'
    }));
    await batchAddTimeLogEventsService(dataWithNames);
    await fetchAllData(true);
    return { success: true };
  };

  const handleExport = () => {
    if (filteredDisplayableLogs.length === 0) {
      toast({ variant: "default", title: "No Data to Export", description: "There are no logs matching the current filters."});
      return;
    }

    const headers = ["employeeId", "employeeName", "dateTime (YYYY-MM-DD HH:mm:ss)", "status", "notes"];
    const rows = filteredDisplayableLogs.map(log => [
        `"${log.employeeId}"`,
        `"${log.employeeName}"`,
        `"${format(log.dateTime, 'yyyy-MM-dd HH:mm:ss')}"`,
        `"${log.status}"`,
        `"${(log.notes || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `time_logs_export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Export Started", description: `Exporting ${filteredDisplayableLogs.length} log events.`});
  };
  
  const isAllSelected = filteredDisplayableLogs.length > 0 && selectedLogIds.length === filteredDisplayableLogs.length;

  const isLoading = isLoadingEmployees || isLoadingTimeLogs || isLoadingClockedIn;

  if (isLoading && timeLogEvents.length === 0 && allEmployees.length === 0) { 
    return (
        <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    );
  }


  return (
    <div className="p-4 md:p-6 space-y-6">
      <Card className="shadow-md">
        <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-xl">Employee Time Log Events</CardTitle>
            <CardDescription>View and manage employee clock-in/out events.</CardDescription>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setIsImportModalOpen(true)}>
                <Upload size={16} className="mr-2"/> Import CSV
            </Button>
            <Button className="bg-primary hover:bg-primary/90 w-full sm:w-auto" onClick={() => handleOpenModal()} disabled={allEmployees.length === 0 || isLoadingEmployees}>
                <PlusCircle size={16} className="mr-2" /> Add Log Event
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-2 mb-4">
            <Input placeholder="Search by name or notes..." className="flex-1" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            <Select value={filterEmployeeId} onValueChange={setFilterEmployeeId} disabled={isLoadingEmployees || allEmployees.length === 0}>
              <SelectTrigger className="w-full md:w-[200px]"><SelectValue placeholder={allEmployees.length === 0 ? "No Employees Loaded" : "All Employees"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {allEmployees.map(emp => <SelectItem key={emp.id} value={emp.employeeId}>{emp.firstName} {emp.lastName} ({emp.status})</SelectItem>)}
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                  <Button
                      id="date"
                      variant={"outline"}
                      className={cn(
                          "w-full md:w-[300px] justify-start text-left font-normal",
                          !filterDateRange && "text-muted-foreground"
                      )}
                  >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filterDateRange?.from ? (
                          filterDateRange.to ? (
                              <>
                                  {format(filterDateRange.from, "LLL dd, y")} -{" "}
                                  {format(filterDateRange.to, "LLL dd, y")}
                              </>
                          ) : (
                              format(filterDateRange.from, "LLL dd, y")
                          )
                      ) : (
                          <span>Pick a date range</span>
                      )}
                  </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={filterDateRange?.from}
                      selected={filterDateRange}
                      onSelect={setFilterDateRange}
                      numberOfMonths={2}
                  />
              </PopoverContent>
          </Popover>
            <Button variant="outline" onClick={() => {setSearchTerm(""); setFilterEmployeeId("all"); setFilterDateRange(undefined)}} className="w-full sm:w-auto"><XCircle size={16} className="mr-2 md:hidden lg:inline-block" /> Clear</Button>
            <Button variant="outline" onClick={handleExport} disabled={filteredDisplayableLogs.length === 0}><Download size={16} className="mr-2"/> Export CSV</Button>
             <AlertDialog open={isMultiDeleteConfirmOpen} onOpenChange={setIsMultiDeleteConfirmOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={selectedLogIds.length === 0 || isLoadingTimeLogs}>
                  {isLoadingTimeLogs && selectedLogIds.length > 0 ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Trash2 className="mr-2 h-4 w-4" />}
                  Delete ({selectedLogIds.length})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the selected {selectedLogIds.length} time log(s).
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteSelectedLogs} disabled={isLoadingTimeLogs} className="bg-destructive hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <div className="relative border rounded-md" style={{ maxHeight: '500px', overflowY: 'auto' }}>
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                      aria-label="Select all visible logs"
                      disabled={filteredDisplayableLogs.length === 0}
                    />
                  </TableHead>
                  <TableHead>Employee Name</TableHead>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Status Duration</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingTimeLogs && displayableLogs.length === 0 ? (
                     <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary"/></TableCell></TableRow>
                ) : filteredDisplayableLogs.length > 0 ? filteredDisplayableLogs.map(event => {
                    let formattedDateTime = "Invalid Date";
                    if(isValid(event.dateTime)) {
                        formattedDateTime = format(event.dateTime, "MMM dd, yyyy HH:mm");
                    }
                   return (
                  <TableRow key={event.id} data-state={selectedLogIds.includes(event.id) ? "selected" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={selectedLogIds.includes(event.id)}
                        onCheckedChange={(checked) => handleSelectOne(event.id, Boolean(checked))}
                        aria-label={`Select log for ${event.employeeName}`}
                      />
                    </TableCell>
                    <TableCell>{event.employeeName}</TableCell>
                    <TableCell>{formattedDateTime}</TableCell>
                    <TableCell>{event.status}</TableCell>
                    <TableCell>
                        {event.statusDurationDisplay}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                        {event.notes || "-"}
                    </TableCell>
                    <TableCell className="flex gap-1 justify-center">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenModal(event)} title="Edit Log"><Edit size={16} /></Button>
                      <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive/80" title="Delete Log"><Trash2 size={16} /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete this time log event.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteLog(event.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                    </TableCell>
                  </TableRow>
                );
                }) : (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-4">No time log events found matching criteria.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-xl">Currently Clocked In / Active</CardTitle>
          <CardDescription>Employees currently clocked in or on break/lunch.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingClockedIn && clockedInEmployees.length === 0 ? (
              <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary"/></div>
          ) : clockedInEmployees.length > 0 ? (
            <ScrollArea className="h-72 w-full pr-4">
              <ul className="space-y-2">
                {clockedInEmployees.map(emp => (
                  <li key={emp.id} className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/50 transition-colors">
                    <div>
                      <p className="font-medium">{emp.name}</p>
                      <p className="text-xs text-muted-foreground">Status: {emp.status} (Since: {emp.clockedInAt})</p>
                      <p className="text-xs text-muted-foreground">Current Duration: {emp.currentStatusDuration}</p>
                    </div>
                    { (["Clock In", "End Break", "End Lunch", "Start Break", "Start Lunch"].includes(emp.status)) &&
                        <Button variant="destructive" size="sm" onClick={() => handleForceClockOut(emp.id)}>
                            <UserX size={16} className="mr-2" /> Force Clock Out
                        </Button>
                    }
                  </li>
                ))}
              </ul>
            </ScrollArea>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No employees are currently clocked in or active.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={(open) => { setIsModalOpen(open); if (!open) setEditingLog(null); }}>
        <DialogContent className="sm:max-w-md"> 
            <DialogHeader>
                <DialogTitle>{editingLog ? "Edit Time Log Event" : "Add New Time Log Event"}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[70vh] p-1 pr-3"> 
              <div className="grid gap-4 py-4 px-1"> 
                  <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="employeeIdModal" className="text-right col-span-1">Employee*</Label>
                       <Select name="employeeId" value={logFormData.employeeId || ""} onValueChange={(value) => setLogFormData(prev => ({...prev, employeeId: value}))} disabled={isLoadingEmployees || allEmployees.length === 0}>
                          <SelectTrigger id="employeeIdModal" className="col-span-3"><SelectValue placeholder={allEmployees.length === 0 ? "No Employees Loaded": "Select Employee"}/></SelectTrigger>
                          <SelectContent>{allEmployees.map(emp => <SelectItem key={emp.id} value={emp.employeeId}>{emp.firstName} {emp.lastName}</SelectItem>)}</SelectContent>
                      </Select>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="dateTimeModal" className="text-right col-span-1">Date & Time*</Label>
                      <Input id="dateTimeModal" name="dateTime" type="datetime-local" value={logFormDateTimeString} onChange={handleFormChange} className="col-span-3"/>
                  </div>
                   <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="statusModal" className="text-right col-span-1">Status*</Label>
                       <Select name="status" value={logFormData.status || ""} onValueChange={(value) => setLogFormData(prev => ({...prev, status: value as TimeLogEvent["status"]}))}>
                          <SelectTrigger id="statusModal" className="col-span-3"><SelectValue placeholder="Select Status"/></SelectTrigger>
                          <SelectContent>{timeLogStatuses.map((s, idx) => <SelectItem key={`${s}-${idx}`} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="notesModal" className="text-right col-span-1">Notes</Label>
                      <Input id="notesModal" name="notes" placeholder="Optional notes..." value={logFormData.notes || ""} onChange={handleFormChange} className="col-span-3"/>
                  </div>
              </div>
            </ScrollArea>
            <DialogFooter className="border-t pt-4"> 
                <Button variant="outline" onClick={() => {setIsModalOpen(false); setEditingLog(null);}}>Cancel</Button>
                <Button onClick={handleSaveLog} className="bg-primary hover:bg-primary/90">{isLoadingTimeLogs && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingLog ? "Save Changes" : "Add Log"}</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <ImportTimeLogsModal
          isOpen={isImportModalOpen}
          onOpenChange={setIsImportModalOpen}
          onImport={handleImport}
          employees={allEmployees}
        />

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the time log event.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setLogToDeleteId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDeleteLog(logToDeleteId)}
              className={isLoadingTimeLogs ? "bg-destructive/50" : "bg-destructive hover:bg-destructive/90"}
              disabled={isLoadingTimeLogs}
            >
              {isLoadingTimeLogs && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
