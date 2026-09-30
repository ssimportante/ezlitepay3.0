

"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlusCircle, Search, FileText, Eye, Mail, Trash2, XCircle, Loader2, Download, Send, Edit, CheckCircle, Calendar as CalendarIcon } from "lucide-react";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { PayslipDisplay } from "@/components/common/payslip-display";
import { formatCurrencyPhp, cn } from "@/lib/utils";
import { format, getYear, addDays, eachDayOfInterval, lastDayOfMonth, parseISO, isValid, startOfMonth, differenceInMilliseconds, isSameDay, isWithinInterval, startOfDay, endOfDay, startOfYear, endOfYear, setHours, setMinutes, setSeconds, setMilliseconds, differenceInMinutes, parse, getMonth, getDate } from "date-fns";
import type { DateRange } from "react-day-picker";
import { getEmployeesService, getRateHistory, getPositionHistory, getEmployeeIdHistory, getEmployeeTypeHistory, getEmployeeDoc } from "@/lib/firebase/firestore-services/employee-service";
import type { RateHistory, PositionHistory, EmployeeIdHistory, EmployeeTypeHistory } from "@/types/history";
import { getTimeLogEventsService, type TimeLogEvent } from "@/lib/firebase/firestore-services/time-log-service";
import type { Employee as FullEmployeeType } from "@/app/(app)/employees/components/employee-types";
import { getCompanySettings, type CompanySettings } from "@/lib/firebase/firestore-services/company-service";
import { addOrUpdatePayslipService, getPayslipsByStatusService, getPayslipsService, deletePayslipService, approvePayslipService } from "@/lib/firebase/firestore-services/payslip-service";
import { getLeaveRequestsService } from "@/lib/firebase/firestore-services/leave-service";
import type { LeaveRequest } from "@/types/leave";
import { generatePayslipEmail, type EmailPayslipOutput } from "@/ai/flows/email-payslip-flow";
import { Textarea } from "@/components/ui/textarea";
import { getSchedulesService } from "@/lib/firebase/firestore-services/schedule-service";
import type { Schedule } from "@/types/schedule";
import { ScrollArea } from "@/components/ui/scroll-area";


// src/types/payslip.ts
export interface WorkDay {
  date: string;
  regHrs: number;
  otHrs: number;
  regHol: number;
  specHol: number;
  regHolOtHrs?: number; // Regular Holiday Overtime
  specHolOtHrs?: number; // Special Holiday Overtime
  restDay: number;
  tardyMins: number;
}

export interface Payslip {
  id: string;
  status: 'draft' | 'approved';
  employeeId: string;
  employeeName: string;
  employeeEmail?: string;
  employeePosition?: string;
  employeeType?: string;
  employeeGovIds?: {
    tin?: string;
    sss?: string;
    philhealth?: string;
    pagibig?: string;
  };
  payPeriod: string;
  payDate: Date;

  basicPay: number;
  overtimePayValue: number;
  regularHolidayPayValue: number;
  specialHolidayPayValue: number;
  regularHolidayOvertimePay: number;
  specialHolidayOvertimePay: number;

  bonusAmount: number;
  thirteenthMonthAmount: number;
  manualAdjustmentsAmount: number;
  manualOtherEarningsAmount: number;

  totalGrossPay: number;

  sssDeductionValue: number;
  philhealthDeductionValue: number;
  hdmfDeductionValue: number;
  tardinessDeductionValue: number;
  valeAmount: number;
  loanAmount: number;

  totalDeductions: number;
  netPay: number;
  
  overtimeMultiplier?: number;
  regularHolidayMultiplier?: number;
  specialHolidayMultiplier?: number;

  workDaysSummary?: WorkDay[];

  companyInfo: {
    name: string;
    address: string;
    contact: string;
    logoUrl?: string | null;
    establishmentYear?: number;
  };
  yearToDateSummary: {
    year: number;
    earnings: number;
    deductions: number;
    netPay: number;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

// This interface matches the output of `convertToDisplayData`
export interface TempPayslipData {
  payPeriod: string;
  dateIssued: string;
  companyName: string;
  companyAddress: string;
  companyContact: string;
  companyLogoUrl?: string | null;
  companyEstYear?: number;
  employeeName: string;
  employeeId: string;
  employeeEmail?: string;
  employeePosition: string;
  employeeType?: string;
  tin?: string;
  sss?: string;
  philhealth?: string;
  pagibig?: string;
  earnings: {
    standardPay: number;
    overtimePay: number;
    regularHolidayPay: number;
    specialHolidayPay: number;
    regularHolidayOvertimePay: number;
    specialHolidayOvertimePay: number;
    bonus: number;
    thirteenthMonthAmount: number;
    otherCompensations: number;
  };
  totalEarnings: number;
  deductionsList?: { description: string; amount: number }[];
  totalDeductions: number;
  netPay: number;
  ytdSummary: {
    year: number;
    earnings: number;
    deductions: number;
    netPay: number;
  };
}

const initialYtdData: Record<string, { gross: number, deductions: number, net: number }> = {};


export default function PayrollPage() {
  const { toast } = useToast();
  const [allEmployees, setAllEmployees] = useState<FullEmployeeType[]>([]);
  const [timeLogEvents, setTimeLogEvents] = useState<TimeLogEvent[]>([]);
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isApproving, setIsApproving] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [startDate, setStartDate] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(() => format(lastDayOfMonth(new Date()), "yyyy-MM-dd"));
  const [payDateState, setPayDateState] = useState(format(addDays(lastDayOfMonth(new Date()), 5), "yyyy-MM-dd"));

  const [workDays, setWorkDays] = useState<WorkDay[]>([]);

  const [manualAdjustmentsAmount, setManualAdjustmentsAmount] = useState<number | undefined>(undefined);
  const [bonusAmount, setBonusAmount] = useState<number | undefined>(undefined);
  const [thirteenthMonthAmount, setThirteenthMonthAmount] = useState<number | undefined>(undefined);
  const [manualOtherEarningsAmount, setManualOtherEarningsAmount] = useState<number | undefined>(undefined);
  
  const [overtimeMultiplier, setOvertimeMultiplier] = useState<number | undefined>(undefined);
  const [regularHolidayMultiplier, setRegularHolidayMultiplier] = useState<number | undefined>(undefined);
  const [specialHolidayMultiplier, setSpecialHolidayMultiplier] = useState<number | undefined>(undefined);

  const [valeAmount, setValeAmount] = useState<number | undefined>(undefined);
  const [loanAmount, setLoanAmount] = useState<number | undefined>(undefined);
  const [sssDeduct, setSssDeduct] = useState<number | undefined>(undefined);
  const [philhealthDeduct, setPhilhealthDeduct] = useState<number | undefined>(undefined);
  const [hdmfDeduct, setHdmfDeduct] = useState<number | undefined>(undefined);
  
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);

  const [calculatedPayslip, setCalculatedPayslip] = useState<Payslip | null>(null);
  const [draftPayslips, setDraftPayslips] = useState<Payslip[]>([]);
  const [approvedPayslips, setApprovedPayslips] = useState<Payslip[]>([]);
  
  const [isAutoCalculating13thMonth, setIsAutoCalculating13thMonth] = useState(false);


  const [approvedFilterEmployee, setApprovedFilterEmployee] = useState("all");
  const [approvedSearchTerm, setApprovedSearchTerm] = useState("");
  const [approvedDateRange, setApprovedDateRange] = useState<DateRange | undefined>();
  const [selectedPayslipIds, setSelectedPayslipIds] = useState<string[]>([]);
  const [isDeletingPayslips, setIsDeletingPayslips] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const [isViewPayslipModalOpen, setIsViewPayslipModalOpen] = useState(false);
  const [viewingPayslip, setViewingPayslip] = useState<Payslip | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailContent, setEmailContent] = useState<EmailPayslipOutput | null>(null);
  const [emailIsGenerating, setEmailIsGenerating] = useState(false);
  const [emailTarget, setEmailTarget] = useState({ name: "", email: "" });
  
  const componentToPrintRef = useRef<HTMLDivElement>(null);

  const selectedFullEmployeeProfile = useMemo(() => allEmployees.find(e => e.employeeId === selectedEmployeeId), [allEmployees, selectedEmployeeId]);

  useEffect(() => {
    if (endDate) {
      setPayDateState(endDate);
    }
  }, [endDate]);

  
  // Auto-fill form fields when employee is selected or draft is edited
  useEffect(() => {
    if (editingDraftId) {
        // If editing a draft, the draft's data takes precedence. This is handled in handleEditDraft.
        return;
    }
    if (selectedEmployeeId) {
        const employee = allEmployees.find(e => e.employeeId === selectedEmployeeId);
        if (employee) {
            setOvertimeMultiplier(employee.overtimeMultiplier);
            setRegularHolidayMultiplier(employee.regularHolidayMultiplier);
            setSpecialHolidayMultiplier(employee.specialHolidayMultiplier);
            setSssDeduct(employee.sssDeduction);
            setPhilhealthDeduct(employee.philHealthDeduction);
            setHdmfDeduct(employee.hdmfDeduction);
        }
    }
  }, [selectedEmployeeId, allEmployees, editingDraftId]);
  
    // Effect to auto-calculate 13th month pay
  useEffect(() => {
    if (!startDate || !endDate || !selectedEmployeeId || editingDraftId) return;

    const sDate = parseISO(startDate);
    const eDate = parseISO(endDate);

    if (!isValid(sDate) || !isValid(eDate)) return;

    // Check if the period is Dec 16-31
    const isYearEndPeriod = getMonth(sDate) === 11 && getDate(sDate) === 16 &&
                              getMonth(eDate) === 11 && getDate(eDate) === 31;
    
    if (isYearEndPeriod) {
        const calculateAndSet13thMonth = async () => {
            setIsAutoCalculating13thMonth(true);
            const currentYear = getYear(sDate);
            const yearStart = startOfYear(sDate);
            const yearEnd = endOfYear(sDate);

            // We need to fetch all payslips for the employee for the entire year
            // The `approvedPayslips` state might not contain all of them if filters are applied elsewhere
            const allYearPayslips = await getPayslipsService({ 
                employeeId: selectedEmployeeId, 
                startDate: yearStart,
                endDate: yearEnd,
            });
            
            const totalStandardPay = allYearPayslips.reduce((sum, ps) => sum + ps.basicPay, 0);
            
            const thirteenthMonth = totalStandardPay / 12;

            setThirteenthMonthAmount(thirteenthMonth);
            toast({
                title: "13th Month Pay Auto-Calculated",
                description: `Calculated as ${formatCurrencyPhp(thirteenthMonth)} based on year's total standard pay.`
            });
            setIsAutoCalculating13thMonth(false);
        };

        calculateAndSet13thMonth();
    } else {
        // If the period changes away from the 13th month period, reset it
        // unless it's being manually edited in a draft.
        if (!editingDraftId && !isAutoCalculating13thMonth) {
            setThirteenthMonthAmount(undefined);
        }
    }
  }, [startDate, endDate, selectedEmployeeId, editingDraftId, toast]);


  const handleDownloadPdf = async () => {
    if (!componentToPrintRef.current || !viewingPayslip) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Cannot download PDF. Payslip content is not available.",
      });
      return;
    }

    setIsDownloadingPdf(true);
    toast({ title: "Generating PDF...", description: "Please wait while the payslip is being prepared." });

    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: html2canvas } = await import("html2canvas");
      
      const canvas = await html2canvas(componentToPrintRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: [canvas.width, canvas.height],
      });

      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      
      const fileName = `Payslip_${viewingPayslip.employeeName.replace(/\s/g, '_')}_${viewingPayslip.payPeriod.split(' ')[0]}_${viewingPayslip.payPeriod.split(', ')[1]}.pdf`;
      pdf.save(fileName);
      
      toast({ title: "Download Complete", description: `Saved as ${fileName}` });

    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({
        variant: "destructive",
        title: "PDF Generation Failed",
        description: "An error occurred while creating the PDF.",
      });
    } finally {
      setIsDownloadingPdf(false);
    }
  };


  const loadInitialData = useCallback(async (forceFromServer = false) => {
    setIsLoading(true);
    
    try {
      const [
        fetchedEmployees, 
        fetchedTimeLogs, 
        fetchedSchedules, 
        fetchedLeaveRequests, 
        fetchedCompanySettings, 
        fetchedDrafts, 
        fetchedApproved
      ] = await Promise.all([
        getEmployeesService(),
        getTimeLogEventsService(),
        getSchedulesService(),
        getLeaveRequestsService(),
        getCompanySettings(),
        getPayslipsByStatusService("draft"),
        getPayslipsByStatusService("approved"),
      ]);
      setAllEmployees(fetchedEmployees);
      setTimeLogEvents(fetchedTimeLogs);
      setAllSchedules(fetchedSchedules);
      setLeaveRequests(fetchedLeaveRequests);
      setCompanySettings(fetchedCompanySettings);
      setDraftPayslips(fetchedDrafts);
      setApprovedPayslips(fetchedApproved);
    } catch (error) {
      console.error("[PayrollPage] Failed to fetch initial data:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load initial data for payroll." });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const activeEmployees = useMemo(() => {
    const nonActiveStatuses = ["inactive", "resigned", "terminated", "end-of-contract"];
    return allEmployees.filter(emp => !nonActiveStatuses.includes(emp.status.toLowerCase()));
  }, [allEmployees]);

  const handleGenerateWorkDays = () => {
    if (!selectedEmployeeId || !startDate || !endDate) {
        toast({ variant: "destructive", title: "Missing Information", description: "Please select an employee and date range." });
        return;
    }
    const sDate = parseISO(startDate);
    const eDate = parseISO(endDate);
    if (!isValid(sDate) || !isValid(eDate) || sDate > eDate) {
        toast({ variant: "destructive", title: "Invalid Dates", description: "Start date cannot be after end date, or dates are invalid." });
        return;
    }
    const daysInPeriod = eachDayOfInterval({ start: sDate, end: eDate });

    const newWorkDays: WorkDay[] = daysInPeriod.map(currentDate => {
        const formattedCurrentDate = format(currentDate, "yyyy-MM-dd");

        const approvedPaidLeave = leaveRequests.find(req =>
            req.employeeId === selectedEmployeeId &&
            req.status === 'Approved' &&
            req.leaveType === 'Paid' &&
            isWithinInterval(currentDate, { start: startOfDay(req.startDate), end: endOfDay(req.endDate) })
        );
        
        if (approvedPaidLeave) {
            // Correctly attribute paid leave to regular hours
            return { date: formattedCurrentDate, regHrs: 8, otHrs: 0, regHol: 0, specHol: 0, regHolOtHrs: 0, specHolOtHrs: 0, restDay: 0, tardyMins: 0 };
        }
        
        const dailyLogs = timeLogEvents.filter(log =>
            log.employeeId === selectedEmployeeId && isSameDay(log.dateTime, currentDate)
        ).sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());

        if (dailyLogs.length === 0) {
            return { date: formattedCurrentDate, regHrs: 0, otHrs: 0, regHol: 0, specHol: 0, regHolOtHrs: 0, specHolOtHrs: 0, restDay: 1, tardyMins: 0 };
        }

        let totalDailyNetWorkMinutes = 0;
        let firstClockInTime: Date | null = null;
        let tardyMins = 0;
        const scheduleForDay = allSchedules.find(sch => sch.employeeId === selectedEmployeeId && isSameDay(sch.date, currentDate));

        const clockInLogs = dailyLogs.filter(log => log.status === 'Clock In');

        if (clockInLogs.length > 0) {
            firstClockInTime = clockInLogs[0].dateTime;
             if (scheduleForDay && scheduleForDay.timeIn) {
                const [hoursStr, minutesStr] = scheduleForDay.timeIn.split(':');
                if (!isNaN(parseInt(hoursStr)) && !isNaN(parseInt(minutesStr))) {
                    const scheduledTimeInDateTime = setMilliseconds(setSeconds(setMinutes(setHours(startOfDay(firstClockInTime), parseInt(hoursStr)), parseInt(minutesStr)),0),0);
                    if (firstClockInTime > scheduledTimeInDateTime) {
                        tardyMins = differenceInMinutes(firstClockInTime, scheduledTimeInDateTime);
                    }
                }
            }
        }


        // Iterate through all clock-in events to find their corresponding clock-out and calculate session duration
        for (let i = 0; i < dailyLogs.length; i++) {
            if (dailyLogs[i].status === "Clock In") {
                const clockInTime = dailyLogs[i].dateTime;
                let clockOutTime: Date | null = null;
                
                // Find the next clock out
                for (let j = i + 1; j < dailyLogs.length; j++) {
                    if (dailyLogs[j].status === "Clock Out") {
                        clockOutTime = dailyLogs[j].dateTime;
                        break; // Found the pair
                    }
                }
                
                if (clockOutTime) {
                    let sessionNetMs = differenceInMilliseconds(clockOutTime, clockInTime);

                    // Find breaks/lunches that fall WITHIN this specific session
                    let lunchStart: Date | null = null;
                    let breakStart: Date | null = null;
                    
                    for (let j = i + 1; j < dailyLogs.length; j++) {
                        const event = dailyLogs[j];
                        // Stop if we've passed the session's clock-out time
                        if (event.dateTime >= clockOutTime) break;

                        if (event.status === "Start Lunch") lunchStart = event.dateTime;
                        else if (event.status === "End Lunch" && lunchStart) {
                            sessionNetMs -= differenceInMilliseconds(event.dateTime, lunchStart);
                            lunchStart = null;
                        }
                        else if (event.status === "Start Break") breakStart = event.dateTime;
                        else if (event.status === "End Break" && breakStart) {
                            sessionNetMs -= differenceInMilliseconds(event.dateTime, breakStart);
                            breakStart = null;
                        }
                    }
                    totalDailyNetWorkMinutes += Math.round(sessionNetMs / (1000 * 60));
                }
            }
        }


        const standardDayMinutes = 8 * 60;
        const regMinutes = Math.min(totalDailyNetWorkMinutes, standardDayMinutes);
        const otMinutes = Math.max(0, totalDailyNetWorkMinutes - standardDayMinutes);

        const regHrs = parseFloat((regMinutes / 60).toFixed(2));
        const otHrs = parseFloat((otMinutes / 60).toFixed(2));

        return { date: formattedCurrentDate, regHrs, otHrs, regHol: 0, specHol: 0, regHolOtHrs: 0, specHolOtHrs: 0, restDay: 0, tardyMins: tardyMins };
    });

    setWorkDays(newWorkDays);
    toast({ title: "Work Days Generated", description: `${newWorkDays.length} work days populated/updated. Holiday hours must be entered manually.` });
  };

const createPayslipObject = async (
    employeeDocId: string
): Promise<Payslip | null> => {
    if (!payDateState) {
        toast({ variant: "destructive", title: "Cannot Create Payslip", description: "Pay date is not set." });
        return null;
    }
    if (workDays.length === 0) {
        toast({ variant: "destructive", title: "No Work Days", description: "Please generate or input work days for the period." });
        return null;
    }

    setIsLoadingHistory(true);
    let freshEmployeeProfile: FullEmployeeType | null;
    let freshRateHistory: RateHistory[];

    try {
        // Fetch the absolute latest employee profile and their rate history directly from the server.
        [freshEmployeeProfile, freshRateHistory] = await Promise.all([
            getEmployeeDoc(employeeDocId, true), // Passing `true` forces a server read, bypassing cache.
            getRateHistory(employeeDocId, true), // Force server read for history too.
        ]);
    } catch (error) {
        console.error("Error fetching latest employee data for payslip:", error);
        toast({ variant: "destructive", title: "Data Fetch Error", description: "Could not fetch latest employee data for calculation." });
        setIsLoadingHistory(false);
        return null;
    } finally {
        setIsLoadingHistory(false);
    }

    if (!freshEmployeeProfile) {
        toast({ variant: "destructive", title: "Cannot Create Payslip", description: "Could not load up-to-date employee details." });
        return null;
    }
    
    const payDateObject = parseISO(payDateState);
    if (!isValid(payDateObject)) {
        toast({ variant: "destructive", title: "Invalid Pay Date", description: "The pay date entered is not valid." });
        return null;
    }

    // Helper to find the correct historical value for a given date.
    const getHistoricalRate = (rateHistory: RateHistory[], date: Date, fallbackRate: number): number => {
        if (!rateHistory || rateHistory.length === 0) return fallbackRate;
        // History is sorted descending by effectiveDate from the service
        const entry = rateHistory.find(item => startOfDay(item.effectiveDate) <= startOfDay(date));
        return entry ? entry.rate : fallbackRate;
    };


    let totalBasicPay = 0;
    let totalOvertimePay = 0;
    let totalRegularHolidayPay = 0;
    let totalSpecialHolidayPay = 0;
    let totalRegularHolidayOvertimePay = 0;
    let totalSpecialHolidayOvertimePay = 0;
    let totalTardinessDeduction = 0;

    const finalOtMultiplier = overtimeMultiplier !== undefined ? overtimeMultiplier : (freshEmployeeProfile.overtimeMultiplier || 1.25);
    const finalRegHolMultiplier = regularHolidayMultiplier !== undefined ? regularHolidayMultiplier : (freshEmployeeProfile.regularHolidayMultiplier || 2.0);
    const finalSpecHolMultiplier = specialHolidayMultiplier !== undefined ? specialHolidayMultiplier : (freshEmployeeProfile.specialHolidayMultiplier || 1.3);

    workDays.forEach(day => {
        const dayDate = parseISO(day.date);
        if (!isValid(dayDate)) return;

        // Use the helper to get the historically accurate rate for *each specific day* of the pay period.
        const dailyRateForDay = getHistoricalRate(freshRateHistory, dayDate, freshEmployeeProfile.basicSalary);
        const hourlyRateForDay = dailyRateForDay / 8;
        
        if (day.regHrs > 0) totalBasicPay += day.regHrs * hourlyRateForDay;
        if (day.otHrs > 0) totalOvertimePay += day.otHrs * hourlyRateForDay * finalOtMultiplier;
        if (day.regHol > 0) totalRegularHolidayPay += day.regHol * hourlyRateForDay * (finalRegHolMultiplier - 1);
        if (day.specHol > 0) totalSpecialHolidayPay += day.specHol * hourlyRateForDay * (finalSpecHolMultiplier - 1);
        if (day.regHolOtHrs && day.regHolOtHrs > 0) totalRegularHolidayOvertimePay += day.regHolOtHrs * hourlyRateForDay * finalRegHolMultiplier * 1.3;
        if (day.specHolOtHrs && day.specHolOtHrs > 0) totalSpecialHolidayOvertimePay += day.specHolOtHrs * hourlyRateForDay * finalSpecHolMultiplier * 1.3;
        if (day.tardyMins > 0) {
            const minuteRate = hourlyRateForDay / 60;
            totalTardinessDeduction += day.tardyMins * minuteRate;
        }
    });

    const finalManualAdjustments = manualAdjustmentsAmount ?? 0;
    const totalEarningsBeforeAdjustments = totalBasicPay + totalOvertimePay + totalRegularHolidayPay + totalSpecialHolidayPay + totalRegularHolidayOvertimePay + totalSpecialHolidayOvertimePay + (bonusAmount ?? 0) + (thirteenthMonthAmount ?? 0) + (manualOtherEarningsAmount ?? 0);
    const currentTotalGrossPay = totalEarningsBeforeAdjustments + finalManualAdjustments;

    const totalManualDeductions = (valeAmount ?? 0) + (loanAmount ?? 0);
    const finalSssDeduction = sssDeduct !== undefined ? sssDeduct : (freshEmployeeProfile.sssDeduction || 0);
    const finalPhilhealthDeduction = philhealthDeduct !== undefined ? philhealthDeduct : (freshEmployeeProfile.philHealthDeduction || 0);
    const finalHdmfDeduction = hdmfDeduct !== undefined ? hdmfDeduct : (freshEmployeeProfile.hdmfDeduction || 0);
    const currentTotalDeductions = finalSssDeduction + finalPhilhealthDeduction + finalHdmfDeduction + totalManualDeductions + totalTardinessDeduction;
    const currentNetPay = currentTotalGrossPay - currentTotalDeductions;
    
    // --- YTD Calculation ---
    const currentYear = getYear(payDateObject);
    let historicalYtd = { earnings: 0, deductions: 0, netPay: 0 };
    const previousPayslips = approvedPayslips
      .filter(ps => ps.employeeId === freshEmployeeProfile.employeeId && new Date(ps.payDate) < payDateObject)
      .sort((a, b) => new Date(b.payDate).getTime() - new Date(a.payDate).getTime());
    const lastPayslip = previousPayslips[0];
    if (lastPayslip) {
      if (getYear(new Date(lastPayslip.payDate)) === currentYear) {
        historicalYtd = {
          earnings: lastPayslip.yearToDateSummary.earnings,
          deductions: lastPayslip.yearToDateSummary.deductions,
          netPay: lastPayslip.yearToDateSummary.netPay,
        };
      }
    }

    const newPayslip: Payslip = {
      id: editingDraftId || `${Date.now().toString()}-${freshEmployeeProfile.employeeId}`,
      status: 'draft',
      employeeId: freshEmployeeProfile.employeeId,
      employeeName: `${freshEmployeeProfile.firstName} ${freshEmployeeProfile.lastName}`,
      employeeEmail: freshEmployeeProfile.email || "",
      employeePosition: freshEmployeeProfile.position || "N/A",
      employeeType: freshEmployeeProfile.employeeType || "N/A",
      employeeGovIds: {
        tin: freshEmployeeProfile.tinNumber || "N/A",
        sss: freshEmployeeProfile.sssNumber || "N/A",
        philhealth: freshEmployeeProfile.philHealthNumber || "N/A",
        pagibig: freshEmployeeProfile.pagIbigNumber || "N/A",
      },
      payPeriod: `${format(parseISO(startDate), "MMMM dd, yyyy")} - ${format(parseISO(endDate), "MMMM dd, yyyy")}`,
      payDate: payDateObject,

      basicPay: totalBasicPay,
      overtimePayValue: totalOvertimePay,
      regularHolidayPayValue: totalRegularHolidayPay,
      specialHolidayPayValue: totalSpecialHolidayPay,
      regularHolidayOvertimePay: totalRegularHolidayOvertimePay,
      specialHolidayOvertimePay: totalSpecialHolidayOvertimePay,
      bonusAmount: bonusAmount ?? 0,
      thirteenthMonthAmount: thirteenthMonthAmount ?? 0,
      manualAdjustmentsAmount: manualAdjustmentsAmount ?? 0,
      manualOtherEarningsAmount: manualOtherEarningsAmount ?? 0,
      totalGrossPay: currentTotalGrossPay,

      sssDeductionValue: finalSssDeduction,
      philhealthDeductionValue: finalPhilhealthDeduction,
      hdmfDeductionValue: finalHdmfDeduction,
      tardinessDeductionValue: totalTardinessDeduction,
      valeAmount: valeAmount ?? 0,
      loanAmount: loanAmount ?? 0,
      totalDeductions: currentTotalDeductions,
      netPay: currentNetPay,
      
      overtimeMultiplier: finalOtMultiplier,
      regularHolidayMultiplier: finalRegHolMultiplier,
      specialHolidayMultiplier: finalSpecHolMultiplier,

      workDaysSummary: [...workDays],

      companyInfo: {
        name: companySettings?.businessName || "Your Company Name",
        address: companySettings?.businessAddress || "Your Company Address",
        contact: companySettings?.payrollEmail || "company@example.com",
        logoUrl: companySettings?.companyLogoUrl || null,
        establishmentYear: 2021,
      },
      yearToDateSummary: {
        year: currentYear,
        earnings: historicalYtd.earnings + currentTotalGrossPay,
        deductions: historicalYtd.deductions + currentTotalDeductions,
        netPay: historicalYtd.netPay + currentNetPay,
      },
    };
    return newPayslip;
  };

  const resetForm = () => {
    setEditingDraftId(null);
    setCalculatedPayslip(null);
    setSelectedEmployeeId("");
    setStartDate(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
    setEndDate(() => format(lastDayOfMonth(new Date()), "yyyy-MM-dd"));
    setWorkDays([]);
    setManualAdjustmentsAmount(undefined);
    setBonusAmount(undefined);
    setThirteenthMonthAmount(undefined);
    setManualOtherEarningsAmount(undefined);
    setOvertimeMultiplier(undefined);
    setRegularHolidayMultiplier(undefined);
    setSpecialHolidayMultiplier(undefined);
    setValeAmount(undefined);
    setLoanAmount(undefined);
    setSssDeduct(undefined);
    setPhilhealthDeduct(undefined);
    setHdmfDeduct(undefined);
  };
  
  const handleCreateOrUpdateDraft = async () => {
    if (!selectedFullEmployeeProfile) {
        toast({ variant: "destructive", title: "No Employee Selected", description: "Please select an employee before creating a draft."});
        return;
    }
    const newPayslip = await createPayslipObject(selectedFullEmployeeProfile.id);
    if (newPayslip) {
        setCalculatedPayslip(newPayslip);
        setIsApproving(true); // Using isApproving as a generic "saving" state
        try {
            const savedId = await addOrUpdatePayslipService(newPayslip);
            await loadInitialData(true); // Refresh all data from Firestore server
            
            toast({ 
                title: editingDraftId ? "Draft Updated" : "Draft Created", 
                description: `Draft for ${newPayslip.employeeName} has been saved.` 
            });

            resetForm();
        } catch(error) {
            console.error("Error saving draft:", error);
            toast({ variant: "destructive", title: "Save Error", description: "Could not save the draft to the database."});
        } finally {
            setIsApproving(false);
        }
    }
  };

  const handleEditDraft = (draft: Payslip) => {
    setEditingDraftId(draft.id);
    setSelectedEmployeeId(draft.employeeId);
    if(draft.payPeriod) {
        const [startStr, endStr] = draft.payPeriod.split(' - ');
        setStartDate(format(new Date(startStr), 'yyyy-MM-dd'));
        setEndDate(format(new Date(endStr), 'yyyy-MM-dd'));
    }
    setPayDateState(format(new Date(draft.payDate), 'yyyy-MM-dd'));
    setWorkDays(draft.workDaysSummary || []);
    setManualAdjustmentsAmount(draft.manualAdjustmentsAmount);
    setBonusAmount(draft.bonusAmount);
    setThirteenthMonthAmount(draft.thirteenthMonthAmount);
    setManualOtherEarningsAmount(draft.manualOtherEarningsAmount);
    setOvertimeMultiplier(draft.overtimeMultiplier);
    setRegularHolidayMultiplier(draft.regularHolidayMultiplier);
    setSpecialHolidayMultiplier(draft.specialHolidayMultiplier);
    setValeAmount(draft.valeAmount);
    setLoanAmount(draft.loanAmount);
    setSssDeduct(draft.sssDeductionValue);
    setPhilhealthDeduct(draft.philhealthDeductionValue);
    setHdmfDeduct(draft.hdmfDeductionValue);
    setCalculatedPayslip(draft);
  };
  
  const handleDeleteDraft = async (draftId: string) => {
    setIsApproving(true);
    try {
        await deletePayslipService(draftId);
        await loadInitialData(true);
        toast({ title: "Draft Deleted", variant: "destructive"});
    } catch(error) {
        console.error("Error deleting draft:", error);
        toast({ variant: "destructive", title: "Delete Error", description: "Could not delete the draft."});
    } finally {
        setIsApproving(false);
    }
  };

  const handleApproveDraft = async (draftId: string) => {
    const draftToApprove = draftPayslips.find(d => d.id === draftId);
    if (!draftToApprove) return;

    setIsApproving(true);
    try {
      await approvePayslipService(draftId);
      await loadInitialData(true); // Refresh data from firestore
      
      toast({ title: "Payslip Approved", description: `Payslip for ${draftToApprove.employeeName} has been finalized.`});
    } catch(error) {
      console.error("Error approving payslip:", error);
      toast({ variant: "destructive", title: "Approval Error", description: "Could not approve the payslip."});
    } finally {
      setIsApproving(false);
    }
  };

  const handleApproveAllDrafts = async () => {
    if (draftPayslips.length === 0) {
      toast({ title: "No Drafts", description: "There are no drafts to approve."});
      return;
    }
    setIsApproving(true);
    try {
      const approvalPromises = draftPayslips.map(draft => approvePayslipService(draft.id));
      await Promise.all(approvalPromises);

      await loadInitialData(true); 
      
      toast({ title: "All Drafts Approved", description: `${draftPayslips.length} payslips have been finalized.`});
    } catch(error) {
      console.error("Error approving all drafts:", error);
      toast({ variant: "destructive", title: "Bulk Approval Error", description: "Could not approve all drafts."});
    } finally {
      setIsApproving(false);
    }
  };

  const approvedPayslipEmployees = useMemo(() => {
    const employeeMap = new Map<string, string>(); // Key: employeeName, Value: employeeName
    approvedPayslips.forEach(ps => {
      if (!employeeMap.has(ps.employeeName)) {
        employeeMap.set(ps.employeeName, ps.employeeName);
      }
    });
    return Array.from(employeeMap.values()).sort((a, b) => a.localeCompare(b));
  }, [approvedPayslips]);

  const filteredApprovedPayslips = useMemo(() => {
    return approvedPayslips.filter(ps => {
      const matchesEmployee = approvedFilterEmployee === "all" || ps.employeeName === approvedFilterEmployee;
      const matchesSearch = ps.payPeriod.toLowerCase().includes(approvedSearchTerm.toLowerCase()) ||
                            ps.employeeName.toLowerCase().includes(approvedSearchTerm.toLowerCase());
      
      let matchesDate = true;
      if(approvedDateRange?.from && ps.payDate < startOfDay(approvedDateRange.from)) {
        matchesDate = false;
      }
      if(approvedDateRange?.to && ps.payDate > endOfDay(approvedDateRange.to)) {
        matchesDate = false;
      }

      return matchesEmployee && matchesSearch && matchesDate;
    });
  }, [approvedPayslips, approvedFilterEmployee, approvedSearchTerm, approvedDateRange]);

  const handleViewPayslip = (payslip: Payslip) => {
    setViewingPayslip(payslip);
    setIsViewPayslipModalOpen(true);
  };
  
  const handleOpenEmailModal = async (payslip: Payslip) => {
    setEmailIsGenerating(true);
    setIsEmailModalOpen(true);
    setEmailContent(null);
    
    const recipientOverride = process.env.NEXT_PUBLIC_PAYROLL_EMAIL_RECIPIENT_OVERRIDE;
    const recipientEmail = recipientOverride || payslip.employeeEmail || "";

    setEmailTarget({ name: payslip.employeeName, email: recipientEmail });
    
    try {
        const emailData = await generatePayslipEmail({
            employeeName: payslip.employeeName,
            payPeriod: payslip.payPeriod,
            companyName: payslip.companyInfo.name,
            netPay: payslip.netPay,
            payDate: payslip.payDate,
        });
        setEmailContent(emailData);
    } catch (error) {
        console.error("Failed to generate email content:", error);
        toast({
            variant: "destructive",
            title: "AI Error",
            description: "Could not generate email content. Please try again.",
        });
        setIsEmailModalOpen(false);
    } finally {
        setEmailIsGenerating(false);
    }
  };

  const handleSendEmail = () => {
    toast({
      title: "Email Sent (Simulated)",
      description: `An email has been 'sent' to ${emailTarget.email}.`,
    });
    setIsEmailModalOpen(false);
    setEmailContent(null);
  };


  const convertToDisplayData = (payslip: Payslip | null): TempPayslipData | null => {
    if (!payslip) return null;

    const deductionsList = [
      { description: "SSS Contribution", amount: payslip.sssDeductionValue },
      { description: "PhilHealth Contribution", amount: payslip.philhealthDeductionValue },
      { description: "Pag-IBIG (HDMF) Contribution", amount: payslip.hdmfDeductionValue },
      { description: "Tardiness", amount: payslip.tardinessDeductionValue },
      { description: "VALE / Advances", amount: payslip.valeAmount },
      { description: "Loan Payments", amount: payslip.loanAmount },
    ];
    if (payslip.manualAdjustmentsAmount < 0) {
        deductionsList.push({ description: "Other Deductions/Adjustments", amount: Math.abs(payslip.manualAdjustmentsAmount)});
    }

    return {
      payPeriod: payslip.payPeriod,
      dateIssued: format(new Date(payslip.payDate), "MMMM dd, yyyy"),
      companyName: payslip.companyInfo.name,
      companyAddress: payslip.companyInfo.address,
      companyContact: payslip.companyInfo.contact,
      companyLogoUrl: payslip.companyInfo.logoUrl,
      companyEstYear: payslip.companyInfo.establishmentYear,
      employeeName: payslip.employeeName,
      employeeId: payslip.employeeId,
      employeeEmail: payslip.employeeEmail,
      employeePosition: payslip.employeePosition || "N/A",
      employeeType: payslip.employeeType || "N/A",
      tin: payslip.employeeGovIds?.tin,
      sss: payslip.employeeGovIds?.sss,
      philhealth: payslip.employeeGovIds?.philhealth,
      pagibig: payslip.employeeGovIds?.pagibig,
      earnings: {
        standardPay: payslip.basicPay,
        overtimePay: payslip.overtimePayValue,
        regularHolidayPay: payslip.regularHolidayPayValue,
        specialHolidayPay: payslip.specialHolidayPayValue,
        regularHolidayOvertimePay: payslip.regularHolidayOvertimePay,
        specialHolidayOvertimePay: payslip.specialHolidayOvertimePay,
        bonus: payslip.bonusAmount || 0,
        thirteenthMonthAmount: payslip.thirteenthMonthAmount || 0,
        otherCompensations: (payslip.manualAdjustmentsAmount > 0 ? payslip.manualAdjustmentsAmount : 0) + (payslip.manualOtherEarningsAmount || 0),
      },
      totalEarnings: payslip.totalGrossPay,
      deductionsList: deductionsList.filter(d => d.amount > 0),
      totalDeductions: payslip.totalDeductions,
      netPay: payslip.netPay,
      ytdSummary: payslip.yearToDateSummary,
    };
  };

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    setSelectedPayslipIds([]);
  }, [approvedFilterEmployee, approvedSearchTerm, approvedDateRange]);

  const handleSelectAllPayslips = (checked: boolean | string) => {
    if (checked) {
      setSelectedPayslipIds(filteredApprovedPayslips.map(p => p.id));
    } else {
      setSelectedPayslipIds([]);
    }
  };

  const handleSelectSinglePayslip = (payslipId: string, checked: boolean | string) => {
    setSelectedPayslipIds(prev => {
      if (checked) {
        return [...prev, payslipId];
      } else {
        return prev.filter(id => id !== payslipId);
      }
    });
  };

  const isAllFilteredPayslipsSelected = useMemo(() => {
    return filteredApprovedPayslips.length > 0 && selectedPayslipIds.length === filteredApprovedPayslips.length;
  }, [filteredApprovedPayslips, selectedPayslipIds]);

  const handleDeleteSelectedPayslips = async () => {
    if (selectedPayslipIds.length === 0) {
      toast({ variant: "default", title: "No Payslips Selected", description: "Please select payslips to delete." });
      setIsDeleteConfirmOpen(false);
      return;
    }
    setIsDeletingPayslips(true);
    try {
      const deletePromises = selectedPayslipIds.map(id => deletePayslipService(id));
      await Promise.all(deletePromises);
      toast({ title: "Payslips Deleted", description: `Successfully deleted ${selectedPayslipIds.length} selected payslips.` });
      
      await loadInitialData(true);
      setSelectedPayslipIds([]);

    } catch (error) {
      console.error("Error deleting selected payslips:", error);
      toast({ variant: "destructive", title: "Deletion Error", description: "Could not delete all selected payslips." });
    } finally {
      setIsDeletingPayslips(false);
      setIsDeleteConfirmOpen(false);
    }
  };

  if (isLoading) {
    return (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <Tabs defaultValue="create" className="w-full space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="create">Create Payslip</TabsTrigger>
          <TabsTrigger value="drafts">Drafts ({draftPayslips.length})</TabsTrigger>
          <TabsTrigger value="approved">Approved Payslips</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
                <Card className="shadow-md">
                <CardHeader><CardTitle>Selection & Period</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <Label htmlFor="employeeSelect">Employee*</Label>
                        <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId} disabled={activeEmployees.length === 0}>
                            <SelectTrigger id="employeeSelect"><SelectValue placeholder={activeEmployees.length === 0 ? "No active employees" : "Select Employee"} /></SelectTrigger>
                            <SelectContent>
                            {activeEmployees.length > 0 ?
                                activeEmployees.map(emp => <SelectItem key={emp.id} value={emp.employeeId}>{emp.firstName} {emp.lastName} ({emp.employeeId})</SelectItem>) :
                                <SelectItem value="none" disabled>No active employees found.</SelectItem>
                            }
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1"><Label htmlFor="payDate">Pay Date (Date Issued)*</Label><Input id="payDate" type="date" value={payDateState} onChange={e => setPayDateState(e.target.value)} /></div>
                    <div className="space-y-1"><Label htmlFor="startDate">Pay Period Start Date*</Label><Input id="startDate" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
                    <div className="space-y-1"><Label htmlFor="endDate">Pay Period End Date*</Label><Input id="endDate" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
                </CardContent>
                </Card>

                <Card className="shadow-md">
                <CardHeader>
                    <CardTitle>Work Days & Hours</CardTitle>
                    <CardDescription>Populate work days for the period from Time Logs and approved leaves. Review and edit hours as needed.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <Button variant="outline" onClick={handleGenerateWorkDays} disabled={!selectedEmployeeId || !startDate || !endDate}>
                        {(isLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Generate/Refresh Work Days
                    </Button>
                    <div className="relative border rounded-md h-[400px] overflow-hidden">
                        <div className="h-full w-full overflow-auto">
                            <Table>
                                <TableHeader className="sticky top-0 bg-background z-10">
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Reg Hrs</TableHead>
                                    <TableHead>OT Hrs</TableHead>
                                    <TableHead>Tardy (Mins)</TableHead>
                                    <TableHead>Reg Hol Hrs</TableHead>
                                    <TableHead>Spec Hol Hrs</TableHead>
                                    <TableHead>Reg Hol OT</TableHead>
                                    <TableHead>Spec Hol OT</TableHead>
                                    <TableHead>Rest Day?</TableHead>
                                </TableRow>
                                </TableHeader>
                                <TableBody>
                                {workDays.length > 0 ? workDays.map((day, index) => (
                                <TableRow key={`${day.date}-${index}`}>
                                    <TableCell>{format(parseISO(day.date), "MMM dd, eee")}</TableCell>
                                    <TableCell><Input type="number" value={day.regHrs} onChange={e => { const newHrs = parseFloat(e.target.value) || 0; setWorkDays(wd => wd.map((d, i) => i === index ? {...d, regHrs: newHrs} : d)); }} className="w-20 h-8"/></TableCell>
                                    <TableCell><Input type="number" value={day.otHrs} onChange={e => { const newHrs = parseFloat(e.target.value) || 0; setWorkDays(wd => wd.map((d, i) => i === index ? {...d, otHrs: newHrs} : d)); }} className="w-20 h-8"/></TableCell>
                                    <TableCell><Input type="number" value={day.tardyMins} onChange={e => { const newMins = parseInt(e.target.value) || 0; setWorkDays(wd => wd.map((d, i) => i === index ? {...d, tardyMins: newMins} : d)); }} className="w-20 h-8"/></TableCell>
                                    <TableCell><Input type="number" value={day.regHol} onChange={e => { const newHrs = parseFloat(e.target.value) || 0; setWorkDays(wd => wd.map((d, i) => i === index ? {...d, regHol: newHrs} : d)); }} className="w-20 h-8"/></TableCell>
                                    <TableCell><Input type="number" value={day.specHol} onChange={e => { const newHrs = parseFloat(e.target.value) || 0; setWorkDays(wd => wd.map((d, i) => i === index ? {...d, specHol: newHrs} : d)); }} className="w-20 h-8"/></TableCell>
                                    <TableCell><Input type="number" value={day.regHolOtHrs || 0} onChange={e => { const newHrs = parseFloat(e.target.value) || 0; setWorkDays(wd => wd.map((d, i) => i === index ? {...d, regHolOtHrs: newHrs} : d)); }} className="w-20 h-8"/></TableCell>
                                    <TableCell><Input type="number" value={day.specHolOtHrs || 0} onChange={e => { const newHrs = parseFloat(e.target.value) || 0; setWorkDays(wd => wd.map((d, i) => i === index ? {...d, specHolOtHrs: newHrs} : d)); }} className="w-20 h-8"/></TableCell>
                                    <TableCell><Input type="checkbox" checked={day.restDay === 1} onChange={e => { const newRestDay = e.target.checked ? 1 : 0; setWorkDays(wd => wd.map((d, i) => i === index ? {...d, restDay: newRestDay} : d)); }}/></TableCell>
                                </TableRow>
                                ))
                                : <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-4">Generate work days or add them manually to calculate payslip.</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </CardContent>
                </Card>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="shadow-md">
                        <CardHeader><CardTitle>Additional Earnings & Multipliers</CardTitle><CardDescription>Manually enter values for this specific payslip.</CardDescription></CardHeader>
                        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1"><Label htmlFor="manualAdjustmentsAmount">Adjustments (+/-)</Label><Input id="manualAdjustmentsAmount" type="number" placeholder="0.00" value={manualAdjustmentsAmount ?? ""} onChange={e => setManualAdjustmentsAmount(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></div>
                            <div className="space-y-1"><Label htmlFor="bonusAmount">Bonuses</Label><Input id="bonusAmount" type="number" placeholder="0.00" value={bonusAmount ?? ""} onChange={e => setBonusAmount(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></div>
                            <div className="space-y-1 sm:col-span-2"><Label htmlFor="thirteenthMonthAmount">13th Month Pay</Label><Input id="thirteenthMonthAmount" type="number" placeholder="0.00" value={thirteenthMonthAmount ?? ""} onChange={e => setThirteenthMonthAmount(e.target.value === '' ? undefined : parseFloat(e.target.value))} disabled={isAutoCalculating13thMonth} /></div>
                            <div className="space-y-1 sm:col-span-2"><Label htmlFor="manualOtherEarningsAmount">Other Earnings</Label><Input id="manualOtherEarningsAmount" type="number" placeholder="0.00" value={manualOtherEarningsAmount ?? ""} onChange={e => setManualOtherEarningsAmount(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></div>

                            <div className="sm:col-span-2"><hr className="my-2"/></div>
                            
                            <div className="space-y-1"><Label htmlFor="overtimeMultiplier">Overtime Multiplier</Label><Input id="overtimeMultiplier" type="number" placeholder="e.g., 1.25" value={overtimeMultiplier ?? ""} onChange={e => setOvertimeMultiplier(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></div>
                            <div className="space-y-1"><Label htmlFor="regularHolidayMultiplier">Regular Holiday Multiplier</Label><Input id="regularHolidayMultiplier" type="number" placeholder="e.g., 2.0" value={regularHolidayMultiplier ?? ""} onChange={e => setRegularHolidayMultiplier(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></div>
                            <div className="space-y-1"><Label htmlFor="specialHolidayMultiplier">Special Holiday Multiplier</Label><Input id="specialHolidayMultiplier" type="number" placeholder="e.g., 1.3" value={specialHolidayMultiplier ?? ""} onChange={e => setSpecialHolidayMultiplier(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-md">
                        <CardHeader><CardTitle>Deductions</CardTitle><CardDescription>Leave fields blank to use employee's profile settings.</CardDescription></CardHeader>
                        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1"><Label htmlFor="valeAmount">VALE (Cash Advance)</Label><Input id="valeAmount" type="number" placeholder="0.00" value={valeAmount ?? ""} onChange={e => setValeAmount(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></div>
                            <div className="space-y-1"><Label htmlFor="loanAmount">Loan Payments</Label><Input id="loanAmount" type="number" placeholder="0.00" value={loanAmount ?? ""} onChange={e => setLoanAmount(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></div>

                            <div className="sm:col-span-2"><hr className="my-2"/></div>

                            <div className="space-y-1"><Label htmlFor="sssDeduct">SSS Deduction</Label><Input id="sssDeduct" type="number" placeholder="0.00" value={sssDeduct ?? ""} onChange={e => setSssDeduct(e.target.value === '' ? undefined : parseFloat(e.target.value))} title="Leave blank to use profile setting. Enter 0 to override."/></div>
                            <div className="space-y-1"><Label htmlFor="philhealthDeduct">PhilHealth Deduction</Label><Input id="philhealthDeduct" type="number" placeholder="0.00" value={philhealthDeduct ?? ""} onChange={e => setPhilhealthDeduct(e.target.value === '' ? undefined : parseFloat(e.target.value))} title="Leave blank to use profile setting. Enter 0 to override."/></div>
                            <div className="space-y-1"><Label htmlFor="hdmfDeduct">HDMF (Pag-IBIG) Deduction</Label><Input id="hdmfDeduct" type="number" placeholder="0.00" value={hdmfDeduct ?? ""} onChange={e => setHdmfDeduct(e.target.value === '' ? undefined : parseFloat(e.target.value))} title="Leave blank to use profile setting. Enter 0 to override."/></div>
                        </CardContent>
                    </Card>
                </div>
            </div>
            
            <div className="xl:col-span-1">
                <Card className="shadow-md sticky top-6">
                    <CardHeader>
                        <CardTitle>Payslip Summary & Actions</CardTitle>
                        <CardDescription>Review final totals. YTD is illustrative.</CardDescription>
                    </CardHeader>
                    <CardContent>
                    <div className="space-y-2 max-h-[calc(100vh-12rem)] overflow-y-auto">
                    {calculatedPayslip ? (<PayslipDisplay payslip={convertToDisplayData(calculatedPayslip)!} companyLogo={companySettings?.companyLogoUrl} />
                                        ) : <p className="text-sm text-muted-foreground text-center py-10">Complete selections and click 'Calculate & Create Draft'.</p>}
                                        </div>
                    </CardContent>
                    <CardFooter className="flex-col space-y-2">
                        <Button className="w-full bg-primary hover:bg-primary/90" onClick={handleCreateOrUpdateDraft} disabled={!selectedEmployeeId || workDays.length === 0 || isLoading || isLoadingHistory}>
                            {(isLoading || isLoadingHistory || isApproving) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editingDraftId ? 'Update Draft' : 'Calculate & Create Draft'}
                        </Button>
                        {editingDraftId && <Button variant="outline" className="w-full" onClick={resetForm}>Cancel Editing</Button>}
                    </CardFooter>
                </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="drafts">
           <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Draft Payslips</CardTitle>
              <CardDescription>Review, edit, or approve payslips before finalizing them. These are saved in the database.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-end mb-4">
                <Button onClick={handleApproveAllDrafts} disabled={draftPayslips.length === 0 || isApproving}>
                  {isApproving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Approve All ({draftPayslips.length})
                </Button>
              </div>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee Name</TableHead>
                    <TableHead>Pay Period</TableHead>
                    <TableHead>Pay Date</TableHead>
                    <TableHead className="text-right">Net Pay</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow> :
                  draftPayslips.length > 0 ? draftPayslips.map(ps => (
                    <TableRow key={ps.id}>
                      <TableCell>{ps.employeeName}</TableCell>
                      <TableCell>{ps.payPeriod}</TableCell>
                      <TableCell>{format(new Date(ps.payDate), "MMMM dd, yyyy")}</TableCell>
                      <TableCell className="text-right">{formatCurrencyPhp(ps.netPay)}</TableCell>
                      <TableCell className="flex gap-1 items-center justify-center">
                        <Button variant="ghost" size="icon" onClick={() => handleEditDraft(ps)} title="Edit Draft"><Edit size={16} /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleApproveDraft(ps.id)} title="Approve Draft" className="text-green-600 hover:text-green-500" disabled={isApproving}><CheckCircle size={16} /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteDraft(ps.id)} title="Delete Draft" className="text-destructive hover:text-destructive/80" disabled={isApproving}><Trash2 size={16} /></Button>
                      </TableCell>
                    </TableRow>
                  )) : <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">No draft payslips to show.</TableCell></TableRow>}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approved" className="space-y-6">
          <Card className="shadow-md">
            <CardHeader><CardTitle>Approved Payslips</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-2 mb-4">
                <Select value={approvedFilterEmployee} onValueChange={setApprovedFilterEmployee} disabled={approvedPayslipEmployees.length === 0}>
                  <SelectTrigger className="w-full md:w-[200px]"><SelectValue placeholder="All Employees" /></SelectTrigger>
                  <SelectContent>
                      <SelectItem value="all">All Employees</SelectItem>
                      {approvedPayslipEmployees.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant={"outline"}
                            className={cn("w-full md:w-[280px] justify-start text-left font-normal", !approvedDateRange && "text-muted-foreground")}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {approvedDateRange?.from ? (
                                approvedDateRange.to ? (
                                    `${format(approvedDateRange.from, "LLL dd, y")} - ${format(approvedDateRange.to, "LLL dd, y")}`
                                ) : (
                                    format(approvedDateRange.from, "LLL dd, y")
                                )
                            ) : (
                                <span>Filter by pay date</span>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                        <Calendar mode="range" selected={approvedDateRange} onSelect={setApprovedDateRange} initialFocus />
                    </PopoverContent>
                </Popover>
                <Input placeholder="Search Name or Pay Period..." className="flex-1" value={approvedSearchTerm} onChange={e => setApprovedSearchTerm(e.target.value)}/>
                <Button variant="outline" onClick={() => {setApprovedFilterEmployee("all"); setApprovedSearchTerm(""); setApprovedDateRange(undefined);}}><XCircle size={16} className="mr-1"/>Clear</Button>
                <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      disabled={selectedPayslipIds.length === 0 || isDeletingPayslips}
                    >
                      {isDeletingPayslips && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <Trash2 className="mr-2 h-4 w-4" /> Delete ({selectedPayslipIds.length})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the selected {selectedPayslipIds.length} payslip(s).
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isDeletingPayslips}>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteSelectedPayslips} disabled={isDeletingPayslips} className="bg-destructive hover:bg-destructive/90">
                        {isDeletingPayslips && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={isAllFilteredPayslipsSelected}
                        onCheckedChange={handleSelectAllPayslips}
                        aria-label="Select all visible payslips"
                        disabled={filteredApprovedPayslips.length === 0}
                      />
                    </TableHead>
                    <TableHead>Employee Name</TableHead>
                    <TableHead>Pay Period</TableHead>
                    <TableHead>Pay Date</TableHead>
                    <TableHead className="text-right">Net Pay</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow> :
                  filteredApprovedPayslips.length > 0 ? filteredApprovedPayslips.map(ps => (
                    <TableRow key={ps.id} data-state={selectedPayslipIds.includes(ps.id) ? "selected" : ""}>
                       <TableCell>
                        <Checkbox
                          checked={selectedPayslipIds.includes(ps.id)}
                          onCheckedChange={(checked) => handleSelectSinglePayslip(ps.id, checked)}
                          aria-label={`Select payslip for ${ps.employeeName}`}
                        />
                      </TableCell>
                      <TableCell>{ps.employeeName}</TableCell><TableCell>{ps.payPeriod}</TableCell><TableCell>{format(new Date(ps.payDate), "MMMM dd, yyyy")}</TableCell><TableCell className="text-right">{formatCurrencyPhp(ps.netPay)}</TableCell>
                      <TableCell className="flex gap-1 items-center justify-center">
                        <Button variant="ghost" size="icon" onClick={() => handleViewPayslip(ps)} title="View Payslip (Opens Modal)"><Eye size={16} /></Button>
                          <Button variant="ghost" size="icon"
                          onClick={() => handleOpenEmailModal(ps)}
                          title="Email Payslip">
                          <Mail size={16} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )) : <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4">No approved payslips found matching your criteria.</TableCell></TableRow>}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isViewPayslipModalOpen} onOpenChange={setIsViewPayslipModalOpen}>
        <DialogContent className="max-w-3xl p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle>Payslip: {viewingPayslip?.employeeName}</DialogTitle>
            <DialogDescription>Pay Period: {viewingPayslip?.payPeriod} | Issued: {viewingPayslip ? format(new Date(viewingPayslip.payDate), "MMMM dd, yyyy") : ""}</DialogDescription>
          </DialogHeader>
          <div className="py-4 px-2 max-h-[75vh] overflow-y-auto">
             <div ref={componentToPrintRef}>
                {viewingPayslip && <PayslipDisplay payslip={convertToDisplayData(viewingPayslip)!} companyLogo={companySettings?.companyLogoUrl} />}
             </div>
          </div>
          <DialogFooter className="p-6 pt-4 border-t bg-background">
            <Button variant="outline" onClick={() => setIsViewPayslipModalOpen(false)}>Close</Button>
            <Button variant="default" onClick={handleDownloadPdf} disabled={isDownloadingPdf}>
              {isDownloadingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Download size={16} className="mr-2"/>}
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isEmailModalOpen} onOpenChange={setIsEmailModalOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Confirm Payslip Email</DialogTitle>
            <DialogDescription>
              Review the generated email content before sending it to {emailTarget.name} at{' '}
              <span className="font-medium">{emailTarget.email}</span>.
            </DialogDescription>
          </DialogHeader>
          {emailIsGenerating ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : emailContent ? (
            <div className="space-y-4 py-4">
              <div className="space-y-1">
                <Label htmlFor="email-subject">Subject</Label>
                <Input id="email-subject" readOnly value={emailContent.subject} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email-body">Body</Label>
                <Textarea
                  id="email-body"
                  readOnly
                  value={emailContent.body}
                  className="h-48 resize-none"
                />
              </div>
            </div>
          ) : (
             <div className="flex items-center justify-center h-48 text-muted-foreground">
                Failed to generate email content.
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEmailModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendEmail} disabled={emailIsGenerating || !emailContent}>
              <Send className="mr-2 h-4 w-4" />
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
