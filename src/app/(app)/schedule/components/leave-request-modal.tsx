
"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import type { Employee } from "@/app/(app)/employees/components/employee-types";
import { createLeaveRequest as addLeaveRequestService } from "@/lib/firebase/firestore-services/leave-service";
import type { LeaveRequest } from "@/types/leave";
import { parseISO, isValid } from "date-fns";
import { Loader2 } from "lucide-react";
import { uploadFileToStorage } from "@/lib/firebase/storage-service";

interface LeaveRequestModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  employees: Employee[];
  allLeaveRequests: LeaveRequest[];
  onLeaveRequestCreated: () => Promise<void>;
}

export function LeaveRequestModal({ isOpen, onOpenChange, employees, allLeaveRequests, onLeaveRequestCreated }: LeaveRequestModalProps) {
  const { toast } = useToast();
  const [employeeId, setEmployeeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [leaveType, setLeaveType] = useState("Paid");
  const [reason, setReason] = useState("");
  const [formFile, setFormFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableLeaveCredits, setAvailableLeaveCredits] = useState<number | null>(null);

  const selectedEmployee = employees.find(emp => emp.employeeId === employeeId);

  useEffect(() => {
    if (selectedEmployee) {
      setAvailableLeaveCredits(selectedEmployee.leaveCredits ?? 0);
    } else {
      setAvailableLeaveCredits(null);
    }
  }, [employeeId, employees]);
  
  const resetForm = () => {
      setEmployeeId("");
      setStartDate("");
      setEndDate("");
      setLeaveType("Paid");
      setReason("");
      setFormFile(null);
      setAvailableLeaveCredits(null);
      const fileInput = document.getElementById('leave-request-form-file') as HTMLInputElement;
      if (fileInput) fileInput.value = "";
  };

  const handleSubmit = async () => {
    if (!employeeId || !startDate || !endDate || !leaveType) {
        toast({ variant: "destructive", title: "Missing fields", description: "Employee, dates, and leave type are required."});
        return;
    }
    if (!formFile) {
        toast({ variant: "destructive", title: "Missing Form", description: "Please upload the signed request form."});
        return;
    }
    const parsedStartDate = parseISO(startDate);
    const parsedEndDate = parseISO(endDate);

    if (!isValid(parsedStartDate) || !isValid(parsedEndDate) || parsedEndDate < parsedStartDate) {
        toast({ variant: "destructive", title: "Invalid Dates", description: "Please enter a valid start and end date." });
        return;
    }
    
    setIsSubmitting(true);
    let formUrl: string;

    try {
        const filePath = `leaveRequestForms/${employeeId}/${Date.now()}-${formFile.name}`;
        formUrl = await uploadFileToStorage(formFile, filePath);

        const newLeaveRequest: Omit<LeaveRequest, 'id' | 'uid' | 'createdAt' | 'status'> = {
            employeeId,
            employeeName: selectedEmployee ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}` : `ID: ${employeeId}`,
            startDate: parsedStartDate,
            endDate: parsedEndDate,
            leaveType: leaveType as LeaveRequest['leaveType'],
            reason: reason || "N/A",
            formUrl: formUrl,
        };

        await addLeaveRequestService(newLeaveRequest);
        toast({ title: "Leave Request Submitted", description: "Your leave request has been submitted for approval." });
        
        await onLeaveRequestCreated();
        resetForm();
        onOpenChange(false);
    } catch (error) {
        console.error("Error creating leave request:", error);
        toast({ variant: "destructive", title: "Submission Error", description: "Could not submit leave request." });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetForm();
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply for Leave</DialogTitle>
          <DialogDescription>Fill out the form to request time off.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-1">
            <Label htmlFor="employee">Employee*</Label>
            <Select onValueChange={setEmployeeId} value={employeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.employeeId}>
                    {emp.firstName} {emp.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
             {availableLeaveCredits !== null && (
              <p className="text-xs text-muted-foreground mt-1">Available Paid Leave Credits: {availableLeaveCredits}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="start-date">Start Date*</Label>
              <Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="end-date">End Date*</Label>
              <Input id="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Leave Type*</Label>
            <RadioGroup value={leaveType} onValueChange={setLeaveType} className="flex items-center gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Paid" id="paid" />
                <Label htmlFor="paid">Paid</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Unpaid" id="unpaid" />
                <Label htmlFor="unpaid">Unpaid</Label>
              </div>
               <div className="flex items-center space-x-2">
                <RadioGroupItem value="Sick" id="sick" />
                <Label htmlFor="sick">Sick</Label>
              </div>
               <div className="flex items-center space-x-2">
                <RadioGroupItem value="Emergency" id="emergency" />
                <Label htmlFor="emergency">Emergency</Label>
              </div>
            </RadioGroup>
          </div>
          <div className="space-y-1">
             <Label htmlFor="reason">Reason (Optional)</Label>
             <Input id="reason" placeholder="e.g., Vacation" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="space-y-1">
              <Label htmlFor="leave-request-form-file">Request Form*</Label>
              <Input id="leave-request-form-file" type="file" onChange={(e) => setFormFile(e.target.files ? e.target.files[0] : null)} />
              <p className="text-xs text-muted-foreground">Upload a scanned copy of the filled-out form.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
