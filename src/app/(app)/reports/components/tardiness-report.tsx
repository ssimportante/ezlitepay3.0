
"use client";

import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSpreadsheet, UserX, Clock, Loader2 } from "lucide-react"; 
import { useToast } from "@/hooks/use-toast";
import { getEmployeesService } from "@/lib/firebase/firestore-services/employee-service"; 
import type { Employee as FullEmployeeType } from "@/app/(app)/employees/components/employee-types";
import { getTimeLogEventsService, type TimeLogEvent } from "@/lib/firebase/firestore-services/time-log-service";
import { getSchedulesService } from "@/lib/firebase/firestore-services/schedule-service";
import type { Schedule } from "@/types/schedule";
import { format, parseISO, isValid, addDays, startOfMonth, endOfMonth, isSameDay, setHours, setMinutes, setSeconds, setMilliseconds, startOfDay, differenceInMinutes, parse, startOfWeek, endOfWeek, endOfDay } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/auth-context";


interface TardinessRecord {
  id: string; 
  employeeId: string;
  employeeName: string;
  department: string; 
  date: string; // YYYY-MM-DD
  scheduledTimeIn: string; 
  actualTimeIn: string; 
  lateByMinutes: number; 
}

interface AggregatedTardinessRecord {
  employeeId: string;
  employeeName: string;
  department: string;
  totalIncidents: number;
  totalLateMinutes: number;
}


export function TardinessReport() {
  const { toast } = useToast();
  const { user, loading: isAuthLoading } = useAuth();
  const [allEmployees, setAllEmployees] = useState<FullEmployeeType[]>([]);
  const [allTimeLogs, setAllTimeLogs] = useState<TimeLogEvent[]>([]);
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);

  const [startDate, setStartDate] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("all");
  const [viewMode, setViewMode] = useState<"daily" | "aggregated">("daily");

  useEffect(() => {
    async function loadInitialData() {
      if (!user || isAuthLoading) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const [fetchedEmployees, fetchedTimeLogs, fetchedSchedules] = await Promise.all([
          getEmployeesService(),
          getTimeLogEventsService(),
          getSchedulesService({}) // Fetch all schedules
        ]);
        setAllEmployees(fetchedEmployees);
        setAllTimeLogs(fetchedTimeLogs);
        setAllSchedules(fetchedSchedules);
      } catch (error) {
        console.error("[TardinessReport] Failed to load initial data:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not load report data." });
      } finally {
        setIsLoading(false);
      }
    }
    loadInitialData();
  }, [toast, user, isAuthLoading]); 


  const filteredRecords = useMemo(() => {
    if (isLoading) return [];

    const sDate = startDate ? parseISO(startDate) : null;
    const eDate = endDate ? parseISO(endDate) : null;
    if ((sDate && !isValid(sDate)) || (eDate && !isValid(eDate))) return [];

    let baseRecords: TardinessRecord[] = [];

    const employeesToReportOn = selectedEmployeeId === 'all'
      ? allEmployees
      : allEmployees.filter(e => e.employeeId === selectedEmployeeId);

    employeesToReportOn.forEach(employee => {
      const employeeSchedulesInRange = allSchedules.filter(sch => {
        if (sch.employeeId !== employee.employeeId) return false;
        const schDate = sch.date;
        if (sDate && schDate < startOfDay(sDate)) return false;
        if (eDate && schDate > endOfDay(eDate)) return false;
        return true;
      });

      employeeSchedulesInRange.forEach(scheduleForDay => {
        const clockInLogsForDay = allTimeLogs.filter(log =>
            log.employeeId === employee.employeeId &&
            log.status === "Clock In" &&
            isSameDay(log.dateTime, scheduleForDay.date)
        ).sort((a,b) => a.dateTime.getTime() - b.dateTime.getTime());

        if (clockInLogsForDay.length === 0) {
            return; // Absent, so skip.
        }
        
        const firstClockIn = clockInLogsForDay[0];

        if (scheduleForDay.timeIn) {
            const [hoursStr, minutesStr] = scheduleForDay.timeIn.split(':');
            const scheduledHours = parseInt(hoursStr, 10);
            const scheduledMinutes = parseInt(minutesStr, 10);

            if (!isNaN(scheduledHours) && !isNaN(scheduledMinutes)) {
                const scheduledTimeInDateTime = setMilliseconds(setSeconds(setMinutes(setHours(startOfDay(firstClockIn.dateTime), scheduledHours), scheduledMinutes),0),0);
                
                if (firstClockIn.dateTime > scheduledTimeInDateTime) {
                    const lateMinutes = differenceInMinutes(firstClockIn.dateTime, scheduledTimeInDateTime);
                    if (lateMinutes > 0) {
                        baseRecords.push({
                          id: firstClockIn.id,
                          employeeId: employee.employeeId,
                          employeeName: `${employee.firstName} ${employee.lastName}`,
                          department: employee.department || 'N/A',
                          date: format(firstClockIn.dateTime, 'yyyy-MM-dd'),
                          scheduledTimeIn: scheduleForDay.timeIn,
                          actualTimeIn: format(firstClockIn.dateTime, 'HH:mm'),
                          lateByMinutes: lateMinutes
                        });
                    }
                }
            }
        }
      });
    });
    
    baseRecords.sort((a,b) => parseISO(b.date).getTime() - parseISO(a.date).getTime() || a.employeeName.localeCompare(b.employeeName));

    if (viewMode === "daily") {
        return baseRecords;
    } else { 
        const aggregated: Record<string, AggregatedTardinessRecord> = {};
        baseRecords.forEach(rec => {
            if (!aggregated[rec.employeeId]) {
                aggregated[rec.employeeId] = {
                    employeeId: rec.employeeId,
                    employeeName: rec.employeeName,
                    department: rec.department,
                    totalIncidents: 0,
                    totalLateMinutes: 0,
                };
            }
            aggregated[rec.employeeId].totalIncidents += 1;
            aggregated[rec.employeeId].totalLateMinutes += rec.lateByMinutes;
        });
        return Object.values(aggregated).sort((a,b) => b.totalLateMinutes - a.totalLateMinutes); 
    }

  }, [allEmployees, allTimeLogs, allSchedules, startDate, endDate, selectedEmployeeId, viewMode, isLoading]);

  const summaryStats = useMemo(() => {
    if (viewMode === "daily") {
        const totalIncidents = filteredRecords.length;
        const totalLateMinutes = (filteredRecords as TardinessRecord[]).reduce((sum, r) => sum + r.lateByMinutes, 0);
        const averageLateMinutes = totalIncidents > 0 ? (totalLateMinutes / totalIncidents) : 0;
        return { totalIncidents, totalLateMinutes, averageLateMinutes };
    } else { 
        const totalIncidents = (filteredRecords as AggregatedTardinessRecord[]).reduce((sum, r) => sum + r.totalIncidents, 0);
        const totalLateMinutes = (filteredRecords as AggregatedTardinessRecord[]).reduce((sum, r) => sum + r.totalLateMinutes, 0);
        const averageLateMinutes = totalIncidents > 0 ? (totalLateMinutes / totalIncidents) : 0;
        return { totalIncidents, totalLateMinutes, averageLateMinutes };
    }
  }, [filteredRecords, viewMode]);
  
  const handleExportToCSV = () => {
     if (filteredRecords.length === 0) {
      toast({ variant: "destructive", title: "No Data", description: "No data to export for the selected criteria." });
      return;
    }
    let headers: string[];
    let rows: (string|number)[][];

    if (viewMode === "daily") {
        headers = ["Date", "Employee ID", "Employee Name", "Department", "Scheduled Time In", "Actual Time In", "Late By (Minutes)"];
        rows = (filteredRecords as TardinessRecord[]).map(r => [
            `"${r.date}"`, `"${r.employeeId}"`, `"${r.employeeName}"`, `"${r.department}"`, `"${r.scheduledTimeIn}"`, `"${r.actualTimeIn}"`, r.lateByMinutes
        ]);
    } else { 
        headers = ["Employee ID", "Employee Name", "Department", "Total Incidents", "Total Late Minutes"];
        rows = (filteredRecords as AggregatedTardinessRecord[]).map(r => [
            `"${r.employeeId}"`, `"${r.employeeName}"`, `"${r.department}"`, r.totalIncidents, r.totalLateMinutes
        ]);
    }

    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n" 
      + rows.map(e => e.join(",")).join("\n");
    
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `tardiness_report_${viewMode}_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Export Successful", description: "Tardiness report exported to CSV." });
  };

  const isDataLoading = isLoading || isAuthLoading;

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Tardiness Report</CardTitle>
        <CardDescription>Track employee tardiness based on Time Logs and Schedules.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 p-4 border rounded-md bg-muted/30">
          <div className="space-y-2">
            <label htmlFor="tar-startDate" className="text-sm font-medium">Start Date</label>
            <Input id="tar-startDate" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} disabled={isDataLoading} />
          </div>
          <div className="space-y-2">
            <label htmlFor="tar-endDate" className="text-sm font-medium">End Date</label>
            <Input id="tar-endDate" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} disabled={isDataLoading}/>
          </div>
          <div className="space-y-2">
            <label htmlFor="tar-employee" className="text-sm font-medium">Employee</label>
            <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId} disabled={isDataLoading || allEmployees.length === 0}>
              <SelectTrigger id="tar-employee"><SelectValue placeholder={allEmployees.length === 0 ? "No Employees" : "All Employees"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {allEmployees.map(emp => <SelectItem key={emp.employeeId} value={emp.employeeId}>{emp.firstName} {emp.lastName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
           <div className="space-y-2">
            <label htmlFor="tar-viewMode" className="text-sm font-medium">View Mode</label>
            <Select value={viewMode} onValueChange={(value) => setViewMode(value as "daily" | "aggregated")} disabled={isDataLoading}>
              <SelectTrigger id="tar-viewMode"><SelectValue placeholder="Select View" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily Incidents</SelectItem>
                <SelectItem value="aggregated">Aggregated Summary</SelectItem>
              </SelectContent>
            </Select>
          </div>
           <div className="flex items-end lg:col-span-4"> 
            <Button variant="outline" onClick={handleExportToCSV} className="w-full sm:w-auto" disabled={isDataLoading || filteredRecords.length === 0}>
              <FileSpreadsheet size={16} className="mr-2" /> Export CSV
            </Button>
          </div>
        </div>
        
        {isDataLoading ? <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div> : 
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="text-center">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Incidents</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{summaryStats.totalIncidents}</p></CardContent>
            </Card>
            <Card className="text-center">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Late Minutes</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{summaryStats.totalLateMinutes}</p></CardContent>
            </Card>
            <Card className="text-center">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Avg. Late (Mins/Incident)</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{summaryStats.averageLateMinutes.toFixed(2)}</p></CardContent>
            </Card>
          </div>
          
          <div className="overflow-auto border rounded-md" style={{ maxHeight: '400px' }}>
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  {viewMode === "daily" && <TableHead>Date</TableHead>}
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  {viewMode === "daily" && <TableHead>Scheduled In</TableHead>}
                  {viewMode === "daily" && <TableHead>Actual In</TableHead>}
                  {viewMode === "daily" && <TableHead className="text-right">Late By (Mins)</TableHead>}
                  {viewMode === "aggregated" && <TableHead className="text-right">Incidents</TableHead>}
                  {viewMode === "aggregated" && <TableHead className="text-right">Total Late (Mins)</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.length > 0 ? (filteredRecords as Array<TardinessRecord | AggregatedTardinessRecord>).map((record, idx) => (
                  <TableRow key={record.employeeId + (viewMode === "daily" ? (record as TardinessRecord).date : '') + idx }>
                    {viewMode === "daily" && <TableCell>{format(parseISO((record as TardinessRecord).date), "MMM dd, yyyy")}</TableCell>}
                    <TableCell>{record.employeeName}</TableCell>
                    <TableCell>{record.department}</TableCell>
                    {viewMode === "daily" && <TableCell>{(record as TardinessRecord).scheduledTimeIn}</TableCell>}
                    {viewMode === "daily" && <TableCell>{(record as TardinessRecord).actualTimeIn}</TableCell>}
                    {viewMode === "daily" && <TableCell className="text-right">{(record as TardinessRecord).lateByMinutes}</TableCell>}
                    {viewMode === "aggregated" && <TableCell className="text-right">{(record as AggregatedTardinessRecord).totalIncidents}</TableCell>}
                    {viewMode === "aggregated" && <TableCell className="text-right">{(record as AggregatedTardinessRecord).totalLateMinutes}</TableCell>}
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={viewMode === "daily" ? 6 : 5} className="text-center text-muted-foreground py-8">
                      No tardiness records found for the selected criteria.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
        }
      </CardContent>
    </Card>
  );
}

    