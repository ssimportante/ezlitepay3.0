// src/lib/firebase/firestore-services/employee-service.ts
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  writeBatch,
  getDoc,
  serverTimestamp,
  Timestamp,
  type FieldValue,
  orderBy,
  where,
  limit,
  getDocFromServer,
  getDocsFromServer,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config"; // Client-side db
import type { EmployeeFormValues } from "@/app/(app)/employees/components/employee-form-schema";
import type { Employee } from "@/app/(app)/employees/components/employee-types";
import type { RateHistory, PositionHistory, EmployeeIdHistory, EmployeeTypeHistory } from "@/types/history";
import { convertTimestampsToDates } from "./utils";
import { startOfToday } from "date-fns";
import { createAuditLog } from "./log-service";

const EMPLOYEES_COLLECTION = "employees";

// Type for data prepared to be sent TO Firestore
// Ensures date fields are Date | null for Firestore SDK compatibility
export type EmployeeDataForFirestore = Omit<EmployeeFormValues, 'birthDate' | 'dateHired' | 'profilePicture'> & {
  id?: string; // For updates
  birthDate?: Date | null; // Expect Date or null
  dateHired?: Date | null; // Expect Date or null
  profilePicture?: string | null;
  creatorId?: string;
  createdAt?: Timestamp | FieldValue; 
  updatedAt?: Timestamp | FieldValue;
  dateInactive?: Date | null;
  dateReactivated?: Date | null;
};


/**
 * Propagates changes of an employee's ID or name to all related sub-collections.
 * This runs as a background "fire-and-forget" task.
 * @param oldEmployeeId The employee's ID before the change (used for querying).
 * @param payload An object containing the new employeeId and/or employeeName to update.
 */
async function updateRelatedDocuments(oldEmployeeId: string, payload: { employeeId?: string; employeeName?: string; }) {
  const collectionsToUpdate = ["timeLogEvents", "schedules", "leaveRequests", "payslips"];
  const batch = writeBatch(db);
  console.log(`[updateRelatedDocuments] Starting background update for old ID ${oldEmployeeId} with payload:`, payload);

  for (const collectionName of collectionsToUpdate) {
    try {
      const q = query(collection(db, collectionName), where("employeeId", "==", oldEmployeeId));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        console.log(`[updateRelatedDocuments] Found ${querySnapshot.size} documents in '${collectionName}' to update.`);
        querySnapshot.forEach((docToUpdate) => {
          batch.update(docToUpdate.ref, payload);
        });
      }
    } catch (error) {
      // Log error but don't re-throw, allowing other collections to be attempted.
      console.error(`[updateRelatedDocuments] Error querying '${collectionName}' for update:`, error);
    }
  }

  try {
    await batch.commit();
    console.log(`[updateRelatedDocuments] Successfully committed batch update for old ID ${oldEmployeeId}.`);
  } catch (error) {
    console.error(`[updateRelatedDocuments] CRITICAL: Error committing batch update for old ID ${oldEmployeeId}:`, error);
    // In a production app, this failure should be logged to a monitoring service.
    // For this context, we re-throw so the background promise rejection is noted.
    throw error;
  }
}


export async function addEmployee(employeeData: EmployeeDataForFirestore): Promise<string> {
  const finalCreatorId = employeeData.creatorId || "system"; // Default to system since auth is removed

  const dataToSave: Omit<EmployeeDataForFirestore, 'id'> & { createdAt: FieldValue, updatedAt: FieldValue, creatorId: string } = {
    ...employeeData,
    gender: employeeData.gender || "", // Ensure gender is an empty string if undefined
    degree: employeeData.degree || "",
    birthDate: employeeData.birthDate || null, // Ensure null if undefined
    dateHired: employeeData.dateHired || null, // Ensure null if undefined
    creatorId: finalCreatorId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    leaveCredits: employeeData.leaveCredits ?? 0,
  };
  
  if (dataToSave.profilePicture === undefined) {
    dataToSave.profilePicture = null;
  }

  if ((dataToSave.birthDate !== null && !(dataToSave.birthDate instanceof Date))) {
    console.error("[EmployeeService addEmployee] CRITICAL: birthDate is not a Date object or null.", dataToSave.birthDate);
    throw new Error("Attempted to save invalid birthDate to Firestore. Expected Date or null.");
  }
  if ((dataToSave.dateHired !== null && !(dataToSave.dateHired instanceof Date))) {
    console.error("[EmployeeService addEmployee] CRITICAL: dateHired is not a Date object or null.", dataToSave.dateHired);
    throw new Error("Attempted to save invalid dateHired to Firestore. Expected Date or null.");
  }
  
  const docRef = await addDoc(collection(db, EMPLOYEES_COLLECTION), dataToSave);
  
  // Audit Log
  await createAuditLog("Employee", `Added new employee: ${dataToSave.firstName} ${dataToSave.lastName} (ID: ${dataToSave.employeeId}).`);

  return docRef.id;
}


export async function getEmployeesService(): Promise<Employee[]> {
  try {
    const coll = collection(db, EMPLOYEES_COLLECTION);
    const q = query(coll, orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);

    const employees = querySnapshot.docs.map(doc => {
      const data = doc.data();
      const convertedData = convertTimestampsToDates(data, ['birthDate', 'dateHired', 'createdAt', 'updatedAt', 'dateInactive', 'dateReactivated']);
      return {
        id: doc.id,
        ...convertedData,
      } as Employee;
    });
    return employees;
  } catch (error) {
    console.error("[EmployeeService] getEmployeesService: Error getting employees from Firestore:", error);
    throw error;
  }
}

export async function getEmployeeDoc(employeeId: string, fromServer: boolean = false): Promise<Employee | null> {
    const docRef = doc(db, EMPLOYEES_COLLECTION, employeeId);
    const docSnap = fromServer ? await getDocFromServer(docRef) : await getDoc(docRef);
    if (!docSnap.exists()) return null;
    const data = docSnap.data();
    const convertedData = convertTimestampsToDates(data, ['birthDate', 'dateHired', 'createdAt', 'updatedAt', 'dateInactive', 'dateReactivated']);
    return { id: docSnap.id, ...convertedData } as Employee;
}


export async function getEmployeeById(employeeId: string): Promise<Employee | null> {
  try {
    const q = query(
      collection(db, EMPLOYEES_COLLECTION),
      where("employeeId", "==", employeeId),
      limit(1)
    );
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const docSnap = querySnapshot.docs[0];
      const data = docSnap.data();
      const convertedData = convertTimestampsToDates(data, ['birthDate', 'dateHired', 'createdAt', 'updatedAt', 'dateInactive', 'dateReactivated']);
      return {
        id: docSnap.id,
        ...convertedData,
      } as Employee;
    } else {
      console.log(`[EmployeeService] No employee found with employeeId: ${employeeId}`);
      return null;
    }
  } catch (error) {
    console.error(`[EmployeeService] getEmployeeById: Error getting employee by employeeId ${employeeId}:`, error);
    throw error;
  }
}


export async function updateEmployee(employeeId: string, employeeData: Partial<EmployeeDataForFirestore>): Promise<void> {
  const docRef = doc(db, EMPLOYEES_COLLECTION, employeeId);

  // --- Logic to check for changes to ID and name ---
  let oldEmployeeId: string | null = null;
  let oldEmployeeName: string | null = null;
  const currentDoc = await getDoc(docRef);
  if (currentDoc.exists()) {
      oldEmployeeId = currentDoc.data().employeeId;
      oldEmployeeName = `${currentDoc.data().firstName} ${currentDoc.data().lastName}`;
  }

  const newEmployeeId = employeeData.employeeId;
  const newFirstName = employeeData.hasOwnProperty('firstName') ? employeeData.firstName : currentDoc.exists() ? currentDoc.data().firstName : '';
  const newLastName = employeeData.hasOwnProperty('lastName') ? employeeData.lastName : currentDoc.exists() ? currentDoc.data().lastName : '';
  const newEmployeeName = `${newFirstName} ${newLastName}`.trim();
  // ---

  const dataToUpdate: Partial<EmployeeDataForFirestore & { updatedAt: FieldValue }> = {
    ...employeeData, // employeeData should have Date or null for date fields
    updatedAt: serverTimestamp(),
  };

  if (employeeData.hasOwnProperty('profilePicture') && (employeeData.profilePicture === "" || employeeData.profilePicture === undefined)) {
    dataToUpdate.profilePicture = null;
  }
  if (employeeData.hasOwnProperty('birthDate')) {
    dataToUpdate.birthDate = employeeData.birthDate || null;
  }
  if (employeeData.hasOwnProperty('dateHired')) {
    dataToUpdate.dateHired = employeeData.dateHired || null;
  }
  if (employeeData.hasOwnProperty('gender')) {
    dataToUpdate.gender = employeeData.gender || "";
  }
   if (employeeData.hasOwnProperty('degree')) {
    dataToUpdate.degree = employeeData.degree || "";
  }
  if (employeeData.hasOwnProperty('leaveCredits')) {
    dataToUpdate.leaveCredits = employeeData.leaveCredits ?? 0;
  }

  if (dataToUpdate.hasOwnProperty('birthDate') && (dataToUpdate.birthDate !== null && !(dataToUpdate.birthDate instanceof Date))) {
    throw new Error("Attempted to save invalid birthDate to Firestore on update. Expected Date or null.");
  }
  if (dataToUpdate.hasOwnProperty('dateHired') && (dataToUpdate.dateHired !== null && !(dataToUpdate.dateHired instanceof Date))) {
    throw new Error("Attempted to save invalid dateHired to Firestore on update. Expected Date or null.");
  }

  try {
    await updateDoc(docRef, dataToUpdate);
    
    // --- Trigger background update if ID or name changed ---
    const needsIdUpdate = oldEmployeeId && newEmployeeId && oldEmployeeId !== newEmployeeId;
    const needsNameUpdate = oldEmployeeName && newEmployeeName && oldEmployeeName !== newEmployeeName;

    if ((needsIdUpdate || needsNameUpdate) && oldEmployeeId) {
        console.log(`Triggering related document updates. ID changed: ${needsIdUpdate}, Name changed: ${needsNameUpdate}`);
        
        const updatePayload: { employeeId?: string, employeeName?: string } = {};
        if (needsIdUpdate) updatePayload.employeeId = newEmployeeId;
        if (needsNameUpdate) updatePayload.employeeName = newEmployeeName;

        // This is a "fire-and-forget" call from the UI's perspective. It runs in the background.
        updateRelatedDocuments(oldEmployeeId, updatePayload).catch(error => {
            console.error("CRITICAL BACKGROUND FAILURE: Failed to update related documents:", error);
            // In a real app, you would log this to a proper monitoring service.
        });
    }

    // Audit Log for a general update. Specific history logs are separate.
    await createAuditLog("Employee", `Updated details for employee: ${newEmployeeName || `(ID: ${newEmployeeId})`}.`);

  } catch (error) {
    console.error(`[EmployeeService] updateEmployee: Error updating employee ${employeeId}:`, error);
    throw error;
  }
}


export async function archiveEmployee(employeeId: string): Promise<void> {
  try {
    const docRef = doc(db, EMPLOYEES_COLLECTION, employeeId);
    await updateDoc(docRef, {
      status: "archived",
      updatedAt: serverTimestamp(),
    });
     // Audit Log
    const empDoc = await getDoc(docRef);
    const empName = empDoc.exists() ? `${empDoc.data().firstName} ${empDoc.data().lastName}` : employeeId;
    await createAuditLog("Employee", `Archived employee: ${empName}.`);
  } catch (error) {
    console.error(`[EmployeeService] archiveEmployee: Error archiving employee ${employeeId}:`, error);
    throw error;
  }
}

export async function setEmployeeInactive(employeeId: string, inactiveDate: Date): Promise<void> {
  try {
    const docRef = doc(db, EMPLOYEES_COLLECTION, employeeId);
    await updateDoc(docRef, {
      status: "Inactive",
      dateInactive: Timestamp.fromDate(inactiveDate),
      dateReactivated: null, // Clear reactivation date
      updatedAt: serverTimestamp(),
    });
     // Audit Log
    const empDoc = await getDoc(docRef);
    const empName = empDoc.exists() ? `${empDoc.data().firstName} ${empDoc.data().lastName}` : employeeId;
    await createAuditLog("Employee", `Marked employee as inactive: ${empName}.`);
  } catch (error) {
    console.error(`[EmployeeService] setEmployeeInactive: Error setting employee to inactive ${employeeId}:`, error);
    throw error;
  }
}

export async function setEmployeeActive(employeeId: string, reactivatedDate: Date): Promise<void> {
  try {
    const docRef = doc(db, EMPLOYEES_COLLECTION, employeeId);
    await updateDoc(docRef, {
      status: "active",
      dateReactivated: Timestamp.fromDate(reactivatedDate),
      dateInactive: null, // Explicitly clear dateInactive
      updatedAt: serverTimestamp(),
    });
     // Audit Log
    const empDoc = await getDoc(docRef);
    const empName = empDoc.exists() ? `${empDoc.data().firstName} ${empDoc.data().lastName}` : employeeId;
    await createAuditLog("Employee", `Reactivated employee: ${empName}.`);
  } catch (error) {
    console.error(`[EmployeeService] setEmployeeActive: Error setting employee to active ${employeeId}:`, error);
    throw error;
  }
}


export async function deleteEmployee(employeeId: string): Promise<void> {
  try {
    const mainDocRef = doc(db, EMPLOYEES_COLLECTION, employeeId);
    const empDoc = await getDoc(mainDocRef);
    const empName = empDoc.exists() ? `${empDoc.data().firstName} ${empDoc.data().lastName}` : employeeId;

    const batch = writeBatch(db);

    const documentsRef = collection(db, EMPLOYEES_COLLECTION, employeeId, "documents");
    const documentsSnapshot = await getDocs(documentsRef);
    if (!documentsSnapshot.empty) {
      documentsSnapshot.forEach(subDoc => {
        batch.delete(subDoc.ref);
      });
    }
    
    const rateHistoryRef = collection(db, EMPLOYEES_COLLECTION, employeeId, "rateHistory");
    const rateHistorySnapshot = await getDocs(rateHistoryRef);
    if (!rateHistorySnapshot.empty) {
        rateHistorySnapshot.forEach(subDoc => {
            batch.delete(subDoc.ref);
        });
    }
    
    batch.delete(mainDocRef);
    
    await batch.commit();

     // Audit Log
    await createAuditLog("Employee", `Permanently deleted employee: ${empName}.`);

  } catch (error) {
    console.error(`[EmployeeService] deleteEmployee: Error deleting employee ${employeeId} and their subcollections:`, error);
    throw error;
  }
}

export async function batchResetLeaveCreditsService(newCreditAmount: number): Promise<{ success: boolean, count: number, error?: string }> {
    const employeesRef = collection(db, EMPLOYEES_COLLECTION);
    const q = query(employeesRef, where("status", "==", "active"));

    try {
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            return { success: true, count: 0 };
        }

        const batch = writeBatch(db);
        querySnapshot.forEach(doc => {
            batch.update(doc.ref, { 
                leaveCredits: newCreditAmount,
                updatedAt: serverTimestamp(),
            });
        });

        await batch.commit();

        await createAuditLog("Employee", `Successfully reset leave credits to ${newCreditAmount} for ${querySnapshot.size} active employees.`);

        return { success: true, count: querySnapshot.size };

    } catch (error: any) {
        console.error("[EmployeeService] batchResetLeaveCredits: Error resetting leave credits:", error);
        await createAuditLog("Employee", `Failed to reset leave credits. Error: ${error.message || 'Unknown error'}`);
        return { success: false, count: 0, error: error.message || "An unknown error occurred." };
    }
}


// --- Employee Documents ---
export interface StoredEmployeeDocument {
  id: string;
  name: string;
  type: string;
  uploadDate: string; 
  url: string;
  storagePath: string;
  createdAt?: Date | Timestamp; 
}


export async function addEmployeeDocument(employeeId: string, documentData: Omit<StoredEmployeeDocument, "id" | "createdAt">): Promise<string> {
    try {
        const coll = collection(db, EMPLOYEES_COLLECTION, employeeId, "documents");
        const docRef = await addDoc(coll, {
            ...documentData,
            createdAt: serverTimestamp(),
        });

        // Audit Log
        await createAuditLog("Employee", `Added document '${documentData.name}' for employee ID ${employeeId}.`);

        return docRef.id;
    } catch (error) {
        console.error(`[EmployeeService] addEmployeeDocument: Error adding document for employee ${employeeId}:`, error);
        throw error;
    }
}

export async function getEmployeeDocuments(employeeId: string): Promise<StoredEmployeeDocument[]> {
    try {
        const coll = collection(db, EMPLOYEES_COLLECTION, employeeId, "documents");
        const q = query(coll);
        const querySnapshot = await getDocs(q);
        const documents = querySnapshot.docs.map(docSnapshot => {
            const data = docSnapshot.data();
            const convertedData = convertTimestampsToDates(data, ['createdAt']);
            
            return {
                id: docSnapshot.id,
                ...convertedData,
            } as StoredEmployeeDocument;
        });
        return documents;
    } catch (error) {
        console.error(`[EmployeeService] getEmployeeDocuments: Error getting documents for employee ${employeeId}:`, error);
        throw error;
    }
}

export async function deleteEmployeeDocument(employeeId: string, documentId: string): Promise<void> {
    try {
        const docRef = doc(db, EMPLOYEES_COLLECTION, employeeId, "documents", documentId);
        // For audit log, we need to get the document name before deleting it
        const docSnap = await getDoc(docRef);
        const docName = docSnap.exists() ? docSnap.data().name : `ID ${documentId}`;

        await deleteDoc(docRef);

         // Audit Log
        await createAuditLog("Employee", `Deleted document '${docName}' for employee ID ${employeeId}.`);

    } catch (error) {
        console.error(`[EmployeeService] deleteEmployeeDocument: Error deleting document ${documentId} for employee ${employeeId}:`, error);
        throw error;
    }
}

// =================================================================
// GENERIC HISTORY SERVICE LOGIC
// =================================================================

type HistorySubcollection = 'rateHistory' | 'positionHistory' | 'employeeIdHistory' | 'employeeTypeHistory';

async function getHistory<T>(employeeDocId: string, subcollection: HistorySubcollection, fromServer: boolean = false): Promise<T[]> {
  if (!employeeDocId) return [];
  const historyRef = collection(db, EMPLOYEES_COLLECTION, employeeDocId, subcollection);
  const q = query(historyRef, orderBy("effectiveDate", "desc"));
  const querySnapshot = fromServer ? await getDocsFromServer(q) : await getDocs(q);
  return querySnapshot.docs.map((doc) => {
    const data = doc.data();
    const convertedData = convertTimestampsToDates(data, ['effectiveDate']);
    return { id: doc.id, ...convertedData } as T;
  });
}

async function addHistoryEntry<T extends { effectiveDate: Date }>(
  employeeDocId: string,
  subcollection: HistorySubcollection,
  entry: T,
  employeeUpdateField: keyof EmployeeDataForFirestore,
  logName: string,
  shouldUpdateMainDoc: boolean = true,
): Promise<string> {
  const newHistoryRef = await addDoc(collection(db, EMPLOYEES_COLLECTION, employeeDocId, subcollection), {
    ...entry,
    effectiveDate: Timestamp.fromDate(entry.effectiveDate),
  });

  if (shouldUpdateMainDoc) {
    await updateEmployeeFieldFromHistory(employeeDocId, subcollection, employeeUpdateField);
  }
  
  const value = (entry as any)[employeeUpdateField.toString()];
  await createAuditLog("Employee", `Added new ${logName} of '${value}' for employee, effective ${entry.effectiveDate.toLocaleDateString()}.`);

  return newHistoryRef.id;
}

async function deleteHistoryEntry(
  employeeDocId: string,
  subcollection: HistorySubcollection,
  historyId: string,
  employeeUpdateField: keyof EmployeeDataForFirestore,
  logName: string
): Promise<void> {
  const docRef = doc(db, EMPLOYEES_COLLECTION, employeeDocId, subcollection, historyId);
  const docSnap = await getDoc(docRef);
  const data = docSnap.exists() ? docSnap.data() : null;

  await deleteDoc(docRef);
  await updateEmployeeFieldFromHistory(employeeDocId, subcollection, employeeUpdateField);

  if (data) {
    const value = data[employeeUpdateField as string];
    const effectiveDate = (data.effectiveDate as Timestamp).toDate().toLocaleDateString();
    await createAuditLog("Employee", `Deleted ${logName} of '${value}' (effective ${effectiveDate}) for employee.`);
  }
}

async function updateEmployeeFieldFromHistory(
  employeeDocId: string,
  subcollection: HistorySubcollection,
  employeeUpdateField: keyof EmployeeDataForFirestore
) {
  const q = query(
    collection(db, EMPLOYEES_COLLECTION, employeeDocId, subcollection),
    where("effectiveDate", "<=", startOfToday()),
    orderBy("effectiveDate", "desc"),
    limit(1)
  );

  const latestHistorySnapshot = await getDocs(q);

  // This was the source of the bug. It should only update if a value is found.
  if (!latestHistorySnapshot.empty) {
    const currentEntry = latestHistorySnapshot.docs[0].data();
    const newValue = currentEntry[employeeUpdateField as string];
    
    // Check for null/undefined to prevent accidentally wiping the field.
    if (newValue !== undefined && newValue !== null) {
      const employeeDocRef = doc(db, EMPLOYEES_COLLECTION, employeeDocId);
      await updateDoc(employeeDocRef, {
        [employeeUpdateField]: newValue,
        updatedAt: serverTimestamp(),
      });
    }
  }
  // If no entry is found, we now do nothing, preventing the field from being cleared.
}

// --- Rate History (Specific Implementation) ---
export const getRateHistory = (employeeDocId: string, fromServer: boolean = false) => getHistory<RateHistory>(employeeDocId, 'rateHistory', fromServer);
export const addRateHistory = (employeeDocId: string, rate: number, effectiveDate: Date, updateMainDoc: boolean = true) => addHistoryEntry(employeeDocId, 'rateHistory', { rate, effectiveDate }, 'basicSalary', 'salary rate', updateMainDoc);
export const deleteRateHistory = (employeeDocId: string, historyId: string) => deleteHistoryEntry(employeeDocId, 'rateHistory', historyId, 'basicSalary', 'salary rate');

// --- Position History (Specific Implementation) ---
export const getPositionHistory = (employeeDocId: string, fromServer: boolean = false) => getHistory<PositionHistory>(employeeDocId, 'positionHistory', fromServer);
export const addPositionHistory = (employeeDocId: string, position: string, effectiveDate: Date, updateMainDoc: boolean = true) => addHistoryEntry(employeeDocId, 'positionHistory', { position, effectiveDate }, 'position', 'position', updateMainDoc);
export const deletePositionHistory = (employeeDocId: string, historyId: string) => deleteHistoryEntry(employeeDocId, 'positionHistory', historyId, 'position', 'position');

// --- Employee ID History (Specific Implementation) ---
export const getEmployeeIdHistory = (employeeDocId: string, fromServer: boolean = false) => getHistory<EmployeeIdHistory>(employeeDocId, 'employeeIdHistory', fromServer);
export const addEmployeeIdHistory = (employeeDocId: string, employeeId: string, effectiveDate: Date, updateMainDoc: boolean = true) => addHistoryEntry(employeeDocId, 'employeeIdHistory', { employeeId, effectiveDate }, 'employeeId', 'Employee ID', updateMainDoc);
export const deleteEmployeeIdHistory = (employeeDocId: string, historyId: string) => deleteHistoryEntry(employeeDocId, 'employeeIdHistory', historyId, 'employeeId', 'Employee ID');

// --- Employee Type History (Specific Implementation) ---
export const getEmployeeTypeHistory = (employeeDocId: string, fromServer: boolean = false) => getHistory<EmployeeTypeHistory>(employeeDocId, 'employeeTypeHistory', fromServer);
export const addEmployeeTypeHistory = (employeeDocId: string, employeeType: string, effectiveDate: Date, updateMainDoc: boolean = true) => addHistoryEntry(employeeDocId, 'employeeTypeHistory', { employeeType, effectiveDate }, 'employeeType', 'employee type', updateMainDoc);
export const deleteEmployeeTypeHistory = (employeeDocId: string, historyId: string) => deleteHistoryEntry(employeeDocId, 'employeeTypeHistory', historyId, 'employeeType', 'employee type');
