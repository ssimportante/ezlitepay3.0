
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import { getEmployeeTypeHistory, addEmployeeTypeHistory, deleteEmployeeTypeHistory } from "@/lib/firebase/firestore-services/employee-service";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Trash2 } from "lucide-react";
import type { EmployeeTypeHistory } from "@/types/history";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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


interface EmployeeTypeHistoryModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  employeeId: string;
  employeeName: string;
  employeeTypes: string[];
}

export function EmployeeTypeHistoryModal({
  isOpen,
  onOpenChange,
  employeeId,
  employeeName,
  employeeTypes
}: EmployeeTypeHistoryModalProps) {
  const [history, setHistory] = useState<EmployeeTypeHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [newEmployeeType, setNewEmployeeType] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchHistory = async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const data = await getEmployeeTypeHistory(employeeId);
      setHistory(data);
    } catch (error) {
      console.error("Error fetching employee type history:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load employee type history." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
      setNewEmployeeType("");
      setEffectiveDate(format(new Date(), "yyyy-MM-dd"));
    }
  }, [isOpen, employeeId]);

  const handleAdd = async () => {
    if (!newEmployeeType || !effectiveDate) {
      toast({
        variant: "destructive",
        title: "Missing Fields",
        description: "Please select an employee type and an effective date.",
      });
      return;
    }

    setIsSaving(true);
    try {
      await addEmployeeTypeHistory(employeeId, newEmployeeType, parseISO(effectiveDate));
      toast({
        title: "Employee Type History Added",
        description: "The new employee type has been successfully saved.",
      });
      fetchHistory(); 
      setNewEmployeeType(""); 
    } catch (error) {
      console.error("Error adding employee type history:", error);
      toast({
        variant: "destructive",
        title: "Save Error",
        description: "Could not save the new employee type.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (historyId: string) => {
    setDeletingId(historyId);
    try {
      await deleteEmployeeTypeHistory(employeeId, historyId);
      toast({ variant: "destructive", title: "Employee Type Deleted", description: "The employee type history entry has been removed." });
      fetchHistory(); 
    } catch (error) {
      console.error("Error deleting employee type history:", error);
      toast({
        variant: "destructive",
        title: "Delete Error",
        description: "Could not delete the employee type history.",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Employee Type History for {employeeName}</DialogTitle>
           <DialogDescription>
              View past employee types and add new ones. The employee's current type is automatically set to the most recent effective entry.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col md:flex-row gap-8 py-4">
            <div className="flex-1 space-y-4">
                <h3 className="text-lg font-semibold text-foreground mb-2">Add New Employee Type</h3>
                <div className="space-y-2">
                    <Label htmlFor="new-employee-type">Employee Type</Label>
                    <Select onValueChange={setNewEmployeeType} value={newEmployeeType}>
                        <SelectTrigger id="new-employee-type"><SelectValue placeholder="Select type" /></SelectTrigger>
                        <SelectContent>{employeeTypes.map(pos => <SelectItem key={pos} value={pos}>{pos}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="effective-date">Effective Date</Label>
                    <Input
                        id="effective-date"
                        type="date"
                        value={effectiveDate}
                        onChange={(e) => setEffectiveDate(e.target.value)}
                    />
                </div>
                <Button onClick={handleAdd} disabled={isSaving} className="w-full">
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Employee Type
                </Button>
            </div>

            <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground mb-2">Employee Type Change Log</h3>
                {loading ? (
                    <div className="flex justify-center items-center h-40">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : history.length > 0 ? (
                    <div className="border rounded-md max-h-60 overflow-y-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                <TableHead>Effective Date</TableHead>
                                <TableHead>Employee Type</TableHead>
                                <TableHead className="text-center w-[50px]">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {history.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell>{format(item.effectiveDate, "MMMM dd, yyyy")}</TableCell>
                                    <TableCell>{item.employeeType}</TableCell>
                                    <TableCell className="text-center">
                                       <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive/80" disabled={deletingId === item.id}>
                                                    {deletingId === item.id ? <Loader2 size={14} className="animate-spin"/> : <Trash2 size={14}/>}
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This will permanently delete the employee type '{item.employeeType}' effective {format(item.effectiveDate, "MMMM dd, yyyy")}. This may cause the employee's current type to be recalculated.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDelete(item.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </TableCell>
                                </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <div className="text-center text-muted-foreground border rounded-md p-8">No employee type history found.</div>
                )}
            </div>
        </div>

        <DialogFooter>
            <DialogClose asChild>
                <Button type="button" variant="outline">Close</Button>
            </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
