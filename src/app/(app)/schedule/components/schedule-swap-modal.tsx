
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { Employee } from "@/app/(app)/employees/components/employee-types";
import { parseISO, isValid } from "date-fns";
import { Loader2 } from "lucide-react";
import { uploadFileToStorage } from "@/lib/firebase/storage-service";

interface ScheduleSwapModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  employees: Employee[];
  onSwapSchedules: (data: { employeeId1: string; date1: Date; employeeId2: string; date2: Date; notes: string; formUrl: string; }) => Promise<void>;
}

export function ScheduleSwapModal({ isOpen, onOpenChange, employees, onSwapSchedules }: ScheduleSwapModalProps) {
  const { toast } = useToast();
  const [employee1Id, setEmployee1Id] = useState("");
  const [date1, setDate1] = useState("");
  const [employee2Id, setEmployee2Id] = useState("");
  const [date2, setDate2] = useState("");
  const [notes, setNotes] = useState("");
  const [formFile, setFormFile] = useState<File | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);

  const resetForm = () => {
    setEmployee1Id("");
    setDate1("");
    setEmployee2Id("");
    setDate2("");
    setNotes("");
    setFormFile(null);
    const fileInput = document.getElementById('swap-request-form-file') as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  const handleSwap = async () => {
    if (!employee1Id || !date1 || !employee2Id || !date2) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please select both employees and their respective schedule dates.",
      });
      return;
    }
    if (!formFile) {
        toast({ variant: "destructive", title: "Missing Form", description: "The signed schedule swap form is required." });
        return;
    }
    if (employee1Id === employee2Id) {
        toast({
            variant: "destructive",
            title: "Invalid Selection",
            description: "Cannot swap schedules for the same employee. Select two different employees.",
        });
        return;
    }

    const parsedDate1 = parseISO(date1);
    const parsedDate2 = parseISO(date2);

    if (!isValid(parsedDate1) || !isValid(parsedDate2)) {
      toast({
        variant: "destructive",
        title: "Invalid Dates",
        description: "Please ensure both dates are valid.",
      });
      return;
    }

    setIsSwapping(true);
    let formUrl: string;

    try {
        const filePath = `scheduleSwapForms/${employee1Id}-${employee2Id}/${Date.now()}-${formFile.name}`;
        formUrl = await uploadFileToStorage(formFile, filePath);

      await onSwapSchedules({
        employeeId1: employee1Id,
        date1: parsedDate1,
        employeeId2: employee2Id,
        date2: parsedDate2,
        notes: notes,
        formUrl: formUrl,
      });
      resetForm();
      onOpenChange(false);
    } catch (error) {
      // Parent handles toast, but log just in case
      console.error("Failed to swap from modal:", error);
    } finally {
      setIsSwapping(false);
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
          <DialogTitle>Swap Schedules</DialogTitle>
          <DialogDescription>Select the two schedules you want to swap.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border p-4 rounded-md">
            <h3 className="col-span-full font-semibold text-center">First Schedule</h3>
            <div className="space-y-1">
              <Label htmlFor="employee1">Employee*</Label>
              <Select onValueChange={setEmployee1Id} value={employee1Id}>
                <SelectTrigger><SelectValue placeholder="Select Employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={`emp1-${emp.id}`} value={emp.employeeId}>
                      {emp.firstName} {emp.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="date1">Date*</Label>
              <Input id="date1" type="date" value={date1} onChange={(e) => setDate1(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border p-4 rounded-md">
            <h3 className="col-span-full font-semibold text-center">Second Schedule</h3>
             <div className="space-y-1">
              <Label htmlFor="employee2">Employee*</Label>
              <Select onValueChange={setEmployee2Id} value={employee2Id}>
                <SelectTrigger><SelectValue placeholder="Select Employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={`emp2-${emp.id}`} value={emp.employeeId}>
                      {emp.firstName} {emp.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="date2">Date*</Label>
              <Input id="date2" type="date" value={date2} onChange={(e) => setDate2(e.target.value)} />
            </div>
          </div>
           <div className="space-y-1">
             <Label htmlFor="notes">Notes (Optional)</Label>
             <Input id="notes" placeholder="e.g., Agreement between both parties" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="space-y-1">
              <Label htmlFor="swap-request-form-file">Request Form*</Label>
              <Input id="swap-request-form-file" type="file" onChange={(e) => setFormFile(e.target.files ? e.target.files[0] : null)} />
              <p className="text-xs text-muted-foreground">Upload a scanned copy of the signed swap form.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSwap} disabled={isSwapping}>
            {isSwapping && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Request Swap
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
