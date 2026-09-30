
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, FileText, CheckCircle, AlertCircle } from "lucide-react";
import Papa from "papaparse";
import type { Employee } from "@/app/(app)/employees/components/employee-types";

export interface TimeLogImportRow {
  employeeId: string;
  dateTime: string; // Keep as string for parsing
  status: "Clock In" | "Clock Out" | "Start Break" | "End Break" | "Start Lunch" | "End Lunch";
  notes?: string;
}

interface ImportTimeLogsModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onImport: (data: TimeLogImportRow[]) => Promise<{ success: boolean; message?: string }>;
  employees: Employee[];
}

const validStatuses = new Set(["Clock In", "Clock Out", "Start Break", "End Break", "Start Lunch", "End Lunch"]);

export function ImportTimeLogsModal({ isOpen, onOpenChange, onImport, employees }: ImportTimeLogsModalProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [parsedData, setParsedData] = useState<TimeLogImportRow[]>([]);
  
  const employeeIdSet = new Set(employees.map(e => e.employeeId));

  const resetState = () => {
    setFile(null);
    setIsProcessing(false);
    setValidationErrors([]);
    setParsedData([]);
  };
  
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetState();
    }
    onOpenChange(open);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type !== "text/csv") {
        toast({ variant: "destructive", title: "Invalid File Type", description: "Please upload a valid CSV file."});
        return;
      }
      setFile(selectedFile);
      setValidationErrors([]);
      setParsedData([]);
    }
  };

  const validateAndParseFile = () => {
    if (!file) {
      toast({ variant: "destructive", title: "No File", description: "Please select a file to import." });
      return;
    }

    setIsProcessing(true);
    setValidationErrors([]);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: Papa.ParseResult<any>) => {
        const errors: string[] = [];
        const validRows: TimeLogImportRow[] = [];

        results.data.forEach((row, index) => {
          const rowIndex = index + 2; // 1-based index + header row

          if (!row.employeeId || !row.dateTime || !row.status) {
            errors.push(`Row ${rowIndex}: Missing required fields (employeeId, dateTime, status).`);
            return;
          }
          if (!employeeIdSet.has(row.employeeId)) {
            errors.push(`Row ${rowIndex}: Employee ID "${row.employeeId}" does not exist.`);
          }
          if (!validStatuses.has(row.status)) {
            errors.push(`Row ${rowIndex}: Invalid status "${row.status}".`);
          }
          if (isNaN(Date.parse(row.dateTime))) {
            errors.push(`Row ${rowIndex}: Invalid dateTime format "${row.dateTime}". Use YYYY-MM-DD HH:mm:ss.`);
          }

          if (errors.length === 0) {
             validRows.push({
                employeeId: row.employeeId,
                dateTime: row.dateTime,
                status: row.status as TimeLogImportRow['status'],
                notes: row.notes || "",
             });
          }
        });

        if (errors.length > 0) {
          setValidationErrors(errors);
          setParsedData([]);
        } else {
          setParsedData(validRows);
          toast({ title: "Validation Successful", description: `${validRows.length} records are ready to be imported.`});
        }
        setIsProcessing(false);
      },
      error: (error: any) => {
        toast({ variant: "destructive", title: "Parsing Error", description: `Failed to parse CSV file: ${error.message}`});
        setIsProcessing(false);
      }
    });
  };

  const handleImportClick = async () => {
    if (parsedData.length === 0) {
      toast({ variant: "destructive", title: "No Data", description: "No valid data to import. Please validate a file first."});
      return;
    }
    
    setIsProcessing(true);
    try {
      const result = await onImport(parsedData);
      if (result.success) {
        toast({ title: "Import Successful", description: `${parsedData.length} time log events have been imported.`});
        handleOpenChange(false);
      } else {
        toast({ variant: "destructive", title: "Import Failed", description: result.message || "An unknown error occurred during import."});
      }
    } catch (error: any) {
      console.error("Import Error:", error);
      toast({ variant: "destructive", title: "Import Error", description: error.message || "An unexpected error occurred."});
    } finally {
      setIsProcessing(false);
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Time Logs from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file with columns: `employeeId`, `dateTime` (YYYY-MM-DD HH:mm:ss), `status`, and `notes` (optional).
            Valid statuses are: "Clock In", "Clock Out", "Start Break", "End Break", "Start Lunch", "End Lunch".
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
            <div className="space-y-2">
                <Label htmlFor="csv-file">CSV File</Label>
                <div className="flex gap-2">
                    <Input id="csv-file" type="file" accept=".csv" onChange={handleFileChange} />
                    <Button onClick={validateAndParseFile} disabled={!file || isProcessing} variant="secondary">
                        {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FileText className="mr-2 h-4 w-4"/>}
                        Validate
                    </Button>
                </div>
            </div>
            
            {validationErrors.length > 0 && (
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md max-h-40 overflow-y-auto">
                    <h4 className="font-semibold text-destructive flex items-center gap-2"><AlertCircle size={16}/> Validation Errors</h4>
                    <ul className="list-disc pl-5 mt-2 text-sm text-destructive/90">
                        {validationErrors.slice(0, 10).map((error, i) => <li key={i}>{error}</li>)}
                         {validationErrors.length > 10 && <li>...and {validationErrors.length - 10} more errors.</li>}
                    </ul>
                </div>
            )}
            
             {parsedData.length > 0 && validationErrors.length === 0 && (
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-md">
                    <h4 className="font-semibold text-green-700 flex items-center gap-2"><CheckCircle size={16}/> Validation Successful</h4>
                    <p className="text-sm text-green-700/90 mt-1">{parsedData.length} records are valid and ready for import.</p>
                </div>
            )}

        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button onClick={handleImportClick} disabled={isProcessing || parsedData.length === 0}>
            {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Import {parsedData.length > 0 ? `(${parsedData.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
