
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MoreHorizontal, Calendar as CalendarIcon, Loader2, RefreshCw, Trash2, Download } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from "@/hooks/use-toast";
import { getEmployeesService } from '@/lib/firebase/firestore-services/employee-service';
import type { Employee as FullEmployeeType } from '@/app/(app)/employees/components/employee-types';
import {
  getLeaveRequestsService,
  updateLeaveRequestStatus,
  deleteLeaveRequest,
} from '@/lib/firebase/firestore-services/leave-service';
import type { LeaveRequest, LeaveRequestStatus, LeaveType } from '@/types/leave';
import { LeaveRequestModal } from '@/app/(app)/schedule/components/leave-request-modal';
import { ScheduleSwapModal } from '@/app/(app)/schedule/components/schedule-swap-modal';
import { swapSchedulesService } from '@/lib/firebase/firestore-services/schedule-service';


const getStatusBadgeVariant = (status: string) => {
  switch (status.toLowerCase()) {
    case 'approved':
      return 'default';
    case 'pending':
      return 'secondary';
    case 'rejected':
      return 'destructive';
    default:
      return 'outline';
  }
};

const RequestsPage = () => {
  const { toast } = useToast();

  const [isLeaveModalOpen, setLeaveModalOpen] = useState(false);
  const [isSwapModalOpen, setSwapModalOpen] = useState(false);
  
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [allLeaveRequests, setAllLeaveRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<LeaveType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<LeaveRequestStatus | 'all'>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRange | undefined>();

  const [employees, setEmployees] = useState<FullEmployeeType[]>([]);
  
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmDeleteDialogOpen, setConfirmDeleteDialogOpen] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<LeaveRequest | null>(null);


  const fetchPageData = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedEmployees, fetchedLeaveRequests] = await Promise.all([
        getEmployeesService(),
        getLeaveRequestsService(),
      ]);
      setEmployees(fetchedEmployees);
      setLeaveRequests(fetchedLeaveRequests);
      setAllLeaveRequests(fetchedLeaveRequests);
    } catch (error) {
      console.error("Failed to fetch page data:", error);
      toast({
        title: "Error",
        description: "Could not fetch necessary data.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPageData();
  }, [fetchPageData]);

  // Filtering logic
  useEffect(() => {
    let filtered = allLeaveRequests;

    if (employeeFilter !== 'all') {
      filtered = filtered.filter(req => req.employeeId === employeeFilter);
    }
    if (typeFilter !== 'all') {
      filtered = filtered.filter(req => req.leaveType === typeFilter);
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter(req => req.status === statusFilter);
    }
    if (dateRangeFilter?.from) {
      filtered = filtered.filter(req => req.endDate >= dateRangeFilter.from!);
    }
    if (dateRangeFilter?.to) {
      filtered = filtered.filter(req => req.startDate <= dateRangeFilter.to!);
    }

    setLeaveRequests(filtered);
  }, [employeeFilter, typeFilter, statusFilter, dateRangeFilter, allLeaveRequests]);


  const updateStatus = async (requestId: string, status: LeaveRequestStatus) => {
    try {
      await updateLeaveRequestStatus(requestId, status);
      toast({
        title: 'Success',
        description: `Leave request has been ${status.toLowerCase()}.`,
      });
      fetchPageData(); // Re-fetch all data to ensure consistency
    } catch (error) {
      console.error("Failed to update leave request:", error);
      toast({
        title: 'Error',
        description: 'Failed to update the leave request.',
        variant: 'destructive',
      });
    }
  };

  const handleSwapRequest = async (data: {
    employeeId1: string;
    date1: Date;
    employeeId2: string;
    date2: Date;
    notes: string;
    formUrl: string;
  }) => {
    try {
      if (!data.formUrl) {
          throw new Error("Form URL is missing, cannot process swap.");
      }
      await swapSchedulesService(data.employeeId1, data.date1, data.employeeId2, data.date2, data.notes, data.formUrl);
      toast({ title: "Success", description: "Schedules have been successfully swapped."});
    } catch (error: any) {
      console.error("Error swapping schedules:", error);
      toast({ variant: "destructive", title: "Swap Failed", description: error.message || "Could not complete the schedule swap." });
      throw error; // Re-throw to prevent modal from closing in the component
    }
  };
  
  const openDeleteConfirmation = (request: LeaveRequest) => {
    setRequestToDelete(request);
    setConfirmDeleteDialogOpen(true);
  };
  
  const handleDelete = async () => {
    if (!requestToDelete) return;
    setIsDeleting(true);
    try {
      await deleteLeaveRequest(requestToDelete.id);
      toast({
        title: 'Request Deleted',
        description: `The leave request for ${requestToDelete.employeeName} has been deleted.`,
        variant: 'destructive'
      });
      fetchPageData();
      setConfirmDeleteDialogOpen(false);
      setRequestToDelete(null);
    } catch (error) {
      console.error("Failed to delete leave request:", error);
      toast({
        title: 'Error',
        description: 'Failed to delete the leave request.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };


  const renderLoading = () => (
    <TableRow>
        <TableCell colSpan={7} className="h-24 text-center">
            <div className="flex justify-center items-center">
                <Loader2 className="mr-2 h-8 w-8 animate-spin" />
                <span>Loading requests...</span>
            </div>
        </TableCell>
    </TableRow>
  );

  const renderNoResults = () => (
    <TableRow>
        <TableCell colSpan={7} className="h-24 text-center">
            No leave requests found matching the criteria.
        </TableCell>
    </TableRow>
  );
  
  return (
    <div className="p-4 md:p-6">
      <h1 className="text-3xl font-bold mb-6">Requests</h1>

      <Tabs defaultValue="leave-management">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="leave-management">Leave Management</TabsTrigger>
          <TabsTrigger value="schedule-swap">Schedule Swap</TabsTrigger>
        </TabsList>
        
        <TabsContent value="leave-management">
          <Card>
            <CardHeader>
              <CardTitle>Leave Requests</CardTitle>
              <CardDescription>Manage and track all employee leave requests.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
                <div className="flex flex-wrap items-center gap-2 w-full">
                  <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                    <SelectTrigger className="w-full md:w-[200px]">
                      <SelectValue placeholder="Filter by employee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Employees</SelectItem>
                      {employees.map(e => <SelectItem key={e.id} value={e.employeeId}>{e.firstName} {e.lastName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as LeaveType | 'all')}>
                    <SelectTrigger className="w-full md:w-[180px]">
                      <SelectValue placeholder="Filter by type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="Paid">Paid</SelectItem>
                      <SelectItem value="Unpaid">Unpaid</SelectItem>
                      <SelectItem value="Sick">Sick</SelectItem>
                      <SelectItem value="Emergency">Emergency</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as LeaveRequestStatus | 'all')}>
                    <SelectTrigger className="w-full md:w-[180px]">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Approved">Approved</SelectItem>
                      <SelectItem value="Rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                  <Popover>
                    <PopoverTrigger asChild>
                        <Button
                        variant={"outline"}
                        className={cn("w-full md:w-[300px] justify-start text-left font-normal", !dateRangeFilter && "text-muted-foreground")}
                        >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRangeFilter?.from ? (
                            dateRangeFilter.to ? (
                            <>
                                {format(dateRangeFilter.from, "LLL dd, y")} - {format(dateRangeFilter.to, "LLL dd, y")}
                            </>
                            ) : (
                            format(dateRangeFilter.from, "LLL dd, y")
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
                        defaultMonth={dateRangeFilter?.from}
                        selected={dateRangeFilter}
                        onSelect={setDateRangeFilter}
                        numberOfMonths={2}
                        />
                    </PopoverContent>
                  </Popover>
                  <Button onClick={() => fetchPageData()} variant="ghost" size="icon" title="Refresh data">
                    <RefreshCw className="h-4 w-4"/>
                  </Button>
                </div>
                <Button onClick={() => setLeaveModalOpen(true)} className="w-full md:w-auto shrink-0">Apply for Leave</Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Form</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? renderLoading() : (leaveRequests.length > 0 ? leaveRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>{request.employeeName}</TableCell>
                      <TableCell>{request.leaveType}</TableCell>
                      <TableCell>{format(request.startDate, 'MMM dd, yyyy')} to {format(request.endDate, 'MMM dd, yyyy')}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={request.reason}>{request.reason || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(request.status)}>{request.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {request.formUrl ? (
                          <Button variant="ghost" size="icon" asChild>
                            <a href={request.formUrl} target="_blank" rel="noopener noreferrer" title="Download Form">
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {request.status === 'Pending' && (
                                <>
                                  <DropdownMenuItem onClick={() => updateStatus(request.id, 'Approved')}>
                                    Approve
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => updateStatus(request.id, 'Rejected')}>
                                    Reject
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                </>
                              )}
                              <DropdownMenuItem onClick={() => openDeleteConfirmation(request)} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                                <Trash2 className="mr-2 h-4 w-4"/> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )) : renderNoResults())}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule-swap">
          <Card>
            <CardHeader>
              <CardTitle>Schedule Swap</CardTitle>
              <CardDescription>Facilitate shift trades between two employees.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-4">
                <p>Click the button below to open the schedule swap tool.</p>
                <Button onClick={() => setSwapModalOpen(true)}>Swap Schedules</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <LeaveRequestModal
        isOpen={isLeaveModalOpen}
        onOpenChange={setLeaveModalOpen}
        employees={employees}
        allLeaveRequests={allLeaveRequests}
        onLeaveRequestCreated={fetchPageData}
      />
      
      <ScheduleSwapModal
        isOpen={isSwapModalOpen}
        onOpenChange={setSwapModalOpen}
        employees={employees}
        onSwapSchedules={handleSwapRequest}
      />
      <AlertDialog open={isConfirmDeleteDialogOpen} onOpenChange={setConfirmDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the leave request for{' '}
              <span className="font-semibold">{requestToDelete?.employeeName}</span> from{' '}
              <span className="font-semibold">{requestToDelete ? format(requestToDelete.startDate, 'MMM dd, yyyy') : ''}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90" disabled={isDeleting}>
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RequestsPage;
