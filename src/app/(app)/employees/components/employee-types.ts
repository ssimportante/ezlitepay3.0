
import type { EmployeeFormValues } from "./employee-form-schema";

// This type represents the data structure as it should be after fetching from Firestore
// (where Timestamps are converted to Date objects) or when preparing data for UI display.
export type Employee = Omit<EmployeeFormValues, 'birthDate' | 'dateHired'> & {
  id: string;
  birthDate?: Date | null; // Dates are Date objects or null
  dateHired?: Date | null; // Dates are Date objects or null
  creatorId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  dateInactive?: Date | null;
  dateReactivated?: Date | null;
  profilePicture?: string | null;
};
