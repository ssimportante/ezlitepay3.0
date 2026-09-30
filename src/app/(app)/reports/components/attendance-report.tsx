
"use client";

import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSpreadsheet, Users, CalendarClock, BarChart3, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getEmployeesService } from "@/lib/firebase/firestore-services/employee-service"; 
import type { Employee as FullEmployeeType } from "@/app/(app)/employees/components/employee-types";
import { getTimeLogEventsService, type TimeLogEvent } from "@/lib/firebase/firestore-services/time-log-service";
import { getSchedulesService } from "@/lib/firebase/firestore-services/schedule-service";
import type { Schedule } from "@/types/schedule";
import { format, parseISO, isValid, addDays, eachDayOfInterval, isSameDay, startOfMonth, endOfMonth, parse, startOfDay } from "date-fns";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { useAuth } from "@/contexts/auth-context";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  status: "Present" | "Absent" | "Late" | "On Leave" | "Scheduled"; 
  timeIn?: string; 
  timeOut?: string; 
  workHours?: number; 
}

const attendanceChartConfig = {
  present: { label: "Present", color: "hsl(var(--chart-1))" },
  late: { label: "Late", color: "hsl(var(--chart-3))" },
  absent: { label: "Absent", color: "hsl(var(--destructive))" },
  onLeave: { label: "On Leave", color: "hsl(var(--chart-5))" },
  scheduled: { label: "Scheduled", color: "hsl(var(--muted-foreground))" },
} satisfies ChartConfig;

export function AttendanceReport() {
  const { toast } = useToast();
  const { user, loading: isAuthLoading } = useAuth();
  const [allEmployees, setAllEmployees] = useState<FullEmployeeType[]>([]);
  const [allTimeLogs, setAllTimeLogs] = useState<TimeLogEvent[]>([]);
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  
  const [startDate, setStartDate] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("all");

  useEffect(() => {
    async function loadInitialData() {
      if (!user || isAuthLoading) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      console.log("[AttendanceReport] Fetching data...");
      try {
        const [fetchedEmployees, fetchedTimeLogs, fetchedSchedules] = await Promise.all([
          getEmployeesService(),
          getTimeLogEventsService(),
          getSchedulesService({})
        ]);
        setAllEmployees(fetchedEmployees);
        setAllTimeLogs(fetchedTimeLogs);
        setAllSchedules(fetchedSchedules);
        console.log(`[AttendanceReport] Fetched ${fetchedEmployees.length} employees, ${fetchedTimeLogs.length} logs, ${fetchedSchedules.length} schedules.`);
      } catch (error) {
        console.error("[AttendanceReport] Failed to load initial data:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not load report data." });
      } finally {
        setIsLoading(false);
      }
    }
    loadInitialData();
  }, [toast, user, isAuthLoading]);


  const records = useMemo((): AttendanceRecord[] => {
    if (isLoading || !startDate || !endDate) return [];

    const sDate = parseISO(startDate);
    const eDate = parseISO(endDate);
    if (!isValid(sDate) || !isValid(eDate) || sDate > eDate) return [];

    const days = eachDayOfInterval({ start: sDate, end: eDate });
    const employeesToReportOn = selectedEmployeeId === "all"
      ? allEmployees
      : allEmployees.filter(e => e.employeeId === selectedEmployeeId);
    
    const derivedRecords: AttendanceRecord[] = [];
    const today = startOfDay(new Date());

    employeesToReportOn.forEach(employee => {
      days.forEach(day => {
        const dateStr = format(day, "yyyy-MM-dd");

        // Check if employee is inactive on this day
        let isInactiveOnThisDay = false;
        if (employee.status.toLowerCase() === 'inactive' && employee.dateInactive && day >= startOfDay(new Date(employee.dateInactive))) {
          if (!employee.dateReactivated || day < startOfDay(new Date(employee.dateReactivated))) {
            isInactiveOnThisDay = true;
          }
        }
        
        if (isInactiveOnThisDay) {
          derivedRecords.push({
            id: `${employee.employeeId}-${dateStr}`,
            employeeId: employee.employeeId,
            employeeName: `${employee.firstName} ${employee.lastName}`,
            date: dateStr,
            status: "On Leave",
            timeIn: "N/A",
            timeOut: "N/A",
            workHours: 0,
          });
          return; // Skip to next day for this employee
        }

        const schedule = allSchedules.find(s => s.employeeId === employee.employeeId && isSameDay(s.date, day));
        const logsForDay = allTimeLogs.filter(l => l.employeeId === employee.employeeId && isSameDay(l.dateTime, day))
          .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());

        let status: AttendanceRecord["status"] = "Absent";
        let timeIn: string | undefined;
        let timeOut: string | undefined;
        let workHours: number | undefined;

        const clockInLog = logsForDay.find(l => l.status === "Clock In");
        const clockOutLog = logsForDay.find(l => l.status === "Clock Out");

        if (clockInLog) {
          status = "Present";
          timeIn = format(clockInLog.dateTime, "HH:mm");

          if (schedule && schedule.timeIn) {
            const scheduledTimeIn = parse(schedule.timeIn, "HH:mm", day);
            if (clockInLog.dateTime > scheduledTimeIn) {
              status = "Late";
            }
          }
        }

        if (clockOutLog) {
          timeOut = format(clockOutLog.dateTime, "HH:mm");
          if (clockOutLog.sessionWorkDuration && clockOutLog.sessionWorkDuration.includes("h")) {
            let hours = 0;
            let minutes = 0;
            const hMatch = clockOutLog.sessionWorkDuration.match(/(\d+(?:\.\d+)?)h/);
            const mMatch = clockOutLog.sessionWorkDuration.match(/(\d+(?:\.\d+)?)m/);
            if (hMatch) hours = parseFloat(hMatch[1]);
            if (mMatch) minutes = parseFloat(mMatch[1]);
            workHours = hours + minutes / 60;
          }
        }
        
        // If there's a schedule but no clock-in log
        if (schedule && !clockInLog) {
            // Check if the day is in the future
            if (day > today) {
                status = "Scheduled";
            } else {
                status = "Absent";
            }
        } else if (!schedule && !clockInLog) {
            // If no schedule and no log, don't create a record
            return;
        }
        
        // TODO: Implement leave fetching and logic here if a leave system exists
        
        derivedRecords.push({
          id: `${employee.employeeId}-${dateStr}`,
          employeeId: employee.employeeId,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          date: dateStr,
          status,
          timeIn,
          timeOut,
          workHours
        });
      });
    });

    return derivedRecords;
  }, [isLoading, allEmployees, allTimeLogs, allSchedules, startDate, endDate, selectedEmployeeId]);


  const summaryStats = useMemo(() => {
    const total = records.length;
    const present = records.filter(r => r.status === "Present").length;
    const late = records.filter(r => r.status === "Late").length;
    const absent = records.filter(r => r.status === "Absent").length;
    const onLeave = records.filter(r => r.status === "On Leave").length;
    const scheduled = records.filter(r => r.status === "Scheduled").length;
    return { total, present, late, absent, onLeave, scheduled };
  }, [records]);

  const attendanceChartData = useMemo(() => {
    if (!startDate || !endDate || records.length === 0) return [];
    
    const dailyDataMap = new Map<string, { date: string; present: number; late: number; absent: number; onLeave: number; scheduled: number }>();
    const sDate = parseISO(startDate);
    const eDate = parseISO(endDate);
    if (!isValid(sDate) || !isValid(eDate)) return [];
    
    const daysInInterval = eachDayOfInterval({ start: sDate, end: eDate });

    daysInInterval.forEach(day => {
        const dateStr = format(day, "yyyy-MM-dd");
        dailyDataMap.set(dateStr, { date: format(day, "MMM dd"), present: 0, late: 0, absent: 0, onLeave: 0, scheduled: 0 });
    });
    
    records.forEach(record => {
        const dayData = dailyDataMap.get(record.date);
        if(dayData){
            if(record.status === "Present") dayData.present++;
            else if(record.status === "Late") dayData.late++;
            else if(record.status === "Absent") dayData.absent++;
            else if(record.status === "On Leave") dayData.onLeave++;
            else if(record.status === "Scheduled") dayData.scheduled++;
        }
    });
    return Array.from(dailyDataMap.values());
  }, [records, startDate, endDate]);
  
  const handleExportToCSV = () => {
     if (records.length === 0) {
      toast({ variant: "destructive", title: "No Data", description: "No data to export for the selected criteria." });
      return;
    }
    const headers = ["Date", "Employee ID", "Employee Name", "Status", "Time In", "Time Out", "Work Hours"];
    const rows = records.map(r => [
      `"${r.date}"`,
      `"${r.employeeId}"`,
      `"${r.employeeName}"`,
      `"${r.status}"`,
      `"${r.timeIn || "N/A"}"`,
      `"${r.timeOut || "N/A"}"`,
      `"${r.workHours !== undefined ? r.workHours.toFixed(2) : "N/A"}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n" 
      + rows.map(e => e.join(",")).join("\n");
    
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `attendance_report_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Export Successful", description: "Attendance report exported to CSV." });
  };

  const isDataLoading = isLoading || isAuthLoading;

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Attendance Report</CardTitle>
        <CardDescription>Analyze employee attendance based on Time Logs and Schedules.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row gap-4 mb-6 p-4 border rounded-md bg-muted/30">
          <div className="flex-1 space-y-2">
            <label htmlFor="att-startDate" className="text-sm font-medium">Start Date</label>
            <Input id="att-startDate" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} disabled={isDataLoading} />
          </div>
          <div className="flex-1 space-y-2">
            <label htmlFor="att-endDate" className="text-sm font-medium">End Date</label>
            <Input id="att-endDate" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} disabled={isDataLoading}/>
          </div>
          <div className="flex-1 space-y-2">
            <label htmlFor="att-employee" className="text-sm font-medium">Employee</label>
            <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId} disabled={isDataLoading || allEmployees.length === 0}>
              <SelectTrigger id="att-employee"><SelectValue placeholder={allEmployees.length === 0 ? "No Employees" : "All Employees"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {allEmployees.map(emp => <SelectItem key={emp.employeeId} value={emp.employeeId}>{emp.firstName} {emp.lastName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={handleExportToCSV} className="w-full md:w-auto" disabled={isDataLoading || records.length === 0}>
              <FileSpreadsheet size={16} className="mr-2" /> Export CSV
            </Button>
          </div>
        </div>

        {isDataLoading ? <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div> :
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-6">
            <Card className="text-center">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Records</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{summaryStats.total}</p></CardContent>
            </Card>
            <Card className="text-center">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Present</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-green-600">{summaryStats.present}</p></CardContent>
            </Card>
            <Card className="text-center">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Late</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-orange-500">{summaryStats.late}</p></CardContent>
            </Card>
            <Card className="text-center">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Absent</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-red-600">{summaryStats.absent}</p></CardContent>
            </Card>
             <Card className="text-center">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Scheduled</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-muted-foreground">{summaryStats.scheduled}</p></CardContent>
            </Card>
          </div>
          
          {startDate && endDate && attendanceChartData.length > 0 && selectedEmployeeId === 'all' && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-md flex items-center gap-2"><BarChart3 size={18}/> Daily Attendance Trend</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px] p-2">
                <ChartContainer config={attendanceChartConfig} className="h-full w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={attendanceChartData} accessibilityLayer>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="date" tickLine={false} tickMargin={10} axisLine={false} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={10}/>
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Bar dataKey="present" fill="var(--color-present)" radius={4} stackId="a" />
                      <Bar dataKey="late" fill="var(--color-late)" radius={4} stackId="a" />
                      <Bar dataKey="absent" fill="var(--color-absent)" radius={4} stackId="a" />
                      <Bar dataKey="onLeave" fill="var(--color-onLeave)" radius={4} stackId="a" />
                      <Bar dataKey="scheduled" fill="var(--color-scheduled)" radius={4} stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          <ScrollArea className="border rounded-md max-h-[400px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Time In</TableHead>
                  <TableHead>Time Out</TableHead>
                  <TableHead className="text-right">Work Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length > 0 ? records.map(record => (
                  <TableRow key={record.id}>
                    <TableCell>{format(parseISO(record.date), "MMM dd, yyyy")}</TableCell>
                    <TableCell>{record.employeeName}</TableCell>
                    <TableCell>
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", {
                          "bg-green-100 text-green-700": record.status === "Present",
                          "bg-yellow-100 text-yellow-700": record.status === "Late",
                          "bg-red-100 text-red-700": record.status === "Absent",
                          "bg-blue-100 text-blue-700": record.status === "On Leave",
                          "bg-gray-100 text-gray-600": record.status === "Scheduled",
                      })}>
                        {record.status}
                      </span>
                    </TableCell>
                    <TableCell>{record.timeIn || "N/A"}</TableCell>
                    <TableCell>{record.timeOut || "N/A"}</TableCell>
                    <TableCell className="text-right">{record.workHours !== undefined ? record.workHours.toFixed(2) : "N/A"}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No attendance records found for the selected criteria.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </>
        }
      </CardContent>
    </Card>
  );
}
