
"use client";

import * as React from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { employeeFormSchema, type EmployeeFormValues } from "./employee-form-schema";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ImageIcon, User, Phone, Contact, FileText as FileTextIcon, Banknote as BanknoteIcon, Calculator as CalculatorIcon, ShieldCheck as ShieldCheckIcon, CalendarCheck2, History, GraduationCap, Briefcase as BriefcaseIcon } from "lucide-react";
import { PesoSignIcon } from "@/components/icons/peso-sign-icon";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, isValid as isValidDate } from "date-fns";
import { Button } from "@/components/ui/button";
import { RateHistoryModal } from "./rate-history-modal";
import { PositionHistoryModal } from "./position-history-modal";
import { EmployeeIdHistoryModal } from "./employee-id-history-modal";
import { EmployeeTypeHistoryModal } from "./employee-type-history-modal";
import { getCustomizationSettings, type CustomizationSettings } from "@/lib/firebase/firestore-services/customization-service";

const employeeFormSectionIcons = {
  personal: User,
  contact: Phone,
  emergency: Contact,
  government: FileTextIcon,
  payment: BanknoteIcon,
  salary: PesoSignIcon,
  multipliers: CalculatorIcon,
  deductions: ShieldCheckIcon,
  leave: CalendarCheck2,
};

const salaryTypes = ["Daily", "Monthly"];
const paymentMethods = ["Cash", "Bank Transfer", "Check"];
const genderOptions = ["Male", "Female", "Other", "Prefer not to say"];

const staticInitialEmployeeFormValues: EmployeeFormValues = {
  employeeType: "",
  employeeId: "",
  firstName: "",
  lastName: "",
  gender: "",
  status: "active",
  birthDate: "", 
  position: "",
  degree: "",
  email: "",
  department: "",
  dateHired: "",
  profilePicture: null,
  mobileNumber: "",
  address: "",
  emergencyContactPersonName: "",
  emergencyContactRelationship: "",
  emergencyContactNumber: "",
  tinNumber: "",
  sssNumber: "",
  philHealthNumber: "",
  pagIbigNumber: "",
  paymentMethod: "",
  bankName: "",
  accountNumber: "",
  salaryType: "",
  basicSalary: 0,
  overtimeMultiplier: 1.25,
  regularHolidayMultiplier: 2.0,
  specialHolidayMultiplier: 1.3,
  sssDeduction: 0,
  philHealthDeduction: 0,
  hdmfDeduction: 0,
  leaveCredits: 0,
};


interface EmployeeFormProps {
  defaultValues?: Partial<EmployeeFormValues & { profilePicture?: string | null; birthDate?: string | Date | null; dateHired?: string | Date | null; gender?: string | null; status?: string | null; id?: string; }>;
  onSubmit: (values: EmployeeFormValues) => void;
  className?: string;
  isSaving?: boolean;
  onCancel?: () => void;
  isViewOnly?: boolean;
}

const prepareFormValues = (data?: EmployeeFormProps['defaultValues']): EmployeeFormValues => {
    const base: EmployeeFormValues = { ...staticInitialEmployeeFormValues };

    if (data) {
        // Create a temporary object to hold the merged data
        const mergedData: { [key: string]: any } = { ...data };

        // Handle specific status property first to ensure type correctness
        if (data.status) {
            mergedData.status = data.status.toLowerCase();
        } else {
            mergedData.status = 'active';
        }

        (Object.keys(base) as Array<keyof EmployeeFormValues>).forEach(key => {
            const value = mergedData[key as keyof typeof mergedData];
            
            if (key === 'birthDate' || key === 'dateHired') {
                if (value && isValidDate(new Date(value as string | Date))) {
                    (base[key] as any) = format(new Date(value as string | Date), "MM/dd/yyyy");
                } else {
                    (base[key] as any) = "";
                }
            } else if (value !== undefined && value !== null) {
                (base[key] as any) = value;
            }
        });
    }

    // Final check to prevent any undefined/null values
    (Object.keys(base) as Array<keyof EmployeeFormValues>).forEach(key => {
        if (base[key] === null || base[key] === undefined) {
            (base[key] as any) = (typeof staticInitialEmployeeFormValues[key] === 'number') ? 0 : "";
        }
    });

    return base;
};


export function EmployeeForm({
  defaultValues: editingEmployeeData,
  onSubmit,
  className,
  isViewOnly = false,
  ...props 
}: EmployeeFormProps) {
  const [profilePreview, setProfilePreview] = React.useState<string | null>(editingEmployeeData?.profilePicture || null);
  const [isRateHistoryModalOpen, setIsRateHistoryModalOpen] = React.useState(false);
  const [isPositionHistoryModalOpen, setIsPositionHistoryModalOpen] = React.useState(false);
  const [isEmployeeIdHistoryModalOpen, setIsEmployeeIdHistoryModalOpen] = React.useState(false);
  const [isEmployeeTypeHistoryModalOpen, setIsEmployeeTypeHistoryModalOpen] = React.useState(false);

  const [customizationOptions, setCustomizationOptions] = React.useState<CustomizationSettings | null>(null);

  React.useEffect(() => {
    async function fetchCustomizations() {
        const settings = await getCustomizationSettings();
        setCustomizationOptions(settings);
    }
    fetchCustomizations();
  }, []);

  const employeeTypes = customizationOptions?.employeeTypes || [];
  const departments = customizationOptions?.departments || [];
  const positions = customizationOptions?.positions || [];
  const employeeStatuses = customizationOptions?.employeeStatuses || [];

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: prepareFormValues(editingEmployeeData),
  });

  React.useEffect(() => {
    const newFormValues = prepareFormValues(editingEmployeeData);
    form.reset(newFormValues);
    setProfilePreview(editingEmployeeData?.profilePicture || null);
  }, [editingEmployeeData, form]);

  const watchSalaryType = form.watch("salaryType");
  const watchBasicSalary = form.watch("basicSalary");
  const watchEmployeeType = form.watch("employeeType");

  const hourlyRate = React.useMemo(() => {
    const salary = typeof watchBasicSalary === 'string' ? parseFloat(watchBasicSalary) : watchBasicSalary;
    if (watchSalaryType === "Daily" && salary > 0) {
      return (salary / 8).toFixed(2);
    }
    return "N/A";
  }, [watchSalaryType, watchBasicSalary]);

  const monthlyEquivalent = React.useMemo(() => {
     const salary = typeof watchBasicSalary === 'string' ? parseFloat(watchBasicSalary) : watchBasicSalary;
    if (watchSalaryType === "Daily" && salary > 0) {
      return (salary * 22).toFixed(2);
    }
    return "N/A";
  }, [watchSalaryType, watchBasicSalary]);

  const handleProfilePictureChange = (event: React.ChangeEvent<HTMLInputElement>, fieldChange: (value: string | null) => void) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        form.setError("profilePicture", { type: "manual", message: "File too large (max 2MB)." });
        setProfilePreview(editingEmployeeData?.profilePicture || null); 
        if(event.target) event.target.value = ""; 
        return;
      }
      form.clearErrors("profilePicture");
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setProfilePreview(dataUrl);
        fieldChange(dataUrl);
      };
      reader.readAsDataURL(file);
    } else { 
      const currentDefaultPic = editingEmployeeData?.profilePicture || null;
      setProfilePreview(currentDefaultPic);
      fieldChange(currentDefaultPic); 
    }
  };

  const formSection = (title: string, iconName: keyof typeof employeeFormSectionIcons, children: React.ReactNode, actions?: React.ReactNode) => {
    const IconComponent = employeeFormSectionIcons[iconName];
    return (
        <Card className="shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="bg-muted/30 p-4 border-b flex flex-row items-center justify-between">
            <CardTitle className="text-md font-semibold flex items-center gap-2 text-primary">
            <IconComponent size={18} className="text-primary/80" /> {title}
            </CardTitle>
            {actions && <div className="flex-shrink-0">{actions}</div>}
        </CardHeader>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            {children}
        </CardContent>
        </Card>
    );
  };

  return (
    <>
      <FormProvider {...form}>
        <form id="employee-details-form" onSubmit={form.handleSubmit(onSubmit)} className={cn(className)} {...props}>
          <div className="space-y-6">
              {formSection("Personal Information", "personal", (
                <>
                  <FormField control={form.control} name="profilePicture" render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Profile Picture</FormLabel>
                      <div className="flex items-center gap-4">
                        <Avatar className="h-20 w-20 border">
                          <AvatarImage src={profilePreview || undefined} alt="Profile Preview" data-ai-hint="employee avatar"/>
                          <AvatarFallback><ImageIcon size={32} className="text-muted-foreground" /></AvatarFallback>
                        </Avatar>
                        <FormControl>
                          <Input
                            type="file"
                            accept="image/png, image/jpeg"
                            onChange={(e) => handleProfilePictureChange(e, field.onChange)}
                            className="flex-1"
                            disabled={isViewOnly}
                          />
                        </FormControl>
                      </div>
                      <FormDescription>PNG or JPG file (max 2MB).</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="employeeType" render={({ field }) => ( <FormItem> <FormLabel>Employee Type*</FormLabel> <Select onValueChange={field.onChange} value={field.value || ""} disabled={isViewOnly}> <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl> <SelectContent>{employeeTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent> </Select> <FormMessage /> </FormItem> )} />
                  <FormField control={form.control} name="employeeId" render={({ field }) => ( <FormItem> <FormLabel>Employee ID*</FormLabel> <FormControl><Input placeholder="EMP-001" {...field} value={field.value || ""} disabled={isViewOnly} /></FormControl> <FormMessage /> </FormItem> )} />
                  <FormField control={form.control} name="firstName" render={({ field }) => ( <FormItem> <FormLabel>First Name*</FormLabel> <FormControl><Input placeholder="First Name" {...field} value={field.value || ""} disabled={isViewOnly} /></FormControl> <FormMessage /> </FormItem> )} />
                  <FormField control={form.control} name="lastName" render={({ field }) => ( <FormItem> <FormLabel>Last Name*</FormLabel> <FormControl><Input placeholder="Last Name" {...field} value={field.value || ""} disabled={isViewOnly} /></FormControl> <FormMessage /> </FormItem> )} />
                  <FormField control={form.control} name="gender" render={({ field }) => ( <FormItem> <FormLabel>Gender</FormLabel> <Select onValueChange={field.onChange} value={field.value || ""} disabled={isViewOnly}> <FormControl><SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger></FormControl> <SelectContent>{genderOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent> </Select> <FormMessage /> </FormItem> )} />
                  <FormField control={form.control} name="status" render={({ field }) => ( <FormItem> <FormLabel>Status*</FormLabel> <Select onValueChange={field.onChange} value={field.value || "active"} disabled={isViewOnly}> <FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl> <SelectContent>{employeeStatuses.map(status => <SelectItem key={status} value={status.toLowerCase()}>{status}</SelectItem>)}</SelectContent> </Select> <FormMessage /> </FormItem> )} />
                  <FormField
                    control={form.control}
                    name="birthDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Birth Date</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="MM/DD/YYYY"
                            {...field}
                            value={field.value || ""}
                            disabled={isViewOnly}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField control={form.control} name="position" render={({ field }) => ( <FormItem> <FormLabel>Position</FormLabel> <Select onValueChange={field.onChange} value={field.value || ""} disabled={isViewOnly}> <FormControl><SelectTrigger><SelectValue placeholder="Select position" /></SelectTrigger></FormControl> <SelectContent>{positions.map(pos => <SelectItem key={pos} value={pos}>{pos}</SelectItem>)}</SelectContent> </Select> <FormMessage /> </FormItem> )} />
                  <FormField control={form.control} name="degree" render={({ field }) => ( <FormItem> <FormLabel>Degree</FormLabel> <FormControl><Input placeholder="e.g., B.S. in Computer Science" {...field} value={field.value || ""} disabled={isViewOnly} /></FormControl> <FormMessage /> </FormItem> )} />
                  <FormField control={form.control} name="email" render={({ field }) => ( <FormItem> <FormLabel>Email</FormLabel> <FormControl><Input type="email" placeholder="name@example.com" {...field} value={field.value || ""} disabled={isViewOnly} /></FormControl> <FormMessage /> </FormItem> )} />
                  <FormField control={form.control} name="department" render={({ field }) => ( <FormItem> <FormLabel>Department</FormLabel> <Select onValueChange={field.onChange} value={field.value || ""} disabled={isViewOnly}> <FormControl><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger></FormControl> <SelectContent>{departments.map(dept => <SelectItem key={dept} value={dept}>{dept}</SelectItem>)}</SelectContent> </Select> <FormMessage /> </FormItem> )} />
                  <FormField
                    control={form.control}
                    name="dateHired"
                    render={({ field }) => (
                       <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="MM/DD/YYYY"
                            {...field}
                            value={field.value || ""}
                            disabled={isViewOnly}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {editingEmployeeData?.id && (
                    <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        <Button type="button" variant="outline" onClick={() => setIsEmployeeTypeHistoryModalOpen(true)} disabled={isViewOnly}>
                            <History size={16} className="mr-2"/> View Type History
                        </Button>
                        <Button type="button" variant="outline" onClick={() => setIsPositionHistoryModalOpen(true)} disabled={isViewOnly}>
                            <History size={16} className="mr-2"/> View Position History
                        </Button>
                        <Button type="button" variant="outline" onClick={() => setIsEmployeeIdHistoryModalOpen(true)} disabled={isViewOnly}>
                            <History size={16} className="mr-2"/> View Employee ID History
                        </Button>
                    </div>
                  )}
                </>
              ))}

              {formSection("Contact Information", "contact", (
                <>
                  <FormField control={form.control} name="mobileNumber" render={({ field }) => ( <FormItem> <FormLabel>Mobile Number*</FormLabel> <FormControl><Input placeholder="09123456789" {...field} value={field.value || ""} disabled={isViewOnly} /></FormControl> <FormMessage /> </FormItem> )} />
                  <FormField control={form.control} name="address" render={({ field }) => ( <FormItem className="md:col-span-2"> <FormLabel>Address*</FormLabel> <FormControl><Textarea placeholder="123 Main St, City, Country" {...field} value={field.value || ""} disabled={isViewOnly} /></FormControl> <FormMessage /> </FormItem> )} />
                </>
              ))}

              {formSection("Emergency Contact", "emergency", (
                <>
                  <FormField control={form.control} name="emergencyContactPersonName" render={({ field }) => ( <FormItem> <FormLabel>Contact Person Name*</FormLabel> <FormControl><Input placeholder="Contact Person Name" {...field} value={field.value || ""} disabled={isViewOnly} /></FormControl> <FormMessage /> </FormItem> )} />
                  <FormField control={form.control} name="emergencyContactRelationship" render={({ field }) => ( <FormItem> <FormLabel>Relationship*</FormLabel> <FormControl><Input placeholder="Spouse" {...field} value={field.value || ""} disabled={isViewOnly} /></FormControl> <FormMessage /> </FormItem> )} />
                  <FormField control={form.control} name="emergencyContactNumber" render={({ field }) => ( <FormItem> <FormLabel>Contact Number*</FormLabel> <FormControl><Input placeholder="09123456789" {...field} value={field.value || ""} disabled={isViewOnly} /></FormControl> <FormMessage /> </FormItem> )} />
                </>
              ))}

              {formSection("Government IDs", "government", (
                <>
                  <FormField control={form.control} name="tinNumber" render={({ field }) => ( <FormItem> <FormLabel>TIN Number</FormLabel> <FormControl><Input placeholder="123-456-789-000" {...field} value={field.value || ""} disabled={isViewOnly} /></FormControl> <FormMessage /> </FormItem> )} />
                  <FormField control={form.control} name="sssNumber" render={({ field }) => ( <FormItem> <FormLabel>SSS Number</FormLabel> <FormControl><Input placeholder="01-2345678-9" {...field} value={field.value || ""} disabled={isViewOnly} /></FormControl> <FormMessage /> </FormItem> )} />
                  <FormField control={form.control} name="philHealthNumber" render={({ field }) => ( <FormItem> <FormLabel>PhilHealth Number</FormLabel> <FormControl><Input placeholder="12-012345678-9" {...field} value={field.value || ""} disabled={isViewOnly} /></FormControl> <FormMessage /> </FormItem> )} />
                  <FormField control={form.control} name="pagIbigNumber" render={({ field }) => ( <FormItem> <FormLabel>Pag-IBIG Number</FormLabel> <FormControl><Input placeholder="1234-5678-9012" {...field} value={field.value || ""} disabled={isViewOnly} /></FormControl> <FormMessage /> </FormItem> )} />
                </>
              ))}

              {formSection("Payment Information", "payment", (
                <>
                  <FormField control={form.control} name="paymentMethod" render={({ field }) => ( <FormItem> <FormLabel>Payment Method*</FormLabel> <Select onValueChange={field.onChange} value={field.value || ""} disabled={isViewOnly}> <FormControl><SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger></FormControl> <SelectContent>{paymentMethods.map(method => <SelectItem key={method} value={method}>{method}</SelectItem>)}</SelectContent> </Select> <FormMessage /> </FormItem> )} />
                  {form.watch("paymentMethod") === "Bank Transfer" && (
                    <>
                      <FormField control={form.control} name="bankName" render={({ field }) => ( <FormItem> <FormLabel>Bank Name</FormLabel> <FormControl><Input placeholder="Example Bank" {...field} value={field.value || ""} disabled={isViewOnly} /></FormControl> <FormMessage /> </FormItem> )} />
                      <FormField control={form.control} name="accountNumber" render={({ field }) => ( <FormItem> <FormLabel>Account Number</FormLabel> <FormControl><Input placeholder="1234567890" {...field} value={field.value || ""} disabled={isViewOnly} /></FormControl> <FormMessage /> </FormItem> )} />
                    </>
                  )}
                  {form.watch("paymentMethod") !== "Bank Transfer" && ( <> <div className="md:col-span-1 h-0"></div> <div className="md:col-span-1 h-0"></div> </> )}
                </>
              ))}

              {formSection("Salary Information", "salary", (
                <>
                  <FormField control={form.control} name="salaryType" render={({ field }) => ( <FormItem> <FormLabel>Salary Type*</FormLabel> <Select onValueChange={field.onChange} value={field.value || ""} disabled={isViewOnly}> <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl> <SelectContent>{salaryTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent> </Select> <FormMessage /> </FormItem> )} />
                  <FormField control={form.control} name="basicSalary" render={({ field }) => ( <FormItem> <FormLabel>Basic Salary (PHP)*</FormLabel> <FormControl><Input type="number" placeholder="500" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} disabled={isViewOnly} /></FormControl> <FormMessage /> </FormItem> )} />
                  <FormItem> <FormLabel>Hourly Rate</FormLabel> <Input value={hourlyRate} disabled className="bg-muted/50" /> <FormDescription>Auto-calculated if Salary Type is Daily (8-hour workday).</FormDescription> </FormItem>
                  <FormItem> <FormLabel>Monthly Equivalent</FormLabel> <Input value={monthlyEquivalent} disabled className="bg-muted/50" /> <FormDescription>Auto-calculated if Salary Type is Daily (approx. 22 working days/month).</FormDescription> </FormItem>
                   {editingEmployeeData?.id && (
                      <div className="md:col-span-2">
                          <Button type="button" variant="outline" onClick={() => setIsRateHistoryModalOpen(true)} disabled={isViewOnly}>
                              <History size={16} className="mr-2"/> View/Manage Rate History
                          </Button>
                      </div>
                  )}
                </>
              ))}
              
              {formSection("Pay Rate Multipliers", "multipliers",
                <>
                  <FormField control={form.control} name="overtimeMultiplier" render={({ field }) => ( <FormItem> <FormLabel>Overtime Multiplier</FormLabel> <FormControl><Input type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} disabled={isViewOnly} /></FormControl> <FormMessage /> </FormItem> )} />
                  <FormField control={form.control} name="regularHolidayMultiplier" render={({ field }) => ( <FormItem> <FormLabel>Regular Holiday Multiplier</FormLabel> <FormControl><Input type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} disabled={isViewOnly} /></FormControl> <FormMessage /> </FormItem> )} />
                  <FormField control={form.control} name="specialHolidayMultiplier" render={({ field }) => ( <FormItem> <FormLabel>Special Holiday Multiplier</FormLabel> <FormControl><Input type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} disabled={isViewOnly} /></FormControl> <FormMessage /> </FormItem> )} />
                </>
              )}

              
              {(watchEmployeeType === "Regular" || watchEmployeeType === "Fixed-term") && formSection("Leave Management", "leave", (
                <FormField control={form.control} name="leaveCredits" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Annual Leave Credits</FormLabel>
                    <FormControl><Input type="number" {...field} value={field.value ?? ''} onChange={e => field.onChange(parseInt(e.target.value, 10) || 0)} disabled={isViewOnly} /></FormControl>
                    <FormDescription>Total paid leave credits available per year for this employee.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              ))}

              {formSection("Standard Deductions (Optional)", "deductions", (
                <>
                  <FormField control={form.control} name="sssDeduction" render={({ field }) => ( <FormItem> <FormLabel>SSS (PHP)</FormLabel> <FormControl><Input type="number" placeholder="0.00" value={field.value ?? ''} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} disabled={isViewOnly} /></FormControl> <FormMessage /> </FormItem> )} />
                  <FormField control={form.control} name="philHealthDeduction" render={({ field }) => ( <FormItem> <FormLabel>PhilHealth (PHP)</FormLabel> <FormControl><Input type="number" placeholder="0.00" value={field.value ?? ''} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} disabled={isViewOnly} /></FormControl> <FormMessage /> </FormItem> )} />
                  <FormField control={form.control} name="hdmfDeduction" render={({ field }) => ( <FormItem> <FormLabel>HDMF (Pag-IBIG) (PHP)</FormLabel> <FormControl><Input type="number" placeholder="0.00" value={field.value ?? ''} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} disabled={isViewOnly} /></FormControl> <FormMessage /> </FormItem> )} />
                </>
              ))}
          </div>
        </form>
      </FormProvider>
      {editingEmployeeData?.id && (
        <>
            <RateHistoryModal
                isOpen={isRateHistoryModalOpen}
                onOpenChange={setIsRateHistoryModalOpen}
                employeeId={editingEmployeeData.id}
                employeeName={`${editingEmployeeData.firstName || ''} ${editingEmployeeData.lastName || ''}`}
            />
            <PositionHistoryModal
                isOpen={isPositionHistoryModalOpen}
                onOpenChange={setIsPositionHistoryModalOpen}
                employeeId={editingEmployeeData.id}
                employeeName={`${editingEmployeeData.firstName || ''} ${editingEmployeeData.lastName || ''}`}
                positions={positions}
            />
             <EmployeeIdHistoryModal
                isOpen={isEmployeeIdHistoryModalOpen}
                onOpenChange={setIsEmployeeIdHistoryModalOpen}
                employeeId={editingEmployeeData.id}
                employeeName={`${editingEmployeeData.firstName || ''} ${editingEmployeeData.lastName || ''}`}
            />
            <EmployeeTypeHistoryModal
                isOpen={isEmployeeTypeHistoryModalOpen}
                onOpenChange={setIsEmployeeTypeHistoryModalOpen}
                employeeId={editingEmployeeData.id}
                employeeName={`${editingEmployeeData.firstName || ''} ${editingEmployeeData.lastName || ''}`}
                employeeTypes={employeeTypes}
            />
        </>
      )}
    </>
  );
}
