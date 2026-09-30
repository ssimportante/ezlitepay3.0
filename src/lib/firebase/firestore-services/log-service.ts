
// src/lib/firebase/firestore-services/log-service.ts
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  where,
  type QueryConstraint,
  type FieldValue,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";
import { convertTimestampsToDates } from "./utils";

const AUDIT_LOGS_COLLECTION = "auditLogs";

export type LogActionType = "Employee" | "Schedule" | "TimeLog" | "Payroll" | "LeaveRequest" | "CompanySettings" | "Customization";

export interface AuditLog {
  id: string;
  timestamp: Date;
  user: string; // Typically a user's email or "System"
  actionType: LogActionType;
  description: string;
}

interface AuditLogDataForFirestore {
  timestamp: FieldValue;
  user: string;
  actionType: LogActionType;
  description: string;
}

/**
 * Creates a new audit log entry. This is the central function for logging activities.
 * It automatically captures the authenticated user's email.
 * @param actionType The category of the action.
 * @param description A detailed description of what happened.
 */
export async function createAuditLog(
  actionType: LogActionType,
  description: string,
  userOverride?: string // Optional override for specific system actions
): Promise<void> {
  try {
    const currentUser = auth.currentUser;
    const userIdentifier = userOverride || currentUser?.email || "System";

    const logData: AuditLogDataForFirestore = {
      user: userIdentifier,
      actionType,
      description,
      timestamp: serverTimestamp(),
    };
    await addDoc(collection(db, AUDIT_LOGS_COLLECTION), logData);
  } catch (error) {
    // Log to console but don't throw, as logging failure shouldn't crash the main operation.
    console.error("[LogService] Failed to create audit log:", error);
  }
}

/**
 * Fetches audit logs from Firestore with optional filters.
 * @param filters Optional filters for date range, user, or action type.
 */
export async function getAuditLogs(
  filters: {
    dateRange?: { from?: Date; to?: Date };
    user?: string;
    actionType?: LogActionType | "all";
  }
): Promise<AuditLog[]> {
  try {
    const constraints: QueryConstraint[] = [orderBy("timestamp", "desc")];
    
    if (filters.dateRange?.from) {
      constraints.push(where("timestamp", ">=", Timestamp.fromDate(filters.dateRange.from)));
    }
    if (filters.dateRange?.to) {
      constraints.push(where("timestamp", "<=", Timestamp.fromDate(filters.dateRange.to)));
    }
    if (filters.user && filters.user !== 'all') {
      constraints.push(where("user", "==", filters.user));
    }
    if (filters.actionType && filters.actionType !== 'all') {
      constraints.push(where("actionType", "==", filters.actionType));
    }

    const q = query(collection(db, AUDIT_LOGS_COLLECTION), ...constraints);
    const querySnapshot = await getDocs(q);

    const logs = querySnapshot.docs.map(doc => {
      const data = doc.data();
      const convertedData = convertTimestampsToDates(data, ['timestamp']);
      return { id: doc.id, ...convertedData } as AuditLog;
    });

    return logs;
  } catch (error) {
    console.error("[LogService] Error getting audit logs from Firestore:", error);
    throw error;
  }
}
