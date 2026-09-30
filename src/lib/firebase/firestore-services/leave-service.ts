
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  type FieldValue,
  query,
  orderBy,
  where,
  getDoc,
  runTransaction,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import type { LeaveRequest, LeaveRequestStatus, LeaveType } from "@/types/leave";
import { differenceInCalendarDays, startOfDay } from "date-fns";
import { getEmployeeById } from "./employee-service";

const LEAVE_REQUESTS_COLLECTION = "leaveRequests";
const EMPLOYEES_COLLECTION = "employees";


export interface LeaveRequestData extends Omit<LeaveRequest, 'id' | 'startDate' | 'endDate' | 'createdAt' | 'status'> {
    // uid is now handled internally by the service, not required from the caller
}

const convertDocToLeaveRequest = (docId: string, docData: any): LeaveRequest => {
  return {
    id: docId,
    uid: docData.uid,
    employeeId: docData.employeeId,
    employeeName: docData.employeeName,
    startDate: (docData.startDate as Timestamp).toDate(),
    endDate: (docData.endDate as Timestamp).toDate(),
    leaveType: docData.leaveType,
    status: docData.status,
    reason: docData.reason,
    formUrl: docData.formUrl,
    createdAt: (docData.createdAt as Timestamp)?.toDate() || new Date(),
  };
};

export async function getLeaveRequestsService(
  filters?: {
    employeeId?: string;
    type?: LeaveType | 'all';
    status?: LeaveRequestStatus | 'all';
    dateRange?: { from?: Date; to?: Date };
  }
): Promise<LeaveRequest[]> {
  let q = query(collection(db, LEAVE_REQUESTS_COLLECTION), orderBy("createdAt", "desc"));

  if (filters) {
    if (filters.employeeId && filters.employeeId !== 'all') {
      q = query(q, where("employeeId", "==", filters.employeeId));
    }
    if (filters.type && filters.type !== 'all') {
      q = query(q, where("leaveType", "==", filters.type));
    }
    if (filters.status && filters.status !== 'all') {
      q = query(q, where("status", "==", filters.status));
    }
    if (filters.dateRange?.from) {
      q = query(q, where("startDate", ">=", Timestamp.fromDate(filters.dateRange.from)));
    }
    if (filters.dateRange?.to) {
      q = query(q, where("startDate", "<=", Timestamp.fromDate(filters.dateRange.to)));
    }
  }

  const querySnapshot = await getDocs(q);
  const leaveRequests = querySnapshot.docs.map(doc => convertDocToLeaveRequest(doc.id, doc.data()));

  return leaveRequests;
}

export async function createLeaveRequest(
  leaveData: Omit<LeaveRequest, 'id' | 'uid' | 'createdAt' | 'status'>
): Promise<string> {
  const uid = "system"; // No auth user

  const { employeeId, startDate, endDate, leaveType } = leaveData;

  // Check for sufficient leave credits for 'Paid' leave BEFORE creating the request
  if (leaveType === 'Paid') {
    const employeeQuery = query(
      collection(db, EMPLOYEES_COLLECTION),
      where("employeeId", "==", employeeId)
    );
    const employeeSnapshot = await getDocs(employeeQuery);

    if (employeeSnapshot.empty) {
      throw new Error(`Employee with ID ${employeeId} not found.`);
    }
    const employeeDoc = employeeSnapshot.docs[0];
    const employeeData = employeeDoc.data();
    
    const currentLeaveCredits = employeeData.leaveCredits ?? 0;
    const leaveDuration = differenceInCalendarDays(endDate, startDate) + 1;

    if (currentLeaveCredits < leaveDuration) {
      throw new Error("Insufficient leave credits for the requested dates.");
    }
  }

  // Create the leave request with a "Pending" status
  const leaveRequestRef = await addDoc(collection(db, LEAVE_REQUESTS_COLLECTION), {
      ...leaveData,
      formUrl: leaveData.formUrl,
      uid: uid,
      startDate: Timestamp.fromDate(startOfDay(startDate)),
      endDate: Timestamp.fromDate(startOfDay(endDate)),
      status: "Pending" as LeaveRequestStatus, // New requests are now Pending
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
  });

  return leaveRequestRef.id;
}


export async function updateLeaveRequestStatus(
  id: string,
  newStatus: LeaveRequestStatus
): Promise<void> {
  const leaveRequestRef = doc(db, LEAVE_REQUESTS_COLLECTION, id);

  await runTransaction(db, async (transaction) => {
    const leaveRequestDoc = await transaction.get(leaveRequestRef);
    if (!leaveRequestDoc.exists()) {
      throw new Error("Leave request not found!");
    }

    const leaveRequestData = leaveRequestDoc.data();
    const oldStatus = leaveRequestData.status as LeaveRequestStatus;

    // Proceed only if status is actually changing and leave type is 'Paid'
    if (oldStatus !== newStatus && leaveRequestData.leaveType === 'Paid') {
      const employeeQuery = query(
        collection(db, EMPLOYEES_COLLECTION),
        where("employeeId", "==", leaveRequestData.employeeId)
      );
      const employeeSnapshot = await getDocs(employeeQuery);
      
      if (employeeSnapshot.empty) {
        console.warn(`[LeaveService] Could not find employee with ID ${leaveRequestData.employeeId} to update leave credits.`);
      } else {
        const employeeDoc = employeeSnapshot.docs[0];
        const employeeRef = employeeDoc.ref;
        const employeeData = employeeDoc.data();
        const currentLeaveCredits = employeeData.leaveCredits ?? 0;

        const leaveDuration = differenceInCalendarDays(
            (leaveRequestData.endDate as Timestamp).toDate(),
            (leaveRequestData.startDate as Timestamp).toDate()
        ) + 1;
        
        let newLeaveCredits = currentLeaveCredits;

        // Case 1: A request is being approved. Deduct credits.
        if (newStatus === 'Approved' && oldStatus !== 'Approved') {
          newLeaveCredits -= leaveDuration;
        } 
        // Case 2: An approved request is being changed to something else (e.g. rejected). Refund credits.
        else if (oldStatus === 'Approved' && newStatus !== 'Approved') {
          newLeaveCredits += leaveDuration;
        }
        
        // Update employee document only if credits changed
        if (newLeaveCredits !== currentLeaveCredits) {
           transaction.update(employeeRef, { leaveCredits: newLeaveCredits });
        }
      }
    }
    
    // Finally, update the leave request status
    transaction.update(leaveRequestRef, {
      status: newStatus,
      updatedAt: serverTimestamp(),
    });
  });
}


export async function deleteLeaveRequest(id: string): Promise<void> {
  const leaveRequestRef = doc(db, LEAVE_REQUESTS_COLLECTION, id);

  await runTransaction(db, async (transaction) => {
    const leaveRequestDoc = await transaction.get(leaveRequestRef);
    if (!leaveRequestDoc.exists()) {
      // If document is already gone, just succeed silently.
      return;
    }

    const leaveRequestData = leaveRequestDoc.data();

    // If the request was an approved 'Paid' leave, refund the credits
    if (leaveRequestData.status === 'Approved' && leaveRequestData.leaveType === 'Paid') {
      const employeeQuery = query(
        collection(db, EMPLOYEES_COLLECTION),
        where("employeeId", "==", leaveRequestData.employeeId)
      );
      const employeeSnapshot = await getDocs(employeeQuery);

      if (!employeeSnapshot.empty) {
        const employeeDoc = employeeSnapshot.docs[0];
        const employeeRef = employeeDoc.ref;
        const employeeData = employeeDoc.data();
        const currentLeaveCredits = employeeData.leaveCredits ?? 0;

        const leaveDuration = differenceInCalendarDays(
          (leaveRequestData.endDate as Timestamp).toDate(),
          (leaveRequestData.startDate as Timestamp).toDate()
        ) + 1;

        const newLeaveCredits = currentLeaveCredits + leaveDuration;
        transaction.update(employeeRef, { leaveCredits: newLeaveCredits });
      } else {
        console.warn(`[LeaveService] Could not find employee with ID ${leaveRequestData.employeeId} to refund leave credits on deletion.`);
      }
    }

    // Finally, delete the leave request itself
    transaction.delete(leaveRequestRef);
  });
}
