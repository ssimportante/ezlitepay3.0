
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
import { getRateHistory, addRateHistory, deleteRateHistory, getEmployeeDoc, updateEmployee } from "@/lib/firebase/firestore-services/employee-service";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Trash2 } from "lucide-react";
import type { RateHistory } from "@/types/history";
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


interface RateHistoryModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  employeeId: string; // The Firestore document ID
  employeeName: string;
}

export function RateHistoryModal({
  isOpen,
  onOpenChange,
  employeeId,
  employeeName,
}: RateHistoryModalProps) {
  const [history, setHistory] = useState<RateHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [newRate, setNewRate] = useState<number | string>("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchHistory = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      let data = await getRateHistory(employeeId);
      
      // If history is empty, check the main employee doc for a basic salary
      if (data.length === 0) {
        const employeeDoc = await getEmployeeDoc(employeeId);
        if (employeeDoc && employeeDoc.basicSalary > 0) {
          const effectiveDate = employeeDoc.dateHired || new Date();
          // Silently create the first history record. Don't update main doc as it's the source.
          await addRateHistory(employeeId, employeeDoc.basicSalary, effectiveDate, false);
          // Refetch to get the newly created record
          data = await getRateHistory(employeeId);
           toast({
            title: "History Initialized",
            description: `Created initial rate history from employee's basic salary.`,
          });
        }
      }
      setHistory(data);
    } catch (error) {
      console.error("Error fetching rate history:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load rate history." });
    } finally {
      setLoading(false);
    }
  }, [employeeId, toast]);

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
      setNewRate("");
      const today = format(new Date(), "yyyy-MM-dd");
      setEffectiveDate(today);
    }
  }, [isOpen, employeeId, fetchHistory]);

  const handleAddRate = async () => {
    if (!newRate || !effectiveDate) {
      toast({
        variant: "destructive",
        title: "Missing Fields",
        description: "Please enter both a rate and an effective date.",
      });
      return;
    }
    
    const rateNumber = typeof newRate === 'string' ? parseFloat(newRate) : newRate;
    if (isNaN(rateNumber) || rateNumber < 0) {
      toast({
        variant: "destructive",
        title: "Invalid Rate",
        description: "Please enter a valid, non-negative number for the rate.",
      });
      return;
    }

    setIsSaving(true);
    try {
      // This will now also update the main employee document
      await addRateHistory(employeeId, rateNumber, parseISO(effectiveDate));
      toast({
        title: "Rate Added",
        description: "The new rate has been saved and the employee's profile is updated.",
      });
      await fetchHistory(); // Refetch to show the new rate
      setNewRate(""); 
    } catch (error) {
      console.error("Error adding rate history:", error);
      toast({
        variant: "destructive",
        title: "Save Error",
        description: "Could not save the new rate.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRate = async (rateId: string) => {
    setDeletingId(rateId);
    try {
      // This will now also update the main employee document
      await deleteRateHistory(employeeId, rateId);
      toast({ variant: "destructive", title: "Rate Deleted", description: "The rate has been removed and the employee's profile is updated." });
      await fetchHistory();
    } catch (error) {
      console.error("Error deleting rate history:", error);
      toast({
        variant: "destructive",
        title: "Delete Error",
        description: "Could not delete the rate.",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Rate History for {employeeName}</DialogTitle>
           <DialogDescription>
              View past pay rates and add new ones. The employee's salary is automatically set to the most recent effective rate.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col md:flex-row gap-8 py-4">
            <div className="flex-1 space-y-4">
                <h3 className="text-lg font-semibold text-foreground mb-2">Add New Rate</h3>
                <div className="space-y-2">
                    <Label htmlFor="new-rate">Basic Rate (PHP)</Label>
                    <Input
                    id="new-rate"
                    type="number"
                    value={newRate}
                    onChange={(e) => setNewRate(e.target.value)}
                    placeholder="e.g., 600"
                    />
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
                <Button onClick={handleAddRate} disabled={isSaving} className="w-full">
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Rate
                </Button>
            </div>

            <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground mb-2">Rate Change Log</h3>
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
                                <TableHead className="text-right">Rate (PHP)</TableHead>
                                <TableHead className="text-center w-[50px]">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {history.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell>{format(item.effectiveDate, "MMMM dd, yyyy")}</TableCell>
                                    <TableCell className="text-right">{item.rate.toFixed(2)}</TableCell>
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
                                                        This will permanently delete the rate of {item.rate.toFixed(2)} effective {format(item.effectiveDate, "MMMM dd, yyyy")}. This may also cause the employee's current salary to be recalculated.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDeleteRate(item.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
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
                    <div className="text-center text-muted-foreground border rounded-md p-8">No rate history found.</div>
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
