// src/lib/firebase/firestore-services/schedule-service.ts
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
  where,
  orderBy,
  limit,
  QueryConstraint,
} from "firebase/firestore";
import { startOfMonth, endOfMonth, isValid, startOfDay, endOfDay, isWithinInterval } from "date-fns";
import { db } from "@/lib/firebase/config";
import type { Schedule } from "@/types/schedule";
import { getEmployeeById } from "./employee-service";
import { convertTimestampsToDates } from "./utils";

const SCHEDULES_COLLECTION = "schedules";

interface ScheduleDocument {
  employeeId: string;
  date: Timestamp;
  timeIn: string; // HH:mm
  timeOut: string; // HH:mm
  lunchStart: string; // HH:mm
  lunchEnd: string; // HH:mm
  notes: string;
  createdAt?: FieldValue;
  updatedAt?: FieldValue;
}

// Helper to check for time string overlap. e.g., "09:00" vs "17:00"
const timesOverlap = (startA: string, endA: string, startB: string, endB: string): boolean => {
    // Convert HH:mm to minutes from midnight for easier comparison
    const toMinutes = (time: string) => {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
    };
    const startAMin = toMinutes(startA);
    const endAMin = toMinutes(endA);
    const startBMin = toMinutes(startB);
    const endBMin = toMinutes(endB);
    // Overlap exists if one range starts before the other ends, and ends after the other starts.
    return startAMin < endBMin && endAMin > startBMin;
};

function convertScheduleDocumentToSchedule(
  id: string,
  docData: Omit<ScheduleDocument, 'date'> & { date: Date },
  employeeName?: string
): Schedule {
  return {
    id,
    employeeId: docData.employeeId,
    employeeName: employeeName || `[ID: ${docData.employeeId}]`, // Fallback
    date: docData.date,
    timeIn: docData.timeIn,
    timeOut: docData.timeOut,
    lunchStart: docData.lunchStart,
    lunchEnd: docData.lunchEnd,
    notes: docData.notes,
  };
}

export async function addScheduleService(
  scheduleData: Omit<Schedule, "id" | "employeeName">
): Promise<string> {

  // --- Overlap Validation ---
  const scheduleDate = startOfDay(scheduleData.date);
  const q = query(
      collection(db, SCHEDULES_COLLECTION),
      where("employeeId", "==", scheduleData.employeeId),
      where("date", "==", Timestamp.fromDate(scheduleDate))
  );
  const existingSchedulesSnap = await getDocs(q);
  for (const doc of existingSchedulesSnap.docs) {
      const existingSchedule = doc.data() as ScheduleDocument;
      if (timesOverlap(scheduleData.timeIn, scheduleData.timeOut, existingSchedule.timeIn, existingSchedule.timeOut)) {
          throw new Error(`An overlapping schedule already exists for this employee on this day from ${existingSchedule.timeIn} to ${existingSchedule.timeOut}.`);
      }
  }
  // --- End Validation ---

  const dataForSave: Omit<ScheduleDocument, "createdAt" | "updatedAt"> = {
    employeeId: scheduleData.employeeId,
    date: Timestamp.fromDate(scheduleDate), // Use the start-of-day date
    timeIn: scheduleData.timeIn,
    timeOut: scheduleData.timeOut,
    lunchStart: scheduleData.lunchStart,
    lunchEnd: scheduleData.lunchEnd,
    notes: scheduleData.notes,
  };

  const docRef = await addDoc(collection(db, SCHEDULES_COLLECTION), {
    ...dataForSave,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getSchedulesService(params: {
  month?: Date;
  startDate?: Date;
  endDate?: Date;
  employeeId?: string;
} = {}): Promise<Schedule[]> {
  const { month, employeeId, startDate, endDate } = params;

  let baseQuery = query(collection(db, SCHEDULES_COLLECTION), orderBy("date", "asc"));

  // If filtering by a specific employee, add that to the base query. This is indexed.
  if (employeeId && employeeId !== "all") {
    baseQuery = query(baseQuery, where("employeeId", "==", employeeId));
  }

  // If only a date range is provided, Firestore can handle this with a single-field index on `date`.
  if (startDate && endDate && isValid(startDate) && isValid(endDate) && !employeeId) {
    baseQuery = query(baseQuery,
      where("date", ">=", Timestamp.fromDate(startOfDay(startDate))),
      where("date", "<=", Timestamp.fromDate(endOfDay(endDate)))
    );
  } else if (month && isValid(month) && !employeeId) {
     baseQuery = query(baseQuery,
      where("date", ">=", Timestamp.fromDate(startOfMonth(month))),
      where("date", "<=", Timestamp.fromDate(endOfMonth(month)))
    );
  }
  
  const querySnapshot = await getDocs(baseQuery);
  const schedules = querySnapshot.docs.map(docSnapshot => {
    const data = docSnapshot.data();
    const dataWithDate = {
        ...data,
        date: (data.date as Timestamp).toDate()
    };
    return convertScheduleDocumentToSchedule(docSnapshot.id, dataWithDate as any);
  });

  // If we queried by employeeId and also have a date range, filter the results in-memory.
  // This avoids the composite index requirement.
  if (employeeId && startDate && endDate && isValid(startDate) && isValid(endDate)) {
    const interval = { start: startOfDay(startDate), end: endOfDay(endDate) };
    return schedules.filter(sch => isWithinInterval(sch.date, interval));
  }
  if (employeeId && month && isValid(month)) {
    const interval = { start: startOfMonth(month), end: endOfMonth(month) };
    return schedules.filter(sch => isWithinInterval(sch.date, interval));
  }

  return schedules;
}


export async function updateScheduleService(
  scheduleId: string,
  scheduleData: Partial<Omit<Schedule, "id" | "employeeName">>
): Promise<void> {

  // --- Overlap Validation for Update ---
  if (scheduleData.employeeId && scheduleData.date && scheduleData.timeIn && scheduleData.timeOut) {
    const scheduleDate = startOfDay(scheduleData.date);
    const q = query(
        collection(db, SCHEDULES_COLLECTION),
        where("employeeId", "==", scheduleData.employeeId),
        where("date", "==", Timestamp.fromDate(scheduleDate))
    );
    const existingSchedulesSnap = await getDocs(q);
    for (const doc of existingSchedulesSnap.docs) {
      if (doc.id === scheduleId) continue; // Don't compare the schedule to itself
      const existingSchedule = doc.data() as ScheduleDocument;
      if (timesOverlap(scheduleData.timeIn, scheduleData.timeOut, existingSchedule.timeIn, existingSchedule.timeOut)) {
          throw new Error(`An overlapping schedule already exists for this employee on this day from ${existingSchedule.timeIn} to ${existingSchedule.timeOut}.`);
      }
    }
  }
  // --- End Validation ---

  const docRef = doc(db, SCHEDULES_COLLECTION, scheduleId);
  const dataToUpdate: { [key: string]: any } = { updatedAt: serverTimestamp() };

  if (scheduleData.employeeId) dataToUpdate.employeeId = scheduleData.employeeId;
  if (scheduleData.date) dataToUpdate.date = Timestamp.fromDate(startOfDay(scheduleData.date)); // Use start of day
  if (scheduleData.timeIn) dataToUpdate.timeIn = scheduleData.timeIn;
  if (scheduleData.timeOut) dataToUpdate.timeOut = scheduleData.timeOut;
  if (scheduleData.lunchStart) dataToUpdate.lunchStart = scheduleData.lunchStart;
  if (scheduleData.lunchEnd) dataToUpdate.lunchEnd = scheduleData.lunchEnd;
  if (scheduleData.notes !== undefined) dataToUpdate.notes = scheduleData.notes;

  await updateDoc(docRef, dataToUpdate);
}

export async function deleteScheduleService(scheduleId: string): Promise<void> {
  const docRef = doc(db, SCHEDULES_COLLECTION, scheduleId);
  await deleteDoc(docRef);
}

export async function batchProcessSchedules(
  schedulesToProcess: Omit<Schedule, "id" | "employeeName">[],
  employeeIdsForOverwrite: string[],
  periodStartDate: Date,
  periodEndDate: Date,
  overwrite: boolean
): Promise<void> {
  const batch = writeBatch(db);
  const startTimestamp = Timestamp.fromDate(periodStartDate);
  const endTimestamp = Timestamp.fromDate(periodEndDate);

  const existingSchedulesQuery = query(
    collection(db, SCHEDULES_COLLECTION),
    where("date", ">=", startTimestamp),
    where("date", "<=", endTimestamp)
  );
  const existingSchedulesSnapshot = await getDocs(existingSchedulesQuery);
  const existingSchedules = existingSchedulesSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as ScheduleDocument) }));


  if (overwrite && employeeIdsForOverwrite.length > 0) {
    existingSchedules.forEach(existingSched => {
        if(employeeIdsForOverwrite.includes(existingSched.employeeId)){
            const docRef = doc(db, SCHEDULES_COLLECTION, existingSched.id);
            batch.delete(docRef);
        }
    });
  }

  schedulesToProcess.forEach((sch) => {
    // If not overwriting, check for overlaps before adding
    if (!overwrite) {
        const hasOverlap = existingSchedules.some(existing => 
            existing.employeeId === sch.employeeId &&
            existing.date.toDate().toDateString() === sch.date.toDateString() &&
            timesOverlap(sch.timeIn, sch.timeOut, existing.timeIn, existing.timeOut)
        );
        if (hasOverlap) {
            console.log(`Skipping schedule for ${sch.employeeId} on ${sch.date.toDateString()} due to overlap.`);
            return; // Skip this schedule
        }
    }

    const newScheduleRef = doc(collection(db, SCHEDULES_COLLECTION));
    const dataForSave: ScheduleDocument = {
      employeeId: sch.employeeId,
      date: Timestamp.fromDate(startOfDay(sch.date)), // Use start of day
      timeIn: sch.timeIn,
      timeOut: sch.timeOut,
      lunchStart: sch.lunchStart,
      lunchEnd: sch.lunchEnd,
      notes: sch.notes,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    batch.set(newScheduleRef, dataForSave);
  });

  await batch.commit();
}

export async function swapSchedulesService(
  employeeId1: string,
  date1: Date,
  employeeId2: string,
  date2: Date,
  notes: string,
  formUrl: string
): Promise<void> {
    const findScheduleQuery = (empId: string, searchDate: Date) => query(
        collection(db, SCHEDULES_COLLECTION),
        where("employeeId", "==", empId),
        where("date", ">=", Timestamp.fromDate(startOfDay(searchDate))),
        where("date", "<=", Timestamp.fromDate(endOfDay(searchDate))),
        limit(1)
    );

    const sched1Query = findScheduleQuery(employeeId1, date1);
    const sched2Query = findScheduleQuery(employeeId2, date2);
    
    const [sched1Snapshot, sched2Snapshot] = await Promise.all([
        getDocs(sched1Query),
        getDocs(sched2Query)
    ]);

    if (sched1Snapshot.empty) throw new Error(`Schedule for first employee on ${date1.toDateString()} not found.`);
    if (sched2Snapshot.empty) throw new Error(`Schedule for second employee on ${date2.toDateString()} not found.`);

    const sched1DocRef = sched1Snapshot.docs[0].ref;
    const sched2DocRef = sched2Snapshot.docs[0].ref;

    const sched1Data = sched1Snapshot.docs[0].data() as Omit<ScheduleDocument, 'createdAt' | 'updatedAt'>;
    const sched2Data = sched2Snapshot.docs[0].data() as Omit<ScheduleDocument, 'createdAt' | 'updatedAt'>;

    const batch = writeBatch(db);
    const timestamp = serverTimestamp();
    
    const originalSched1Details = { timeIn: sched1Data.timeIn, timeOut: sched1Data.timeOut, lunchStart: sched1Data.lunchStart, lunchEnd: sched1Data.lunchEnd };
    const originalSched2Details = { timeIn: sched2Data.timeIn, timeOut: sched2Data.timeOut, lunchStart: sched2Data.lunchStart, lunchEnd: sched2Data.lunchEnd };

    const noteForSched1 = `Swapped shift with ${employeeId2}. Note: ${notes}${formUrl ? ` Form: ${formUrl}` : ''}`;
    const noteForSched2 = `Swapped shift with ${employeeId1}. Note: ${notes}${formUrl ? ` Form: ${formUrl}` : ''}`;


    batch.update(sched1DocRef, { ...originalSched2Details, notes: noteForSched1, updatedAt: timestamp });
    batch.update(sched2DocRef, { ...originalSched1Details, notes: noteForSched2, updatedAt: timestamp });

    await batch.commit();
}
