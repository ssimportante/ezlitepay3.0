
"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Eye, Filter, FileSpreadsheet, Loader2, Download, TrendingDown, Landmark } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrencyPhp } from "@/lib/utils";
import { PayslipDisplay } from "@/components/common/payslip-display";
import type { Payslip, TempPayslipData } from "@/app/(app)/payroll/page"; 
import { getEmployeesService } from "@/lib/firebase/firestore-services/employee-service"; 
import type { Employee as FullEmployeeType } from "@/app/(app)/employees/components/employee-types";
import { format, getYear, parseISO, isValid, addDays, startOfYear, startOfMonth, isSameDay, setHours, setMinutes, setSeconds, setMilliseconds, startOfDay, differenceInMinutes, endOfDay } from "date-fns";
import { useAuth } from "@/contexts/auth-context";
import { getPayslipsService } from "@/lib/firebase/firestore-services/payslip-service";
import { getCompanySettings, type CompanySettings } from "@/lib/firebase/firestore-services/company-service";
import { getTimeLogEventsService, type TimeLogEvent } from "@/lib/firebase/firestore-services/time-log-service";
import { getSchedulesService } from "@/lib/firebase/firestore-services/schedule-service";
import type { Schedule } from "@/types/schedule";
import { PesoSignIcon } from "@/components/icons/peso-sign-icon";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";


export function PayrollHistoryReport() {
  const { toast } = useToast();
  const { user, loading: isAuthLoading } = useAuth();
  const [allEmployees, setAllEmployees] = useState<FullEmployeeType[]>([]);
  const [history, setHistory] = useState<Payslip[]>([]); 
  const [allTimeLogs, setAllTimeLogs] = useState<TimeLogEvent[]>([]);
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);

  const [isLoading, setIsLoading] = useState(true);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("all");
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingPayslip, setViewingPayslip] = useState<Payslip | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  
  const componentToPrintRef = useRef<HTMLDivElement>(null);

  const [summaryPeriod, setSummaryPeriod] = useState<'mtd' | 'ytd'>('mtd');


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


  useEffect(() => {
    async function loadInitialData() {
      if(!user || isAuthLoading) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      console.log("[PayrollHistoryReport] Fetching initial data...");
      try {
        const [fetchedEmployees, fetchedPayslips, fetchedCompanySettings, fetchedTimeLogs, fetchedSchedules] = await Promise.all([
            getEmployeesService(),
            getPayslipsService(),
            getCompanySettings(),
            getTimeLogEventsService({}), // Fetch all for accurate calculations
            getSchedulesService({})
        ]);
        
        setAllEmployees(fetchedEmployees);
        setHistory(fetchedPayslips);
        setCompanySettings(fetchedCompanySettings);
        setAllTimeLogs(fetchedTimeLogs);
        setAllSchedules(fetchedSchedules);

        console.log(`[PayrollHistoryReport] Fetched ${fetchedEmployees.length} employees, ${fetchedPayslips.length} payslips, ${fetchedTimeLogs.length} logs, and ${fetchedSchedules.length} schedules.`);
      } catch (error) {
        console.error("[PayrollHistoryReport] Failed to load initial data:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not load initial report data." });
      } finally {
        setIsLoading(false);
        console.log("[PayrollHistoryReport] Finished loading initial data attempt.");
      }
    }
    loadInitialData();
  }, [toast, user, isAuthLoading]); 

  const filteredHistory = useMemo(() => {
    if (isLoading) return [];
    return history.filter(payslip => {
      const matchesEmployee = selectedEmployeeId === "all" || payslip.employeeId === selectedEmployeeId;
      
      let payslipDateValid = true;
      if (startDate || endDate) {
        try {
          let payslipDate = new Date(payslip.payDate);
          
          if (!isValid(payslipDate)) {
             payslipDateValid = false;
          } else {
            const sDate = startDate ? addDays(parseISO(startDate), -1) : null;
            const eDate = endDate ? addDays(parseISO(endDate), 1) : null;

            if (sDate && isValid(sDate) && (payslipDate < sDate)) payslipDateValid = false;
            if (eDate && isValid(eDate) && (payslipDate > eDate)) payslipDateValid = false;
          }
        } catch (e) {
          payslipDateValid = false; 
        }
      }
      return matchesEmployee && payslipDateValid;
    });
  }, [history, startDate, endDate, selectedEmployeeId, isLoading]);

  const summaryStats = useMemo(() => {
    const now = new Date();
    const startOfPeriod = summaryPeriod === 'mtd' ? startOfMonth(now) : startOfYear(now);

    const relevantPayslips = history.filter(ps => {
        const payDate = new Date(ps.payDate);
        return payDate >= startOfPeriod && payDate <= now;
    });

    const totalNetPaid = relevantPayslips.reduce((acc, ps) => acc + ps.netPay, 0);
    const totalSSS = relevantPayslips.reduce((acc, ps) => acc + ps.sssDeductionValue, 0);
    const totalPhilHealth = relevantPayslips.reduce((acc, ps) => acc + ps.philhealthDeductionValue, 0);
    const totalHDMF = relevantPayslips.reduce((acc, ps) => acc + ps.hdmfDeductionValue, 0);

    let totalSavedOnTardiness = 0;
    
    const relevantTimeLogs = allTimeLogs.filter(log => {
        const logDate = new Date(log.dateTime);
        return log.status === 'Clock In' && logDate >= startOfPeriod && logDate <= now;
    });

    relevantTimeLogs.forEach(log => {
        const employee = allEmployees.find(e => e.employeeId === log.employeeId);
        const schedule = allSchedules.find(s => s.employeeId === log.employeeId && isSameDay(s.date, log.dateTime));

        if (employee && schedule && schedule.timeIn) {
            const [hoursStr, minutesStr] = schedule.timeIn.split(':');
            const scheduledTimeIn = setMilliseconds(setSeconds(setMinutes(setHours(startOfDay(log.dateTime), parseInt(hoursStr, 10)), parseInt(minutesStr, 10)),0),0);
            
            if (log.dateTime > scheduledTimeIn) {
                const lateMinutes = differenceInMinutes(log.dateTime, scheduledTimeIn);
                if (lateMinutes > 0) {
                  const hourlyRate = (employee.salaryType === 'Daily' && employee.basicSalary > 0 ? employee.basicSalary / 8 : (employee.salaryType === 'Monthly' && employee.basicSalary > 0 ? employee.basicSalary / (22 * 8) : 0));
                  const savedAmount = (lateMinutes / 60) * hourlyRate;
                  totalSavedOnTardiness += savedAmount;
                }
            }
        }
    });

    return {
        totalNetPaid,
        totalSSS,
        totalPhilHealth,
        totalHDMF,
        totalSavedOnTardiness,
    };
  }, [history, summaryPeriod, allTimeLogs, allEmployees, allSchedules]);


  const handleViewPayslip = (payslip: Payslip) => {
    setViewingPayslip(payslip);
    setIsViewModalOpen(true);
  };
  

  const convertToDisplayData = (payslip: Payslip | null): TempPayslipData | null => {
    if (!payslip) return null;
    const otherCompensationsForDisplay =
      (payslip.manualAdjustmentsAmount > 0 ? payslip.manualAdjustmentsAmount : 0) +
      (payslip.manualOtherEarningsAmount || 0);

    const deductionsList = [
      { description: "SSS Contribution", amount: payslip.sssDeductionValue },
      { description: "PhilHealth Contribution", amount: payslip.philhealthDeductionValue },
      { description: "Pag-IBIG (HDMF) Contribution", amount: payslip.hdmfDeductionValue },
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
        bonus: payslip.bonusAmount,
        thirteenthMonthAmount: payslip.thirteenthMonthAmount || 0,
        otherCompensations: otherCompensationsForDisplay,
      },
      totalEarnings: payslip.totalGrossPay,
      deductionsList: deductionsList.filter(d => d.amount > 0),
      totalDeductions: payslip.totalDeductions,
      netPay: payslip.netPay,
      ytdSummary: payslip.yearToDateSummary,
    };
  };

  const handleExportToCSV = () => {
    if (filteredHistory.length === 0) {
      toast({ variant: "destructive", title: "No Data", description: "No data to export." });
      return;
    }
    const headers = ["Employee ID", "Employee Name", "Pay Period", "Pay Date", "Gross Pay", "Total Deductions", "Net Pay"];
    const rows = filteredHistory.map(p => [
      p.employeeId,
      p.employeeName,
      `"${p.payPeriod.replace(/"/g, '""')}"`,
      format(new Date(p.payDate), "yyyy-MM-dd"), 
      p.totalGrossPay.toFixed(2),
      p.totalDeductions.toFixed(2),
      p.netPay.toFixed(2)
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n" 
      + rows.map(e => e.join(",")).join("\n");
    
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", "payroll_history_report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Export Successful", description: "Payroll history exported to CSV." });
  };
  
  const isDataLoading = isLoading || isAuthLoading;

  return (
    <>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">Payroll History Report</CardTitle>
          <CardDescription>View and filter historical payroll records.</CardDescription>
        </CardHeader>
        <CardContent>
          <Card className="shadow-md mb-6">
              <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div>
                      <CardTitle>Payroll Summary</CardTitle>
                      <CardDescription>Summary of key payroll metrics for the selected period.</CardDescription>
                  </div>
                  <Select value={summaryPeriod} onValueChange={(val) => setSummaryPeriod(val as 'mtd' | 'ytd')}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Select period" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mtd">Month to Date</SelectItem>
                      <SelectItem value="ytd">Year to Date</SelectItem>
                    </SelectContent>
                  </Select>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <Card className="p-4 bg-blue-50 border-blue-200">
                    <CardTitle className="text-sm font-medium text-blue-800 flex items-center"><PesoSignIcon className="mr-2 h-5 w-5"/>Total Net Paid</CardTitle>
                    <p className="text-3xl font-bold text-blue-900">{formatCurrencyPhp(summaryStats.totalNetPaid)}</p>
                  </Card>
                  <Card className="p-4 bg-green-50 border-green-200">
                    <CardTitle className="text-sm font-medium text-green-800 flex items-center"><TrendingDown className="mr-2 h-5 w-5"/>Saved on Tardiness</CardTitle>
                    <p className="text-3xl font-bold text-green-900">{formatCurrencyPhp(summaryStats.totalSavedOnTardiness)}</p>
                  </Card>
                  <Card className="p-4 bg-gray-50 border-gray-200 md:col-span-2 lg:col-span-1">
                      <CardTitle className="text-sm font-medium text-gray-800 flex items-center"><Landmark className="mr-2 h-5 w-5"/>Total Contributions</CardTitle>
                      <div className="text-sm mt-2 space-y-1 text-gray-700">
                          <div className="flex justify-between"><span>SSS:</span> <span className="font-medium">{formatCurrencyPhp(summaryStats.totalSSS)}</span></div>
                          <div className="flex justify-between"><span>PhilHealth:</span> <span className="font-medium">{formatCurrencyPhp(summaryStats.totalPhilHealth)}</span></div>
                          <div className="flex justify-between"><span>Pag-IBIG:</span> <span className="font-medium">{formatCurrencyPhp(summaryStats.totalHDMF)}</span></div>
                      </div>
                  </Card>
              </CardContent>
          </Card>

          <div className="flex flex-col md:flex-row gap-4 mb-6 p-4 border rounded-md bg-muted/30">
            <div className="flex-1 space-y-2">
              <label htmlFor="prh-startDate" className="text-sm font-medium">Start Date (Pay Date)</label>
              <Input id="prh-startDate" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} disabled={isDataLoading}/>
            </div>
            <div className="flex-1 space-y-2">
              <label htmlFor="prh-endDate" className="text-sm font-medium">End Date (Pay Date)</label>
              <Input id="prh-endDate" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} disabled={isDataLoading}/>
            </div>
            <div className="flex-1 space-y-2">
              <label htmlFor="prh-employee" className="text-sm font-medium">Employee</label>
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId} disabled={isDataLoading || allEmployees.length === 0}>
                <SelectTrigger id="prh-employee"><SelectValue placeholder={allEmployees.length === 0 ? "No Employees" : "All Employees"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {allEmployees.map(emp => <SelectItem key={emp.employeeId} value={emp.employeeId}>{emp.firstName} {emp.lastName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={handleExportToCSV} className="w-full md:w-auto" disabled={isDataLoading || filteredHistory.length === 0}>
                <FileSpreadsheet size={16} className="mr-2" /> Export CSV
              </Button>
            </div>
          </div>

          {isDataLoading ? <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div> : 
          <div className="overflow-auto border rounded-md max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Pay Period</TableHead>
                  <TableHead>Date Issued</TableHead>
                  <TableHead className="text-right">Gross Pay</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net Pay</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHistory.length > 0 ? filteredHistory.map(payslip => (
                  <TableRow key={payslip.id}>
                    <TableCell>{payslip.employeeName} ({payslip.employeeId})</TableCell>
                    <TableCell>{payslip.payPeriod}</TableCell>
                    <TableCell>{format(new Date(payslip.payDate), "MMMM dd, yyyy")}</TableCell>
                    <TableCell className="text-right">{formatCurrencyPhp(payslip.totalGrossPay)}</TableCell>
                    <TableCell className="text-right">{formatCurrencyPhp(payslip.totalDeductions)}</TableCell>
                    <TableCell className="text-right">{formatCurrencyPhp(payslip.netPay)}</TableCell>
                    <TableCell className="text-center space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => handleViewPayslip(payslip)} title="View Payslip">
                        <Eye size={16} />
                      </Button>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No payroll records found for the selected criteria.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          }
        </CardContent>
      </Card>
      
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
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
            <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>Close</Button>
             <Button variant="default" onClick={handleDownloadPdf} disabled={isDownloadingPdf}>
              {isDownloadingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Download size={16} className="mr-2"/>}
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
