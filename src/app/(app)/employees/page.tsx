

"use client";

import * as React from "react";
import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Search, XCircle, Loader2, UserMinus, UserCheck } from "lucide-react";
import { EmployeeCard } from "./components/employee-card";
import type { Employee } from "./components/employee-types";
import type { EmployeeFormValues } from "./components/employee-form-schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { EmployeeForm } from "./components/employee-form";
import { useToast } from "@/hooks/use-toast";
import {
  addEmployee,
  getEmployeesService,
  updateEmployee,
  archiveEmployee as archiveEmployeeService,
  deleteEmployee as deleteEmployeeService,
  setEmployeeInactive as setEmployeeInactiveService,
  setEmployeeActive as setEmployeeActiveService,
  type EmployeeDataForFirestore,
  addRateHistory,
  addPositionHistory,
  addEmployeeIdHistory,
  addEmployeeTypeHistory,
} from "@/lib/firebase/firestore-services/employee-service";
import { 
  uploadDataUrlToStorage, 
  deleteFileFromStorage,
  getFirebaseStoragePathFromUrl,
  isFirebaseStorageUrl
} from "@/lib/firebase/storage-service";
import { format as formatDateFns, parse as parseDateFns, isValid as isValidDateFns } from "date-fns";
import { Label } from "@/components/ui/label";
import { getCustomizationSettings, type CustomizationSettings } from "@/lib/firebase/firestore-services/customization-service";


function parseMMDDYYYY(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;
  // First, try parsing as a generic date string, which handles ISO strings from Firestore well.
  const genericParsedDate = new Date(dateString);
  if (isValidDateFns(genericParsedDate) && dateString.includes('-')) { // Favor ISO strings
      return genericParsedDate;
  }
  
  // If that fails or it's not ISO-like, try the specific "MM/dd/yyyy" format for form inputs.
  try {
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const month = parseInt(parts[0], 10);
      const day = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year > 1900 && year < 2100) {
        const parsedDate = parseDateFns(dateString, "MM/dd/yyyy", new Date());
        if (isValidDateFns(parsedDate)) {
          return parsedDate;
        }
      }
    }
    return null; // Return null if format is not "MM/dd/yyyy" or is invalid
  } catch (error) {
    console.error(`[parseMMDDYYYY] Error parsing date string: "${dateString}"`, error);
    return null;
  }
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("All Departments");
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);

  const [isInactiveModalOpen, setIsInactiveModalOpen] = useState(false);
  const [employeeToMarkInactive, setEmployeeToMarkInactive] = useState<Employee | null>(null);
  const [inactiveStartDate, setInactiveStartDate] = useState(formatDateFns(new Date(), "yyyy-MM-dd"));
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const { toast } = useToast();

  const [customizationOptions, setCustomizationOptions] = useState<CustomizationSettings | null>(null);

  const loadData = React.useCallback(async () => {
    setIsLoadingEmployees(true);
    try {
      const [fetchedEmployees, customSettings] = await Promise.all([
          getEmployeesService(),
          getCustomizationSettings()
      ]);
      setEmployees(fetchedEmployees);
      setCustomizationOptions(customSettings);
    } catch (error) {
      console.error("[EmployeesPage] Failed to fetch data:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load page data." });
      setEmployees([]);
    } finally {
      setIsLoadingEmployees(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const departments = useMemo(() => ["All Departments", ...(customizationOptions?.departments || [])], [customizationOptions]);


  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase();
      const employeeId = emp.employeeId?.toLowerCase() || "";
      const position = emp.position?.toLowerCase() || "";
      const searchLower = searchTerm.toLowerCase();

      const matchesSearch = fullName.includes(searchLower) ||
                            employeeId.includes(searchLower) ||
                            position.includes(searchLower);

      const matchesFilter = filterDepartment === "All Departments" || emp.department === filterDepartment;
      return matchesSearch && matchesFilter;
    });
  }, [employees, searchTerm, filterDepartment]);

  const activeEmployees = useMemo(() => filteredEmployees.filter(emp => {
    const statusLower = emp.status.toLowerCase();
    return statusLower === "active" || statusLower === "on leave";
  }), [filteredEmployees]);
  const inactiveEmployees = useMemo(() => filteredEmployees.filter(emp => emp.status.toLowerCase() === "inactive"), [filteredEmployees]);
  const archivedEmployees = useMemo(() => {
    const archivedStatuses = ["archived", "terminated", "resigned", "end-of-contract"];
    return filteredEmployees.filter(emp => archivedStatuses.includes(emp.status.toLowerCase()));
  }, [filteredEmployees]);


  const handleAddEmployee = () => {
    setEditingEmployee(null);
    setIsViewOnly(false);
    setIsFormModalOpen(true);
  };

  const handleEditEmployee = (employee: Employee) => {
    setEditingEmployee(employee);
    setIsViewOnly(false);
    setIsFormModalOpen(true);
  };

  const handleViewDetails = (employee: Employee) => {
    setEditingEmployee(employee);
    setIsViewOnly(true);
    setIsFormModalOpen(true);
  };

  const handleOpenInactiveModal = (employee: Employee) => {
    setEmployeeToMarkInactive(employee);
    setInactiveStartDate(formatDateFns(new Date(), "yyyy-MM-dd")); // Reset to today
    setIsInactiveModalOpen(true);
  };

  const handleConfirmSetInactive = async () => {
    if (!employeeToMarkInactive) return;

    const inactiveDate = parseDateFns(inactiveStartDate, "yyyy-MM-dd", new Date());
    if (!isValidDateFns(inactiveDate)) {
      toast({ variant: "destructive", title: "Invalid Date", description: "Please select a valid start date for inactivity." });
      return;
    }

    setIsUpdatingStatus(true);
    try {
      await setEmployeeInactiveService(employeeToMarkInactive.id, inactiveDate);
      await loadData();
      toast({
        title: "Employee Marked as Inactive",
        description: `${employeeToMarkInactive.firstName} ${employeeToMarkInactive.lastName} is now inactive as of ${formatDateFns(inactiveDate, "MMM dd, yyyy")}.`
      });
      setIsInactiveModalOpen(false);
      setEmployeeToMarkInactive(null);
    } catch (error) {
       console.error("Error setting employee to inactive:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not mark employee as inactive." });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleReactivateEmployee = async (employeeId: string) => {
    const employeeToUpdate = employees.find(emp => emp.id === employeeId);
    if (!employeeToUpdate) return;
    setIsUpdatingStatus(true);
    try {
      const reactivatedDate = new Date();
      await setEmployeeActiveService(employeeId, reactivatedDate);
      await loadData();
      toast({
        title: "Employee Reactivated",
        description: `${employeeToUpdate.firstName} ${employeeToUpdate.lastName} is now active.`
      });
    } catch (error) {
       console.error("Error reactivating employee:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not reactivate employee." });
    } finally {
        setIsUpdatingStatus(false);
    }
  };

  const handleArchiveEmployee = async (employeeId: string) => {
    const employeeToArchive = employees.find(emp => emp.id === employeeId);
    if (!employeeToArchive) return;

    try {
      await archiveEmployeeService(employeeId);
      await loadData();
      toast({
        title: "Employee Archived",
        description: `${employeeToArchive.firstName} ${employeeToArchive.lastName} has been moved to archived.`,
      });
    } catch (error) {
      console.error("Error archiving employee:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not archive employee." });
    }
  };

  const handleDeleteArchivedEmployee = async (employeeId: string) => {
    const employeeToDelete = employees.find(emp => emp.id === employeeId);
    if (!employeeToDelete) return;
    try {
      if (employeeToDelete.profilePicture && isFirebaseStorageUrl(employeeToDelete.profilePicture)) {
        const storagePath = getFirebaseStoragePathFromUrl(employeeToDelete.profilePicture);
        if (storagePath) {
            try {
                await deleteFileFromStorage(storagePath);
            }
            catch (storageError) { console.warn("Could not delete profile picture from storage during employee deletion:", storageError); }
        }
      }

      await deleteEmployeeService(employeeId);
      await loadData();
      toast({
        title: "Employee Deleted",
        description: `Archived employee ${employeeToDelete.firstName} ${employeeToDelete.lastName} has been permanently deleted.`,
        variant: "destructive"
      });
    } catch (error) {
      console.error("Error deleting employee:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not delete employee." });
    }
  };

  const handleFormSubmit = async (values: EmployeeFormValues) => {
    setIsSavingEmployee(true);

    let newProfilePictureUrlToSave: string | null | undefined = undefined;
    const currentStoredProfilePicture = editingEmployee?.profilePicture || null;

    const birthDateObject = parseMMDDYYYY(values.birthDate || null);
    const dateHiredObject = parseMMDDYYYY(values.dateHired || null);

    if ((values.birthDate && values.birthDate.trim() !== "" && !birthDateObject) || 
        (values.dateHired && values.dateHired.trim() !== "" && !dateHiredObject)) {
      toast({
        variant: "destructive",
        title: "Invalid Date Format",
        description: "One or more dates are invalid. Please use MM/DD/YYYY or leave empty.",
      });
      setIsSavingEmployee(false);
      return;
    }
    
    try {
      if (values.profilePicture && values.profilePicture.startsWith("data:")) {
        const uploaderId = "system"; // No auth user
        
        const picPath = `employeeProfilePictures/${uploaderId}/${values.employeeId}-${Date.now()}.png`;
        newProfilePictureUrlToSave = await uploadDataUrlToStorage(values.profilePicture, picPath);

        if (currentStoredProfilePicture && isFirebaseStorageUrl(currentStoredProfilePicture) && currentStoredProfilePicture !== newProfilePictureUrlToSave) {
          const oldStoragePath = getFirebaseStoragePathFromUrl(currentStoredProfilePicture);
          if (oldStoragePath) {
            try {
              await deleteFileFromStorage(oldStoragePath);
            } catch (innerDeleteError: any) {
              console.warn("[EmployeesPage] Could not delete old profile picture during replacement:", innerDeleteError);
            }
          }
        }
      } else if (values.profilePicture === null && currentStoredProfilePicture && isFirebaseStorageUrl(currentStoredProfilePicture)) {
        const oldStoragePath = getFirebaseStoragePathFromUrl(currentStoredProfilePicture);
        if (oldStoragePath) {
          try {
            await deleteFileFromStorage(oldStoragePath);
          } catch (deleteError: any) {
            console.warn("[EmployeesPage] Could not delete old profile picture when clearing:", deleteError);
          }
        }
        newProfilePictureUrlToSave = null;
      } else if (values.profilePicture && !values.profilePicture.startsWith("data:")) {
        newProfilePictureUrlToSave = values.profilePicture;
      } else if (editingEmployee && values.profilePicture === undefined) {
        newProfilePictureUrlToSave = editingEmployee.profilePicture;
      } else if (!editingEmployee && (values.profilePicture === undefined || values.profilePicture === null)) {
        newProfilePictureUrlToSave = null;
      }
    } catch (imageHandlingError: any) {
      toast({ variant: "destructive", title: "Image Processing Error", description: `Could not process profile picture: ${imageHandlingError.message || String(imageHandlingError)}` });
      setIsSavingEmployee(false);
      return;
    }

    try {
      if (editingEmployee) {
        const { 
          profilePicture: _formProfilePicEdit,
          ...otherFormValuesEdit 
        } = values;

        const updatePayload: Partial<EmployeeDataForFirestore> = {
          ...otherFormValuesEdit,
          birthDate: birthDateObject,
          dateHired: dateHiredObject,
        };
        
        if (newProfilePictureUrlToSave !== undefined) {
          updatePayload.profilePicture = newProfilePictureUrlToSave;
        }

        // Check for changes and add to history
        const effectiveDate = new Date();
        const historyPromises = [];
        if (values.basicSalary !== editingEmployee.basicSalary) {
          historyPromises.push(addRateHistory(editingEmployee.id, values.basicSalary, effectiveDate, false));
        }
        if (values.position !== editingEmployee.position) {
          historyPromises.push(addPositionHistory(editingEmployee.id, values.position || 'N/A', effectiveDate, false));
        }
        if (values.employeeId !== editingEmployee.employeeId) {
          historyPromises.push(addEmployeeIdHistory(editingEmployee.id, values.employeeId, effectiveDate, false));
        }
        if (values.employeeType !== editingEmployee.employeeType) {
          historyPromises.push(addEmployeeTypeHistory(editingEmployee.id, values.employeeType, effectiveDate, false));
        }
        
        await Promise.all(historyPromises);
        await updateEmployee(editingEmployee.id, updatePayload);
        
        toast({
          title: "Employee Updated",
          description: `${values.firstName} ${values.lastName}'s details have been updated.`,
        });

      } else {
        
        const { 
          profilePicture: _formProfilePicAdd,
          ...otherFormValuesAdd
        } = values;

        const newEmployeeDataForService: EmployeeDataForFirestore = {
          ...otherFormValuesAdd,
          birthDate: birthDateObject,
          dateHired: dateHiredObject,
          profilePicture: newProfilePictureUrlToSave,
          creatorId: "system",
        };
        
        const newEmployeeId = await addEmployee(newEmployeeDataForService);

        // Add initial history records
        const effectiveDate = dateHiredObject || new Date();
        const historyPromises = [
            addRateHistory(newEmployeeId, values.basicSalary, effectiveDate, false),
            addPositionHistory(newEmployeeId, values.position || 'N/A', effectiveDate, false),
            addEmployeeIdHistory(newEmployeeId, values.employeeId, effectiveDate, false),
            addEmployeeTypeHistory(newEmployeeId, values.employeeType, effectiveDate, false),
        ];
        await Promise.all(historyPromises);
        
        toast({
          title: "Employee Added",
          description: `${values.firstName} ${values.lastName} has been added.`,
        });
      }
      setIsFormModalOpen(false);
      setEditingEmployee(null);
      await loadData();
    } catch (error: any) {
      console.error("Save Error:", error);
      toast({ variant: "destructive", title: "Save Error", description: `Could not save employee details: ${error.message || String(error)}` });
    } finally {
      setIsSavingEmployee(false);
    }
  };

  const formDefaultValues = useMemo(() => {
    if (!editingEmployee) return undefined;
    
    const formattedBirthDate = editingEmployee.birthDate && isValidDateFns(new Date(editingEmployee.birthDate)) 
      ? formatDateFns(new Date(editingEmployee.birthDate), "MM/dd/yyyy") 
      : "";
    const formattedDateHired = editingEmployee.dateHired && isValidDateFns(new Date(editingEmployee.dateHired))
      ? formatDateFns(new Date(editingEmployee.dateHired), "MM/dd/yyyy")
      : "";

    return {
      ...editingEmployee,
      employeeType: editingEmployee.employeeType || "",
      gender: editingEmployee.gender || "",
      status: editingEmployee.status || "active",
      birthDate: formattedBirthDate,
      dateHired: formattedDateHired,
      profilePicture: editingEmployee.profilePicture || null,
      position: editingEmployee.position || "",
      degree: editingEmployee.degree || "",
      email: editingEmployee.email || "",
      department: editingEmployee.department || "",
      tinNumber: editingEmployee.tinNumber || "",
      sssNumber: editingEmployee.sssNumber || "",
      philHealthNumber: editingEmployee.philHealthNumber || "",
      pagIbigNumber: editingEmployee.pagIbigNumber || "",
      bankName: editingEmployee.bankName || "",
      accountNumber: editingEmployee.accountNumber || "",
      basicSalary: editingEmployee.basicSalary ?? 0,
      overtimeMultiplier: editingEmployee.overtimeMultiplier ?? 1.25,
      regularHolidayMultiplier: editingEmployee.regularHolidayMultiplier ?? 2.0,
      specialHolidayMultiplier: editingEmployee.specialHolidayMultiplier ?? 1.3,
      sssDeduction: editingEmployee.sssDeduction ?? 0,
      philHealthDeduction: editingEmployee.philHealthDeduction ?? 0,
      hdmfDeduction: editingEmployee.hdmfDeduction ?? 0,
      leaveCredits: editingEmployee.leaveCredits ?? 0,
    } as EmployeeFormValues;
  }, [editingEmployee]);

  return (
    <div className="p-4 md:p-6 space-y-6">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <div className="relative flex-grow">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search employees..."
              className="pl-8 w-full sm:w-auto md:w-[200px] lg:w-[300px]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={filterDepartment} onValueChange={setFilterDepartment}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filters" />
            </SelectTrigger>
            <SelectContent>
              {departments.map(dept => (
                <SelectItem key={dept} value={dept}>{dept}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => { setSearchTerm(""); setFilterDepartment("All Departments"); }} className="w-full sm:w-auto">
            <XCircle size={16} className="mr-2 md:hidden lg:inline-block" /> Reset
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto md:items-center">
          <Button onClick={handleAddEmployee} className="bg-primary hover:bg-primary/90 w-full sm:w-auto">
            <PlusCircle size={16} className="mr-2" /> Add New Employee
          </Button>
        </div>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="active">Active ({activeEmployees.length})</TabsTrigger>
          <TabsTrigger value="inactive">Inactive ({inactiveEmployees.length})</TabsTrigger>
          <TabsTrigger value="archived">Archived ({archivedEmployees.length})</TabsTrigger>
        </TabsList>
        
        <TabsContent value="active">
          {isLoadingEmployees ? <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> :
          activeEmployees.length > 0 ? (
            <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mt-4">
              {activeEmployees.map(emp => (
                <EmployeeCard
                  key={emp.id}
                  employee={emp}
                  onViewDetails={handleViewDetails}
                  onEdit={handleEditEmployee}
                  onArchive={handleArchiveEmployee}
                  onSetInactive={() => handleOpenInactiveModal(emp)}
                />
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No active employees found.</p>
          )}
        </TabsContent>

        <TabsContent value="inactive">
          {isLoadingEmployees ? <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> :
          inactiveEmployees.length > 0 ? (
            <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mt-4">
              {inactiveEmployees.map(emp => (
                <EmployeeCard
                  key={emp.id}
                  employee={emp}
                  onViewDetails={handleViewDetails}
                  onEdit={handleEditEmployee}
                  onArchive={handleArchiveEmployee}
                  onReactivate={handleReactivateEmployee}
                />
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No inactive employees found.</p>
          )}
        </TabsContent>

        <TabsContent value="archived">
           {isLoadingEmployees ? <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> :
          archivedEmployees.length > 0 ? (
            <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mt-4">
              {archivedEmployees.map(emp => (
                <EmployeeCard
                  key={emp.id}
                  employee={emp}
                  onViewDetails={handleViewDetails}
                  onEdit={handleEditEmployee}
                  onArchive={() => {}}
                  onDelete={handleDeleteArchivedEmployee}
                />
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No archived employees found.</p>
          )}
        </TabsContent>
      </Tabs>
      
      <Dialog open={isFormModalOpen} onOpenChange={(open) => {
        setIsFormModalOpen(open);
        if (!open) setEditingEmployee(null);
      }}>
        <DialogContent className="max-w-4xl p-0 flex flex-col max-h-[90vh]">
          <DialogHeader className="p-6 pb-4 border-b shrink-0">
            <DialogTitle>{editingEmployee ? (isViewOnly ? "View Employee Details" : "Edit Employee Details") : "Add New Employee"}</DialogTitle>
            <DialogDescription>
              {editingEmployee ? (isViewOnly ? "Viewing employee's details." : "Update the employee's details.") : "Fill in the details to add a new employee."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto p-6"> 
            <EmployeeForm
              key={editingEmployee ? editingEmployee.id : 'new-employee-form'}
              defaultValues={formDefaultValues}
              onSubmit={handleFormSubmit}
              isViewOnly={isViewOnly}
            />
          </div>

          <DialogFooter className="p-4 border-t bg-background shrink-0">
            <Button type="button" variant="outline" onClick={() => {setIsFormModalOpen(false); setEditingEmployee(null);}} disabled={isSavingEmployee}>
                {isViewOnly ? "Close" : "Cancel"}
            </Button>
            {!isViewOnly && (
              <Button
                type="submit"
                form="employee-details-form" 
                className="bg-primary hover:bg-primary/90"
                disabled={isSavingEmployee}
              >
                {isSavingEmployee && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingEmployee ? "Save Changes" : "Add Employee"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isInactiveModalOpen} onOpenChange={setIsInactiveModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set Employee Inactive</DialogTitle>
            <DialogDescription>
              Select the date when {employeeToMarkInactive?.firstName} {employeeToMarkInactive?.lastName} became inactive. They will not be marked as absent from this date forward.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="inactive-start-date">Inactive Start Date</Label>
            <Input
              id="inactive-start-date"
              type="date"
              value={inactiveStartDate}
              onChange={(e) => setInactiveStartDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInactiveModalOpen(false)}>Cancel</Button>
            <Button onClick={handleConfirmSetInactive} disabled={isUpdatingStatus}>
              {isUpdatingStatus && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Inactive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

