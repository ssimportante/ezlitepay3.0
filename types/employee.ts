

export type EmploymentStatus =
  | 'Active'
  | 'On-Leave'
  | 'Terminated'
  | 'Inactive';

export type PayFrequency = 'Weekly' | 'Bi-Weekly' | 'Monthly';

export type PayMultiplier = {
  id: string; // e.g., 'regular', 'special', 'legal'
  name: string; // e.g., 'Regular Holiday', 'Special Non-Working Holiday'
  rate: number; // e.g., 1.5, 2.0
};

export interface Employee {
  id: string;
  uid?: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  dateOfBirth: string; // ISO 8601 format
  dateOfHire: string; // ISO 8601 format
  jobTitle: string;
  department: string;
  employmentStatus: EmploymentStatus;
  payRate: number;
  payFrequency: PayFrequency;
  payMultipliers: PayMultiplier[];
  taxId?: string; // e.g., TIN
  bankAccountNumber?: string;
  bankName?: string;
  photoUrl?: string; // URL to the employee's photo
  notes?: string;
}

export interface EmployeeDocument {
  id: string;
  name: string;
  url: string; // URL to the stored document in Firebase Storage
  type: 'resume' | 'contract' | 'id' | 'other';
  uploadedAt: string; // ISO 8601 format
}
