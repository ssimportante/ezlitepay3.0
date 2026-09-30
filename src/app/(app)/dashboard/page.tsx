

"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  Gift,
  Power,
  Briefcase,
  UserCheck,
  UserXIcon,
  CalendarDays,
  Loader2,
  ArrowUpRight,
  PartyPopper,
  ClockIcon,
  Calendar as CalendarIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, differenceInMilliseconds, isValid, getMonth, getDate, getYear, addDays, startOfDay, setYear, isWithinInterval, differenceInYears, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameDay, setHours, setMinutes, setSeconds, setMilliseconds, differenceInMinutes, endOfDay } from "date-fns";
import type { Employee as FullEmployeeType } from "@/app/(app)/employees/components/employee-types";
import { getEmployeesService, batchResetLeaveCreditsService } from "@/lib/firebase/firestore-services/employee-service";
import { getTimeLogEventsService, addTimeLogEventService, type TimeLogEvent } from "@/lib/firebase/firestore-services/time-log-service";
import { getSchedulesService } from "@/lib/firebase/firestore-services/schedule-service";
import { getLeaveRequestsService } from "@/lib/firebase/firestore-services/leave-service";
import type { LeaveRequest } from "@/types/leave";
import type { Schedule } from "@/types/schedule";
import { getCompanySettings, updateCompanySettings } from "@/lib/firebase/firestore-services/company-service";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";


const initialTopStatsData = [
  { title: "Total Employees", value: "0", icon: Users, bgColor: "bg-primary/10", iconColor: "text-primary", percentageChange: "+0%" },
  { title: "Present Today", value: "0", icon: UserCheck, bgColor: "bg-blue-500/10", iconColor: "text-blue-500", percentageChange: "+0%" },
  { title: "Absent Today", value: "0", icon: UserXIcon, bgColor: "bg-red-500/10", iconColor: "text-red-500", percentageChange: "+0%" },
  { title: "On Leave", value: "0", icon: Briefcase, bgColor: "bg-yellow-500/10", iconColor: "text-yellow-500", percentageChange: "0%" },
];

interface MonitorEmployee extends FullEmployeeType {
  liveStatus: TimeLogEvent["status"];
  duration: string;
  liveStatusDateTime: Date;
}

interface LateEmployeeRecord {
  employeeId: string;
  employeeName: string;
  position: string;
  lateMinutes: number;
  date: string; // YYYY-MM-DD format
}

interface AggregatedLateEmployeeRecord {
  employeeId: string;
  employeeName: string;
  position: string;
  totalIncidents: number;
  totalLateMinutes: number;
}

const initialTardinessDataDaily: { summary: { lateEmployees: number; totalLateMinutes: number }; records: LateEmployeeRecord[] } = { summary: { lateEmployees: 0, totalLateMinutes: 0 }, records: [] };
const initialTardinessDataWeekly: { summary: { totalIncidents: number; totalMinutes: number }; records: AggregatedLateEmployeeRecord[] } = { summary: { totalIncidents: 0, totalMinutes: 0 }, records: [] };
const initialTardinessDataMonthly: { summary: { totalIncidents: number; totalMinutes: number }; records: AggregatedLateEmployeeRecord[] } = { summary: { totalIncidents: 0, totalMinutes: 0 }, records: [] };


const quickAccessLinks = [
    { label: "Add New Employee", href: "/employees" },
    { label: "Process Payroll", href: "/payroll" },
    { label: "View Attendance", href: "/attendance" },
    { label: "Generate Reports", href: "/reports" },
];

const LEAVE_CREDIT_RESET_YEAR_KEY = 'leaveCreditResetYear';
const MAX_LEAVE_CREDITS = 5;

export default function DashboardPage() {
  const { toast } = useToast();
  // --- States for data ---
  const [allEmployees, setAllEmployees] = useState<FullEmployeeType[]>([]);
  const [allLeaveRequests, setAllLeaveRequests] = useState<LeaveRequest[]>([]);
  
  // Data for "Today" stats (Top Cards, Monitor)
  const [todayTimeLogs, setTodayTimeLogs] = useState<TimeLogEvent[]>([]);
  const [todaySchedules, setTodaySchedules] = useState<Schedule[]>([]);

  // Data for Tardiness Report (can be historical)
  const [tardinessTimeLogs, setTardinessTimeLogs] = useState<TimeLogEvent[]>([]);
  const [tardinessSchedules, setTardinessSchedules] = useState<Schedule[]>([]);
  const [isTardinessLoading, setIsTardinessLoading] = useState(true);

  // --- UI and Control States ---
  const [topStats, setTopStats] = useState(initialTopStatsData);
  const [activeEmployeeMonitors, setActiveEmployeeMonitors] = useState<MonitorEmployee[]>([]);

  const [tardinessDataDaily, setTardinessDataDaily] = useState(initialTardinessDataDaily);
  const [tardinessDataWeekly, setTardinessDataWeekly] = useState(initialTardinessDataWeekly);
  const [tardinessDataMonthly, setTardinessDataMonthly] = useState(initialTardinessDataMonthly);

  const [isPageLoading, setIsPageLoading] = useState(true);
  const [processingLogoutId, setProcessingLogoutId] = useState<string | null>(null);

  const [selectedTardinessView, setSelectedTardinessView] = useState<"daily" | "weekly" | "monthly">("daily");
  const [tardinessDate, setTardinessDate] = useState<Date | undefined>(new Date());
  
  const [now, setNow] = useState(new Date());

  const [todayBirthdays, setTodayBirthdays] = useState<FullEmployeeType[]>([]);
  const [upcomingBirthdays, setUpcomingBirthdays] = useState<FullEmployeeType[]>([]);
  const [todayAnniversaries, setTodayAnniversaries] = useState<{ employee: FullEmployeeType; tenure: number }[]>([]);
  const [upcomingAnniversaries, setUpcomingAnniversaries] = useState<{ employee: FullEmployeeType; tenure: number }[]>([]);

  const fetchStaticData = useCallback(async () => {
    setIsPageLoading(true);
    try {
        const today = new Date();
        const startOfToday = startOfDay(today);
        const endOfToday = endOfDay(today);
        
        const [
          fetchedEmployees, 
          fetchedLeaveRequests,
          fetchedTodayLogs,
          fetchedTodaySchedules
        ] = await Promise.all([
          getEmployeesService(),
          getLeaveRequestsService(),
          getTimeLogEventsService({ startDate: startOfToday, endDate: endOfToday }),
          getSchedulesService({ startDate: startOfToday, endDate: endOfToday }),
        ]);
        setAllEmployees(fetchedEmployees);
        setAllLeaveRequests(fetchedLeaveRequests);
        setTodayTimeLogs(fetchedTodayLogs);
        setTodaySchedules(fetchedTodaySchedules);
    } catch(error: any) {
        console.error("[DashboardPage] Error fetching static dashboard data:", error);
        toast({ variant: "destructive", title: "Error", description: `Could not load dashboard data.` });
    } finally {
        setIsPageLoading(false);
    }
  }, [toast]);

  // Annual Leave Credit Reset Logic
  useEffect(() => {
    const runLeaveCreditReset = async () => {
      try {
        const currentYear = getYear(new Date());
        const companySettings = await getCompanySettings();
        const lastResetYear = companySettings?.lastLeaveResetYear || 0;

        if (currentYear > lastResetYear && getMonth(new Date()) === 0) {
          console.log(`[Dashboard] New year detected (${currentYear}). Running annual leave credit reset...`);
          toast({ title: "Happy New Year!", description: `Resetting leave credits for ${currentYear}...` });

          const result = await batchResetLeaveCreditsService(MAX_LEAVE_CREDITS);
          
          if (result.success) {
            await updateCompanySettings({ lastLeaveResetYear: currentYear });
            toast({
              title: "Leave Credits Reset",
              description: `Successfully reset leave credits for ${result.count} active employees to ${MAX_LEAVE_CREDITS}. Refreshing data...`,
            });
            // Force a page reload to ensure all components have the freshest data.
            // This is the simplest and most robust way to handle this one-off annual event.
            window.location.reload();
          } else {
            throw new Error(result.error || "An unknown error occurred during the reset.");
          }
        }
      } catch (error: any) {
        console.error("[Dashboard] Failed to run annual leave credit reset:", error);
        toast({
          variant: "destructive",
          title: "Leave Reset Failed",
          description: error.message,
        });
      }
    };
    
    // We only want this check to run once on mount. The toast function reference is stable.
    runLeaveCreditReset();
  }, [toast]);


  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Effect to fetch data for the tardiness report based on the selected date
  useEffect(() => {
    const fetchTardinessData = async () => {
        setIsTardinessLoading(true);
        const selectedMonth = tardinessDate || new Date();
        const startOfSelectedMonth = startOfMonth(selectedMonth);
        const endOfSelectedMonth = endOfMonth(selectedMonth);
        
        try {
            const [fetchedTimeLogs, fetchedSchedules] = await Promise.all([
              getTimeLogEventsService({ startDate: startOfSelectedMonth, endDate: endOfSelectedMonth }),
              getSchedulesService({ startDate: startOfSelectedMonth, endDate: endOfSelectedMonth }),
            ]);
            setTardinessTimeLogs(fetchedTimeLogs);
            setTardinessSchedules(fetchedSchedules);

        } catch (error: any) {
             console.error("[DashboardPage] Error fetching tardiness-related data:", error);
             toast({ variant: "destructive", title: "Error", description: `Could not load tardiness data for the selected month.` });
        } finally {
            setIsTardinessLoading(false);
        }
    };
    fetchTardinessData();
  }, [tardinessDate, toast]);
  
  // Effect for fetching data that does NOT depend on the tardiness date picker (runs once)
  useEffect(() => {
    fetchStaticData();
  }, [fetchStaticData]);


  // Recalculate top stats whenever today's data changes or `now` ticks
  useEffect(() => {
    if (isPageLoading) return;

    const today = startOfDay(new Date());
    // --- Dashboard Calculations ---
    const newTopStats = [...initialTopStatsData];

    // Total Employees
    const totalEmployeesStat = newTopStats.find(stat => stat.title === "Total Employees");
    if (totalEmployeesStat) totalEmployeesStat.value = allEmployees.length.toString();
    
    // Get employees scheduled for today
    const scheduledEmployeeIds = new Set(
        todaySchedules.map(sch => sch.employeeId)
    );
    
    // On Leave today
    const onLeaveEmployeeIds = new Set(allLeaveRequests.filter(req => 
      req.status === 'Approved' && 
      isWithinInterval(today, { start: startOfDay(req.startDate), end: endOfDay(req.endDate) })
    ).map(req => req.employeeId));
    const onLeaveCount = onLeaveEmployeeIds.size;
    const onLeaveStat = newTopStats.find(stat => stat.title === "On Leave");
    if (onLeaveStat) onLeaveStat.value = onLeaveCount.toString();

    // Employee Status Monitor
    const employeeLastStatus: Record<string, { status: TimeLogEvent["status"], dateTime: Date, employee: FullEmployeeType }> = {};
    [...todayTimeLogs].sort((a,b) => a.dateTime.getTime() - b.dateTime.getTime()).forEach(log => {
        const empDetails = allEmployees.find(e => e.employeeId === log.employeeId);
        if (empDetails) {
            employeeLastStatus[log.employeeId] = { status: log.status, dateTime: log.dateTime, employee: empDetails };
        }
    });
    
    const activeMonitors = Object.values(employeeLastStatus)
        .filter(data => ["Clock In", "Start Break", "End Break", "Start Lunch", "End Lunch"].includes(data.status))
        .map(data => {
            const durationMs = differenceInMilliseconds(now, data.dateTime);
            const hours = Math.floor(durationMs / (1000 * 60 * 60));
            const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
            return { ...data.employee, liveStatus: data.status, liveStatusDateTime: data.dateTime, duration: `${hours}h ${minutes}m` } as MonitorEmployee;
        })
        .sort((a, b) => b.liveStatusDateTime.getTime() - a.liveStatusDateTime.getTime())
        .slice(0, 10);
    setActiveEmployeeMonitors(activeMonitors);
    
    // Present/Absent Counts
    const attendedEmployeeIds = new Set(todayTimeLogs.map(log => log.employeeId));
    const presentCount = attendedEmployeeIds.size;

    // Filter for employees who are 'active' to be considered for absence
    const activeEmployeeIds = new Set(
        allEmployees
            .filter(emp => emp.status.toLowerCase() === 'active')
            .map(emp => emp.employeeId)
    );

    let absentCount = 0;
    scheduledEmployeeIds.forEach(id => {
        // Absent if scheduled, is an "active" employee, not on leave, AND has not attended at all today
        if (
            activeEmployeeIds.has(id) &&
            !attendedEmployeeIds.has(id) &&
            !onLeaveEmployeeIds.has(id)
        ) {
            absentCount++;
        }
    });

    const presentStat = newTopStats.find(stat => stat.title === "Present Today");
    if (presentStat) presentStat.value = presentCount.toString();
    const absentStat = newTopStats.find(stat => stat.title === "Absent Today");
    if (absentStat) absentStat.value = Math.max(0, absentCount).toString(); // Ensure non-negative

    setTopStats(newTopStats);
  }, [allEmployees, todaySchedules, todayTimeLogs, allLeaveRequests, now, isPageLoading]);


  // Calculate Tardiness Data
  useEffect(() => {
    if (isTardinessLoading || !allEmployees.length) {
        setTardinessDataDaily(initialTardinessDataDaily);
        setTardinessDataWeekly(initialTardinessDataWeekly);
        setTardinessDataMonthly(initialTardinessDataMonthly);
        return;
    }

    const selectedDate = tardinessDate || new Date();
    const currentWeekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const currentWeekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
    const currentMonthStart = startOfMonth(selectedDate);
    const currentMonthEnd = endOfMonth(selectedDate);

    const dailyRecords: LateEmployeeRecord[] = [];
    const weeklyIncidents: Record<string, { employee: FullEmployeeType, incidents: number, minutes: number }> = {};
    const monthlyIncidents: Record<string, { employee: FullEmployeeType, incidents: number, minutes: number }> = {};

    allEmployees.forEach(employee => {
        const employeeSchedulesForMonth = tardinessSchedules.filter(sch => sch.employeeId === employee.employeeId);

        employeeSchedulesForMonth.forEach(scheduleForDay => {
            // Find all clock-in logs for this specific day for this employee
            const clockInLogsForDay = tardinessTimeLogs.filter(log =>
                log.employeeId === employee.employeeId &&
                log.status === "Clock In" &&
                isSameDay(log.dateTime, scheduleForDay.date)
            ).sort((a,b) => a.dateTime.getTime() - b.dateTime.getTime()); // Sort to get the first clock-in

            // If there's no clock-in log, the employee was absent for this scheduled day. Skip.
            if (clockInLogsForDay.length === 0) {
                return; 
            }

            const firstClockIn = clockInLogsForDay[0];

            if (scheduleForDay.timeIn) {
                const [hoursStr, minutesStr] = scheduleForDay.timeIn.split(':');
                const scheduledHours = parseInt(hoursStr, 10);
                const scheduledMinutes = parseInt(minutesStr, 10);

                if (!isNaN(scheduledHours) && !isNaN(scheduledMinutes)) {
                    const scheduledTimeInDateTime = setMilliseconds(setSeconds(setMinutes(setHours(startOfDay(firstClockIn.dateTime), scheduledHours), scheduledMinutes), 0), 0);
                    
                    if (firstClockIn.dateTime > scheduledTimeInDateTime) {
                        const lateMinutes = differenceInMinutes(firstClockIn.dateTime, scheduledTimeInDateTime);
                        if (lateMinutes > 0) {
                            const record: LateEmployeeRecord = {
                                employeeId: employee.employeeId,
                                employeeName: `${employee.firstName} ${employee.lastName}`,
                                position: employee.position || "N/A",
                                lateMinutes: lateMinutes,
                                date: format(firstClockIn.dateTime, "yyyy-MM-dd"),
                            };

                            if (isSameDay(firstClockIn.dateTime, selectedDate)) {
                                dailyRecords.push(record);
                            }

                            if (isWithinInterval(firstClockIn.dateTime, { start: currentWeekStart, end: currentWeekEnd })) {
                                if (!weeklyIncidents[employee.employeeId]) {
                                    weeklyIncidents[employee.employeeId] = { employee, incidents: 0, minutes: 0 };
                                }
                                weeklyIncidents[employee.employeeId].incidents++;
                                weeklyIncidents[employee.employeeId].minutes += lateMinutes;
                            }

                            if (isWithinInterval(firstClockIn.dateTime, { start: currentMonthStart, end: currentMonthEnd })) {
                                if (!monthlyIncidents[employee.employeeId]) {
                                    monthlyIncidents[employee.employeeId] = { employee, incidents: 0, minutes: 0 };
                                }
                                monthlyIncidents[employee.employeeId].incidents++;
                                monthlyIncidents[employee.employeeId].minutes += lateMinutes;
                            }
                        }
                    }
                }
            }
        });
    });

    setTardinessDataDaily({
        summary: {
            lateEmployees: new Set(dailyRecords.map(r => r.employeeId)).size,
            totalLateMinutes: dailyRecords.reduce((sum, r) => sum + r.lateMinutes, 0),
        },
        records: dailyRecords.sort((a, b) => b.lateMinutes - a.lateMinutes),
    });

    setTardinessDataWeekly({
        summary: {
            totalIncidents: Object.values(weeklyIncidents).reduce((sum, agg) => sum + agg.incidents, 0),
            totalMinutes: Object.values(weeklyIncidents).reduce((sum, agg) => sum + agg.minutes, 0),
        },
        records: Object.values(weeklyIncidents).map(agg => ({
            employeeId: agg.employee.employeeId,
            employeeName: `${agg.employee.firstName} ${agg.employee.lastName}`,
            position: agg.employee.position || "N/A",
            totalIncidents: agg.incidents,
            totalLateMinutes: agg.minutes,
        })).sort((a,b) => b.totalLateMinutes - a.totalLateMinutes),
    });
    
    setTardinessDataMonthly({
        summary: {
            totalIncidents: Object.values(monthlyIncidents).reduce((sum, agg) => sum + agg.incidents, 0),
            totalMinutes: Object.values(monthlyIncidents).reduce((sum, agg) => sum + agg.minutes, 0),
        },
        records: Object.values(monthlyIncidents).map(agg => ({
            employeeId: agg.employee.employeeId,
            employeeName: `${agg.employee.firstName} ${agg.employee.lastName}`,
            position: agg.employee.position || "N/A",
            totalIncidents: agg.incidents,
            totalLateMinutes: agg.minutes,
        })).sort((a,b) => b.totalLateMinutes - a.totalLateMinutes),
    });

  }, [allEmployees, tardinessTimeLogs, tardinessSchedules, isTardinessLoading, tardinessDate]);


  // Process birthdays and anniversaries
  useEffect(() => {
    if (allEmployees.length > 0) {
      const today = startOfDay(new Date());
      const upcomingWindowStart = addDays(today, 1);
      const upcomingWindowEnd = addDays(today, 7);
      const currentYear = getYear(today);

      const newTodayBirthdays: FullEmployeeType[] = [];
      const newUpcomingBirthdaysData: { employee: FullEmployeeType; date: Date }[] = [];
      const newTodayAnniversariesData: { employee: FullEmployeeType; tenure: number }[] = [];
      const newUpcomingAnniversariesData: { employee: FullEmployeeType; tenure: number; date: Date }[] = [];

      allEmployees.forEach(emp => {
        const birthDate = emp.birthDate ? new Date(emp.birthDate) : null;
        if (birthDate && isValid(birthDate)) {
          const normalizedBirthDate = startOfDay(birthDate);
          if (getMonth(normalizedBirthDate) === getMonth(today) && getDate(normalizedBirthDate) === getDate(today)) {
            newTodayBirthdays.push(emp);
          } else {
            let birthdayCheckDate = setYear(normalizedBirthDate, currentYear);
            if (birthdayCheckDate < today) {
              birthdayCheckDate = setYear(birthdayCheckDate, currentYear + 1);
            }
            if (isWithinInterval(birthdayCheckDate, { start: upcomingWindowStart, end: upcomingWindowEnd })) {
              newUpcomingBirthdaysData.push({ employee: emp, date: birthdayCheckDate });
            }
          }
        }

        const hiredDate = emp.dateHired ? new Date(emp.dateHired) : null;
        if (hiredDate && isValid(hiredDate)) {
          const normalizedHiredDate = startOfDay(hiredDate);
          
          if (getMonth(normalizedHiredDate) === getMonth(today) && getDate(normalizedHiredDate) === getDate(today) && getYear(normalizedHiredDate) !== currentYear) {
            const tenureForToday = differenceInYears(today, normalizedHiredDate);
            newTodayAnniversariesData.push({ employee: emp, tenure: tenureForToday });
          } else {
            let anniversaryCheckDate = setYear(normalizedHiredDate, currentYear);
            if (anniversaryCheckDate < today) {
              anniversaryCheckDate = setYear(anniversaryCheckDate, currentYear + 1);
            }
            
            if (getYear(normalizedHiredDate) < getYear(anniversaryCheckDate) && isWithinInterval(anniversaryCheckDate, { start: upcomingWindowStart, end: upcomingWindowEnd })) {
              // Correctly calculate tenure for the upcoming anniversary date itself
              const upcomingTenure = differenceInYears(anniversaryCheckDate, normalizedHiredDate);
              newUpcomingAnniversariesData.push({ employee: emp, tenure: upcomingTenure, date: anniversaryCheckDate });
            }
          }
        }
      });

      setTodayBirthdays(newTodayBirthdays);
      setUpcomingBirthdays(newUpcomingBirthdaysData.sort((a, b) => a.date.getTime() - b.date.getTime()).map(item => item.employee).slice(0, 3));
      setTodayAnniversaries(newTodayAnniversariesData);
      setUpcomingAnniversaries(newUpcomingAnniversariesData.sort((a, b) => a.date.getTime() - b.date.getTime()).map(item => ({employee: item.employee, tenure: item.tenure})).slice(0, 3));
    } else {
        setTodayBirthdays([]);
        setUpcomingBirthdays([]);
        setTodayAnniversaries([]);
        setUpcomingAnniversaries([]);
    }
  }, [allEmployees]);


  const handleForceLogout = async (employeeId: string, employeeName: string) => {
    setProcessingLogoutId(employeeId);
    try {
        const newLog = await addTimeLogEventService({
            employeeId: employeeId,
            employeeName: employeeName,
            dateTime: new Date(),
            status: "Clock Out",
            notes: "Forced clock out from dashboard by admin.",
        });
        // Optimistically update the UI
        setTodayTimeLogs(prev => [...prev, newLog]);
        setActiveEmployeeMonitors(prev => prev.filter(emp => emp.employeeId !== employeeId));
        
        toast({
            title: "Employee Clocked Out",
            description: `${employeeName} has been clocked out.`,
        });
    } catch (error) {
        console.error("Error forcing clock out from dashboard:", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: `Could not force clock out for ${employeeName}.`,
        });
    } finally {
        setProcessingLogoutId(null);
    }
  };


  const currentTardinessListData = useMemo((): LateEmployeeRecord[] | AggregatedLateEmployeeRecord[] => {
    switch (selectedTardinessView) {
      case "daily": return tardinessDataDaily.records;
      case "weekly": return tardinessDataWeekly.records;
      case "monthly": return tardinessDataMonthly.records;
      default: return [];
    }
  }, [selectedTardinessView, tardinessDataDaily, tardinessDataWeekly, tardinessDataMonthly]);

  const tardinessSummaryText = useMemo(() => {
    const date = tardinessDate || new Date();
    const dailyText = `${tardinessDataDaily.summary.lateEmployees} employees late, ${tardinessDataDaily.summary.totalLateMinutes} mins.`;
    const weeklyText = `${tardinessDataWeekly.summary.totalIncidents} incidents, ${tardinessDataWeekly.summary.totalMinutes} mins.`;
    const monthlyText = `${tardinessDataMonthly.summary.totalIncidents} incidents, ${tardinessDataMonthly.summary.totalMinutes} mins.`;

    return `For ${format(date, "MMM dd, yyyy")}: ${dailyText} | This week: ${weeklyText} | This month: ${monthlyText}`;
  }, [tardinessDate, tardinessDataDaily, tardinessDataWeekly, tardinessDataMonthly]);
  
  const getEventDateForDisplay = (date: Date | null | undefined): Date | undefined => {
    if (!date || !isValid(date)) return undefined;
    const d = new Date(date);
    return setYear(d, getMonth(d) < getMonth(new Date()) ? getYear(new Date()) + 1 : getYear(new Date()));
  };
  
  const getStatusDisplay = (status: TimeLogEvent['status']) => {
    if (status === 'Clock In' || status === 'End Break' || status === 'End Lunch') return 'Clocked In';
    return status;
  }


  const renderEmployeeListItem = (employee: FullEmployeeType, subText?: string, eventDate?: Date) => (
    <div key={employee.id || employee.employeeId} className="flex items-center gap-2 py-1.5 text-xs border-b border-muted/50 last:border-b-0">
      <Avatar className="h-7 w-7">
        <AvatarImage src={employee.profilePicture || `https://placehold.co/28x28.png?text=${employee.firstName?.[0]}${employee.lastName?.[0]}`} alt={employee.firstName} data-ai-hint="employee avatar" />
        <AvatarFallback className="text-[0.6rem]">{employee.firstName?.[0]}{employee.lastName?.[0]}</AvatarFallback>
      </Avatar>
      <div className="truncate flex-1">
        <p className="font-medium text-foreground truncate">{employee.firstName} {employee.lastName}</p>
        {subText && <p className="text-muted-foreground text-[0.7rem] truncate">{subText}</p>}
      </div>
      {eventDate && isValid(eventDate) && <span className="text-muted-foreground text-[0.7rem] shrink-0">{format(eventDate, "MMM dd")}</span>}
    </div>
  );


  if (isPageLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {topStats.map((stat) => (
          <Card key={stat.title} className="shadow-md hover:shadow-lg transition-shadow duration-200 rounded-xl">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                <div className={`p-2 rounded-full ${stat.bgColor}`}>
                    <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${stat.title === "Absent Today" ? 'text-red-600' : 'text-foreground'}`}>{stat.value}</div>
              <p className={`text-xs flex items-center ${stat.percentageChange.startsWith('+') ? 'text-green-600' : (stat.percentageChange.startsWith('-') ? 'text-red-600' : 'text-muted-foreground')}`}>
                <ArrowUpRight className={`h-3 w-3 mr-1 ${stat.percentageChange.startsWith('-') ? 'transform rotate-[135deg]' : (stat.percentageChange === "0%" ? 'hidden' : '') }`} />
                {stat.percentageChange} vs last month
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-sm rounded-xl">
          <CardHeader>
              <CardTitle className="text-lg font-medium">Quick Access</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {quickAccessLinks.map(link => (
                  <Button key={link.href} variant="outline" asChild className="h-12 sm:h-14 justify-center text-center p-2 hover:bg-muted/50 hover:text-foreground rounded-md text-sm font-medium">
                      <Link href={link.href}>
                          {link.label}
                      </Link>
                  </Button>
              ))}
          </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-sm rounded-xl">
          <CardHeader>
            <CardTitle className="text-lg font-medium">Employee Status Monitor</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">Employees currently active. (Data from Time Logs)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isPageLoading ? <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin"/></div> :
             activeEmployeeMonitors.length > 0 ? activeEmployeeMonitors.map(emp => (
              <div key={emp.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 flex-shrink-0 rounded-full">
                    <AvatarImage src={emp.profilePicture || `https://placehold.co/40x40.png?text=${emp.firstName?.[0]}${emp.lastName?.[0]}`} alt={`${emp.firstName} ${emp.lastName}`} data-ai-hint="employee avatar"/>
                    <AvatarFallback>{emp.firstName?.[0]}{emp.lastName?.[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-sm text-foreground">{emp.firstName} {emp.lastName}</p>
                    <div className="flex items-center gap-1 flex-wrap">
                      <Badge variant={"outline"} className="text-xs py-0.5 px-1.5 h-fit capitalize">{emp.position || "N/A"}</Badge>
                      <Badge variant={emp.liveStatus === "Clock Out" || emp.liveStatus === "Start Break" || emp.liveStatus === "Start Lunch" ? "secondary" : "default" } className="text-xs py-0.5 px-1.5 h-fit capitalize">
                        {getStatusDisplay(emp.liveStatus)}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto pt-2 sm:pt-0">
                  <div className="text-left sm:text-right sm:mr-2">
                    <p className="text-xs text-muted-foreground">Status Duration</p>
                    <p className="text-sm font-medium text-foreground">{emp.duration}</p>
                  </div>
                  <Button variant="destructive" size="sm" className="w-full sm:w-auto text-xs rounded-md" onClick={() => handleForceLogout(emp.employeeId, `${emp.firstName} ${emp.lastName}`)} disabled={processingLogoutId === emp.employeeId}>
                    {processingLogoutId === emp.employeeId ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Power className="h-3 w-3 mr-1" />}
                     {processingLogoutId === emp.employeeId ? 'Processing...' : 'Force Clock Out'}
                  </Button>
                </div>
              </div>
            )) : <p className="text-sm text-muted-foreground text-center py-4">No employees are currently clocked in or active.</p>}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="shadow-sm rounded-xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-md font-medium flex items-center gap-2"><Gift className="h-5 w-5 text-primary" /> Birthdays</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div>
                    <h4 className="text-sm font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                       <PartyPopper size={14} className="text-yellow-500"/> Today&apos;s Birthdays
                    </h4>
                    {isPageLoading ? <Loader2 className="h-4 w-4 animate-spin my-2"/> :
                     todayBirthdays.length > 0 ? (
                        todayBirthdays.map(emp => renderEmployeeListItem(emp))
                    ) : (
                        <p className="text-xs text-muted-foreground text-center py-2">No birthdays today.</p>
                    )}
                </div>
                <hr className="my-2 border-border/70"/>
                <div>
                    <h4 className="text-sm font-semibold text-foreground mb-1.5">Upcoming Birthdays (Next 7 Days)</h4>
                    {isPageLoading ? <Loader2 className="h-4 w-4 animate-spin my-2"/> :
                     upcomingBirthdays.length > 0 ? (
                        upcomingBirthdays.map(emp => renderEmployeeListItem(emp, undefined, getEventDateForDisplay(emp.birthDate)))
                    ) : (
                        <p className="text-xs text-muted-foreground text-center py-2">No upcoming birthdays this week.</p>
                    )}
                </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm rounded-xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-md font-medium flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" /> Anniversaries</CardTitle>
            </CardHeader>
             <CardContent className="space-y-3">
                <div>
                    <h4 className="text-sm font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                       <PartyPopper size={14} className="text-yellow-500"/> Today&apos;s Anniversaries
                    </h4>
                     {isPageLoading ? <Loader2 className="h-4 w-4 animate-spin my-2"/> :
                     todayAnniversaries.length > 0 ? (
                        todayAnniversaries.map(item => renderEmployeeListItem(item.employee, `${item.tenure} Year${item.tenure !== 1 ? 's' : ''}`))
                    ) : (
                        <p className="text-xs text-muted-foreground text-center py-2">No work anniversaries today.</p>
                    )}
                </div>
                <hr className="my-2 border-border/70"/>
                <div>
                    <h4 className="text-sm font-semibold text-foreground mb-1.5">Upcoming Anniversaries (Next 7 Days)</h4>
                    {isPageLoading ? <Loader2 className="h-4 w-4 animate-spin my-2"/> :
                     upcomingAnniversaries.length > 0 ? (
                        upcomingAnniversaries.map(item => renderEmployeeListItem(item.employee, `${item.tenure} Year${item.tenure !== 1 ? 's' : ''}`, getEventDateForDisplay(item.employee.dateHired)))
                    ) : (
                        <p className="text-xs text-muted-foreground text-center py-2">No upcoming work anniversaries.</p>
                    )}
                </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-1">
        <Card className="shadow-sm rounded-xl">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
                <CardTitle className="text-lg font-medium flex items-center gap-2"><ClockIcon className="h-5 w-5 text-primary"/>Tardiness Report</CardTitle>
                <CardDescription className="text-sm text-muted-foreground">Select a date to view tardiness for that day, week, and month.</CardDescription>
            </div>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant={"outline"}
                        className={cn("w-full sm:w-[280px] justify-start text-left font-normal", !tardinessDate && "text-muted-foreground")}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {tardinessDate ? format(tardinessDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                    <Calendar
                        mode="single"
                        selected={tardinessDate}
                        onSelect={setTardinessDate}
                        initialFocus
                    />
                </PopoverContent>
            </Popover>
          </CardHeader>
          <CardContent className="p-2 flex flex-col h-[300px]">
            {isTardinessLoading ? <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary"/></div> :
            <>
              <p className="text-xs text-muted-foreground text-center mb-2 px-2">{tardinessSummaryText}</p>
              
              <div className="flex-1 overflow-hidden">
                <Tabs defaultValue="daily" value={selectedTardinessView} onValueChange={(v) => setSelectedTardinessView(v as any)} className="h-full flex flex-col">
                  <TabsList className="grid w-full grid-cols-3 shrink-0">
                      <TabsTrigger value="daily">Daily</TabsTrigger>
                      <TabsTrigger value="weekly">Weekly</TabsTrigger>
                      <TabsTrigger value="monthly">Monthly</TabsTrigger>
                  </TabsList>
                  <ScrollArea className="flex-grow mt-2">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {selectedTardinessView === "daily" && <TableHead className="py-1.5">Date</TableHead>}
                          <TableHead className="py-1.5">Employee</TableHead>
                          <TableHead className="py-1.5">Position</TableHead>
                          {selectedTardinessView === "daily" && <TableHead className="text-right py-1.5">Late (Mins)</TableHead>}
                          {(selectedTardinessView === "weekly" || selectedTardinessView === "monthly") && (
                            <>
                              <TableHead className="text-right py-1.5">Incidents</TableHead>
                              <TableHead className="text-right py-1.5">Total Mins</TableHead>
                            </>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currentTardinessListData.length > 0 ? (
                          currentTardinessListData.map((item, idx) => (
                            <TableRow key={`${item.employeeId}-${(item as any).date || 'agg'}-${idx}`}>
                              {selectedTardinessView === "daily" && (
                                <TableCell className="py-1.5 text-xs">
                                  {(item as LateEmployeeRecord).date ? format(parseISO((item as LateEmployeeRecord).date as string), "MMM dd") : 'N/A'}
                                </TableCell>
                              )}
                              <TableCell className="py-1.5 text-xs font-medium">{item.employeeName}</TableCell>
                              <TableCell className="py-1.5 text-xs">{item.position}</TableCell>
                              {selectedTardinessView === "daily" && (
                                <TableCell className="text-right py-1.5 text-xs">{(item as LateEmployeeRecord).lateMinutes}</TableCell>
                              )}
                              {(selectedTardinessView === "weekly" || selectedTardinessView === "monthly") && (
                                <>
                                  <TableCell className="text-right py-1.5 text-xs">{(item as AggregatedLateEmployeeRecord).totalIncidents}</TableCell>
                                  <TableCell className="text-right py-1.5 text-xs">{(item as AggregatedLateEmployeeRecord).totalLateMinutes}</TableCell>
                                </>
                              )}
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={selectedTardinessView === "daily" ? 4 : 4} className="text-center text-xs text-muted-foreground py-4">
                              No tardiness records for this period.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                    </div>
                  </ScrollArea>
                </Tabs>
              </div>
              </>
              }
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

    

    
