// src/lib/firebase/firestore-services/payslip-service.ts
import {
  collection,
  addDoc,
  getDocs,
  doc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  type FieldValue,
  where,
  QueryConstraint,
  updateDoc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import type { Payslip } from "@/app/(app)/payroll/page";

const PAYSLIPS_COLLECTION = "payslips";

interface PayslipDataForFirestore extends Omit<Payslip, 'id' | 'payDate' | 'createdAt' | 'updatedAt' > {
  payDate: Timestamp;
  createdAt?: FieldValue;
  updatedAt: FieldValue;
}

const convertPayslipTimestampsToDates = (payslipData: any): Payslip => {
    const data = { ...payslipData };
    if (data.payDate && data.payDate instanceof Timestamp) {
        data.payDate = data.payDate.toDate();
    }
     if (data.createdAt && data.createdAt instanceof Timestamp) {
        data.createdAt = data.createdAt.toDate();
    }
    if (data.updatedAt && data.updatedAt instanceof Timestamp) {
        data.updatedAt = data.updatedAt.toDate();
    }
    return data as Payslip;
};


export async function addOrUpdatePayslipService(payslipData: Payslip): Promise<string> {
  const isUpdate = payslipData.id && (payslipData.id.length > 10);
  
  const { createdAt, updatedAt, ...restOfPayslipData } = payslipData;

  const dataToSave: Partial<PayslipDataForFirestore> & { status: 'draft' | 'approved' } = {
    ...(restOfPayslipData as Omit<Payslip, 'createdAt' | 'updatedAt'>),
    payDate: Timestamp.fromDate(new Date(payslipData.payDate)),
    updatedAt: serverTimestamp(),
  };

  const payslipId = isUpdate ? payslipData.id : doc(collection(db, PAYSLIPS_COLLECTION)).id;
  delete (dataToSave as any).id;

  const docRef = doc(db, PAYSLIPS_COLLECTION, payslipId);
  
  try {
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      // Document exists, perform an update.
      await updateDoc(docRef, dataToSave);
    } else {
      // Document does not exist, create it with setDoc.
      dataToSave.createdAt = serverTimestamp();
      await setDoc(docRef, dataToSave);
    }
  } catch (error) {
    console.error(`Error in addOrUpdatePayslipService for payslipId ${payslipId}:`, error);
    throw error;
  }
  
  return payslipId;
}

export async function getPayslipsByStatusService(status: 'draft' | 'approved'): Promise<Payslip[]> {
  const q = query(
    collection(db, PAYSLIPS_COLLECTION),
    where("status", "==", status),
    orderBy("createdAt", "desc")
  );

  const querySnapshot = await getDocs(q);
  const payslips = querySnapshot.docs.map(doc => convertPayslipTimestampsToDates({ id: doc.id, ...doc.data() }));
  return payslips;
}


export async function getPayslipsService(filters?: {
  employeeId?: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<Payslip[]> {
  const baseConstraints: QueryConstraint[] = [
    where("status", "==", "approved") // Only fetch approved payslips for history reports
  ];

  if (filters?.employeeId) {
    baseConstraints.push(where("employeeId", "==", filters.employeeId));
  }
  if (filters?.startDate) {
    baseConstraints.push(where("payDate", ">=", Timestamp.fromDate(filters.startDate)));
  }
  if (filters?.endDate) {
    baseConstraints.push(where("payDate", "<=", Timestamp.fromDate(filters.endDate)));
  }

  const q = query(
    collection(db, PAYSLIPS_COLLECTION),
    ...baseConstraints,
    orderBy("payDate", "desc")
  );

  const querySnapshot = await getDocs(q);
  
  const approvedPayslips = querySnapshot.docs.map(doc => {
      return convertPayslipTimestampsToDates({ id: doc.id, ...doc.data() });
  });

  return approvedPayslips;
}

export async function approvePayslipService(payslipId: string): Promise<void> {
    const docRef = doc(db, PAYSLIPS_COLLECTION, payslipId);
    await updateDoc(docRef, {
        status: 'approved',
        updatedAt: serverTimestamp(),
    });
}


export async function deletePayslipService(payslipId: string): Promise<void> {
  const docRef = doc(db, PAYSLIPS_COLLECTION, payslipId);
  await deleteDoc(docRef);
}
