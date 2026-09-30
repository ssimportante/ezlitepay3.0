
import { z } from "zod";

const employeeStatuses = z.enum(["active" , "archived" , "terminated" , "inactive" , "on leave" , "resigned" , "end-of-contract"]);

export const employeeFormSchema = z.object({
  // Personal Information
  employeeType: z.string().min(1, "Employee type is required"),
  employeeId: z.string().min(1, "Employee ID is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  gender: z.string().optional(), // Added gender
  status: z.string().transform(val => val.toLowerCase()).pipe(employeeStatuses),
  // Changed to validate string format MM/DD/YYYY
  birthDate: z.string().regex(/^(\d{2}\/\d{2}\/\d{4})?$/, "Invalid date format (MM/DD/YYYY)").optional().nullable(),
  position: z.string().optional(),
  degree: z.string().optional(),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  department: z.string().optional(),
  // Changed to validate string format MM/DD/YYYY
  dateHired: z.string().regex(/^(\d{2}\/\d{2}\/\d{4})?$/, "Invalid date format (MM/DD/YYYY)").optional().nullable(),
  profilePicture: z.string().optional().nullable(),

  // Contact Information
  mobileNumber: z.string().min(1, "Mobile number is required"),
  address: z.string().min(1, "Address is required"),

  // Emergency Contact
  emergencyContactPersonName: z.string().min(1, "Emergency contact name is required"),
  emergencyContactRelationship: z.string().min(1, "Emergency contact relationship is required"),
  emergencyContactNumber: z.string().min(1, "Emergency contact number is required"),

  // Government IDs
  tinNumber: z.string().optional(),
  sssNumber: z.string().optional(),
  philHealthNumber: z.string().optional(),
  pagIbigNumber: z.string().optional(),

  // Payment Information
  paymentMethod: z.string().min(1, "Payment method is required"),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),

  // Salary Information
  salaryType: z.string().min(1, "Salary type is required"),
  basicSalary: z.coerce.number().min(0, "Basic salary must be non-negative"),

  // Pay Rate Multipliers
  overtimeMultiplier: z.coerce.number().min(1, "Overtime multiplier must be at least 1.0"),
  regularHolidayMultiplier: z.coerce.number().min(1, "Regular holiday multiplier must be at least 1.0"),
  specialHolidayMultiplier: z.coerce.number().min(1, "Special holiday multiplier must be at least 1.0"),

  // Standard Deductions
  sssDeduction: z.coerce.number().optional(),
  philHealthDeduction: z.coerce.number().optional(),
  hdmfDeduction: z.coerce.number().optional(),

  // Leave Management
  leaveCredits: z.coerce.number().optional(),
});

export type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

    