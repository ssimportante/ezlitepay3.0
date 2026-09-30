
"use client";

import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSpreadsheet, Briefcase, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getEmployeesService } from "@/lib/firebase/firestore-services/employee-service"; 
import type { Employee as FullEmployeeType } from "@/app/(app)/employees/components/employee-types";
import { getLeaveRequestsService, updateLeaveRequestStatus as updateLeaveRequestStatusService } from "@/lib/firebase/firestore-services/leave-service";
import type { LeaveRequest, LeaveRequestStatus, LeaveType } from "@/types/leave";
import { format, parseISO, isValid, addDays } from "date-fns";
import { useAuth } from "@/contexts/auth-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const leaveTypes: LeaveType[] = ["Vacation", "Sick", "Personal", "Unpaid", "Paid", "Emergency"];
const leaveStatuses: LeaveRequestStatus[] = ["Pending", "Approved", "Rejected"];

export function LeaveReport() {
  const { toast } = useToast();
  const { user, loading: isAuthLoading } = useAuth();
  const [allEmployees, setAllEmployees] = useState<FullEmployeeType[]>([]);
  const [records, setRecords] = useState<LeaveRequest[]>([]); 
  const [isLoading, setIsLoading] = useState(true);

  const [startDateFilter, setStartDateFilter] = useState(""); 
  const [endDateFilter, setEndDateFilter] = useState("");   
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("all");
  const [selectedLeaveType, setSelectedLeaveType] = useState<LeaveType | "all">("all");
  const [selectedStatus, setSelectedStatus] = useState<LeaveRequestStatus | "all">("all");

  const fetchLeaveData = async () => {
    setIsLoading(true);
    try {
      const [employees, leaveRequests] = await Promise.all([
        getEmployeesService(),
        getLeaveRequestsService()
      ]);
      setAllEmployees(employees);
      setRecords(leaveRequests);
    } catch (error) {
      console.error("[LeaveReport] Failed to load initial data:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load report data." });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if(!user || isAuthLoading) {
      setIsLoading(false);
      return;
    }
    fetchLeaveData();
  }, [user, isAuthLoading]); 

  const filteredRecords = useMemo(() => {
    return records.filter(record => {
      const matchesEmployee = selectedEmployeeId === "all" || record.employeeId === selectedEmployeeId;
      const matchesLeaveType = selectedLeaveType === "all" || record.leaveType === selectedLeaveType;
      const matchesStatus = selectedStatus === "all" || record.status === selectedStatus;
      
      let recordDateValid = true;
      if (startDateFilter || endDateFilter) {
         try {
          const recordStartDate = record.startDate;
          const recordEndDate = record.endDate;
          if (!isValid(recordStartDate) || !isValid(recordEndDate)) { recordDateValid = false; } 
          else {
            const sDate = startDateFilter ? parseISO(startDateFilter) : null;
            const eDate = endDateFilter ? parseISO(endDateFilter) : null;
            if (sDate && isValid(sDate) && recordEndDate < sDate) recordDateValid = false;
            if (eDate && isValid(eDate) && recordStartDate > addDays(eDate,0)) recordDateValid = false;
          }
        } catch (e) { recordDateValid = false; }
      }
      return matchesEmployee && matchesLeaveType && matchesStatus && recordDateValid;
    });
  }, [records, startDateFilter, endDateFilter, selectedEmployeeId, selectedLeaveType, selectedStatus]);
  
  const handleExportToCSV = () => {
    if (filteredRecords.length === 0) {
      toast({ variant: "destructive", title: "No Data", description: "No data to export for the current filters." });
      return;
    }
    const headers = ["Employee ID", "Employee Name", "Leave Type", "Start Date", "End Date", "Status", "Reason"];
    const rows = filteredRecords.map(r => [
      `"${r.employeeId}"`, `"${r.employeeName}"`, `"${r.leaveType}"`, `"${format(r.startDate, "yyyy-MM-dd")}"`, `"${format(r.endDate, "yyyy-MM-dd")}"`, `"${r.status}"`, `"${(r.reason || "").replace(/,/g, ";")}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", "leave_report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Export Successful", description: "Leave report exported to CSV." });
  };

  const handleUpdateStatus = async (id: string, status: LeaveRequestStatus) => {
    try {
      await updateLeaveRequestStatusService(id, status);
      toast({ title: "Status Updated", description: `Leave request has been ${status.toLowerCase()}.` });
      fetchLeaveData(); // Refresh data
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message || "Could not update leave status." });
    }
  };

  const isDataLoading = isLoading || isAuthLoading;

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Leave Report</CardTitle>
        <CardDescription>Review and manage employee leave requests.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 p-4 border rounded-md bg-muted/30">
          <div className="space-y-2">
            <label htmlFor="leave-startDate" className="text-sm font-medium">Start Date</label>
            <Input id="leave-startDate" type="date" value={startDateFilter} onChange={e => setStartDateFilter(e.target.value)} disabled={isDataLoading}/>
          </div>
          <div className="space-y-2">
            <label htmlFor="leave-endDate" className="text-sm font-medium">End Date</label>
            <Input id="leave-endDate" type="date" value={endDateFilter} onChange={e => setEndDateFilter(e.target.value)} disabled={isDataLoading}/>
          </div>
          <div className="space-y-2">
            <label htmlFor="leave-employee" className="text-sm font-medium">Employee</label>
            <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId} disabled={isDataLoading || allEmployees.length === 0}>
              <SelectTrigger id="leave-employee"><SelectValue placeholder={allEmployees.length === 0 ? "No Employees" : "All Employees"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {allEmployees.map(emp => <SelectItem key={emp.employeeId} value={emp.employeeId}>{emp.firstName} {emp.lastName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label htmlFor="leave-type" className="text-sm font-medium">Leave Type</label>
            <Select value={selectedLeaveType} onValueChange={(v) => setSelectedLeaveType(v as LeaveType | "all")} disabled={isDataLoading}>
              <SelectTrigger id="leave-type"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {leaveTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label htmlFor="leave-status" className="text-sm font-medium">Status</label>
            <Select value={selectedStatus} onValueChange={(v) => setSelectedStatus(v as LeaveRequestStatus | "all")} disabled={isDataLoading}>
              <SelectTrigger id="leave-status"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {leaveStatuses.map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={handleExportToCSV} className="w-full" disabled={isDataLoading || filteredRecords.length === 0}>
              <FileSpreadsheet size={16} className="mr-2" /> Export CSV
            </Button>
          </div>
        </div>

        {isDataLoading ? <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div> : 
        <div className="overflow-auto border rounded-md max-h-[400px]">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Leave Type</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRecords.length > 0 ? filteredRecords.map(record => (
                <TableRow key={record.id}>
                  <TableCell>{record.employeeName}</TableCell>
                  <TableCell>{record.leaveType}</TableCell>
                  <TableCell>{format(record.startDate, "MMM dd")} - {format(record.endDate, "MMM dd, yyyy")}</TableCell>
                  <TableCell className="max-w-xs truncate" title={record.reason}>{record.reason || "N/A"}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        record.status === 'Approved' ? 'bg-green-100 text-green-700' :
                        record.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                    }`}>
                        {record.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {record.status === 'Pending' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">Manage</Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => handleUpdateStatus(record.id, 'Approved')}>Approve</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleUpdateStatus(record.id, 'Rejected')}>Reject</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No leave records found for the selected criteria.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        }
      </CardContent>
    </Card>
  );
}
