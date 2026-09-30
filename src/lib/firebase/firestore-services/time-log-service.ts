
// src/lib/firebase/firestore-services/time-log-service.ts
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp,
  getDoc,
  where,
  limit,
  serverTimestamp,
  type FieldValue,
  type QueryConstraint,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { differenceInMilliseconds, startOfDay, endOfDay, isSameDay, format, min, max } from "date-fns";
import { convertTimestampsToDates } from "./utils";

const TIME_LOGS_COLLECTION = "timeLogEvents";

// Type for TimeLogEventData as stored in Firestore (before conversion)
interface TimeLogEventData {
  employeeId: string;
  employeeName: string;
  dateTime: Timestamp; // Stored as Timestamp
  status: "Clock In" | "Clock Out" | "Start Break" | "End Break" | "Start Lunch" | "End Lunch";
  notes?: string;
  sessionWorkDuration?: string; // e.g., "7h 30m"
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
}

// Type for TimeLogEvent after fetching and converting timestamps
export interface TimeLogEvent {
  id: string;
  employeeId: string;
  employeeName: string;
  dateTime: Date; // Converted to Date object
  status: "Clock In" | "Clock Out" | "Start Break" | "End Break" | "Start Lunch" | "End Lunch";
  notes?: string;
  sessionWorkDuration?: string;
  createdAt: Date;
  updatedAt?: Date;
}

// Helper to format duration in milliseconds to a human-readable string
function formatDurationFromMs(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  // Only show seconds if duration is less than a minute OR if it's ongoing and very short
  if (hours === 0 && minutes === 0 && seconds >= 0) {
    parts.push(`${seconds}s`);
  }

  const durationStr = parts.length > 0 ? parts.join(" ") : "0s";
  return durationStr;
}


// Helper to convert Firestore Timestamps to Date objects for TimeLogEvent
const convertTimeLogEvent = (logData: any & { id: string }): TimeLogEvent | null => {
    const convertedData = convertTimestampsToDates(logData, ['dateTime', 'createdAt', 'updatedAt']);
    if (!convertedData || !convertedData.dateTime) {
        console.error(`[TimeLogService] Invalid or missing dateTime for log ID: ${logData?.id}. Skipping record.`, logData);
        return null;
    }
    return {
        ...convertedData,
        employeeName: convertedData.employeeName || "Unknown Employee (Name Missing in Log)",
    } as TimeLogEvent;
};


export async function getTimeLogEventsService(params?: { startDate?: Date, endDate?: Date, employeeId?: string, limit?: number }): Promise<TimeLogEvent[]> {
  try {
    const constraints: QueryConstraint[] = [orderBy("dateTime", "desc")];
    
    if (params?.startDate) {
      constraints.push(where("dateTime", ">=", Timestamp.fromDate(params.startDate)));
    }
    if (params?.endDate) {
      constraints.push(where("dateTime", "<=", Timestamp.fromDate(params.endDate)));
    }
     if (params?.employeeId && params.employeeId !== 'all') {
      constraints.push(where("employeeId", "==", params.employeeId));
    }
    if (params?.limit) {
      constraints.push(limit(params.limit));
    }

    const q = query(collection(db, TIME_LOGS_COLLECTION), ...constraints);
    const querySnapshot = await getDocs(q);
    const timeLogEvents = querySnapshot.docs
      .map(docSnapshot => {
        const logData = {
          id: docSnapshot.id,
          ...docSnapshot.data(),
        };
        return convertTimeLogEvent(logData);
      })
      .filter((log): log is TimeLogEvent => log !== null);

    return timeLogEvents;
  } catch (error) {
    console.error("[TimeLogService] Error getting time log events from Firestore:", error);
    throw error;
  }
}

const calculateWorkDuration = async (employeeId: string, clockOutTime: Date): Promise<string | undefined> => {
    try {
        const lookbackTime = startOfDay(clockOutTime);

        const q = query(
            collection(db, TIME_LOGS_COLLECTION),
            where("employeeId", "==", employeeId),
            where("dateTime", ">=", Timestamp.fromDate(lookbackTime)),
            where("dateTime", "<=", Timestamp.fromDate(clockOutTime)),
            orderBy("dateTime", "desc")
        );

        const recentEventsSnapshot = await getDocs(q);
        const eventsToday = recentEventsSnapshot.docs
            .map(doc => {
                const data = doc.data() as TimeLogEventData;
                return {
                    ...data,
                    id: doc.id,
                    dateTime: data.dateTime.toDate(),
                };
            })
            .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());

        let sessionStartTime: Date | null = null;
        let lastClockInIndex = -1;

        for (let i = eventsToday.length - 1; i >= 0; i--) {
            if (eventsToday[i].dateTime > clockOutTime) continue; // Skip events after the clock out
            if (eventsToday[i].status === "Clock In") {
                 let isPaired = false;
                 // Check if this clock-in is already paired with a subsequent clock-out (that isn't the target one)
                 for (let j = i + 1; j < eventsToday.length; j++) {
                     if (eventsToday[j].status === "Clock Out" && eventsToday[j].dateTime < clockOutTime) {
                         isPaired = true;
                         break;
                     }
                 }
                 if (!isPaired) {
                     sessionStartTime = eventsToday[i].dateTime;
                     lastClockInIndex = i;
                     break;
                 }
            }
        }


        if (sessionStartTime) {
            const sessionEndTime = clockOutTime;
            let totalBreakMs = 0;
            let totalLunchMs = 0;
            
            const sessionEvents = eventsToday.slice(lastClockInIndex).filter(e => e.dateTime <= sessionEndTime);

            let breakStartTime: Date | null = null;
            let lunchStartTime: Date | null = null;

            for (const event of sessionEvents) {
                if (event.dateTime > sessionEndTime) continue;
                if (event.status === "Start Break") breakStartTime = event.dateTime;
                else if (event.status === "End Break" && breakStartTime) {
                    totalBreakMs += differenceInMilliseconds(event.dateTime, breakStartTime);
                    breakStartTime = null;
                } else if (event.status === "Start Lunch") lunchStartTime = event.dateTime;
                else if (event.status === "End Lunch" && lunchStartTime) {
                    totalLunchMs += differenceInMilliseconds(event.dateTime, lunchStartTime);
                    lunchStartTime = null;
                }
            }
            
            if (breakStartTime) totalBreakMs += differenceInMilliseconds(sessionEndTime, breakStartTime);
            if (lunchStartTime) totalLunchMs += differenceInMilliseconds(sessionEndTime, lunchStartTime);
            
            const sessionGrossDurationMs = differenceInMilliseconds(sessionEndTime, sessionStartTime);
            const netWorkDurationMs = sessionGrossDurationMs - totalBreakMs - totalLunchMs;
            return formatDurationFromMs(Math.max(0, netWorkDurationMs));
        }
        return "N/A (No preceding Clock-In found)";
    } catch (calcError: any) {
        return `Error Calculating Duration: ${calcError.message || 'Unknown reason'}`;
    }
};

export async function addTimeLogEventService(logData: Omit<TimeLogEvent, 'id' | 'createdAt' | 'updatedAt' | 'sessionWorkDuration'>): Promise<TimeLogEvent> {
  if (!logData.employeeName) {
      logData.employeeName = "Unknown Name (Not Provided on Creation)";
  }

  const dataToSave: Omit<TimeLogEventData, 'createdAt' | 'updatedAt'> & { createdAt: FieldValue, updatedAt: FieldValue } = {
      employeeId: logData.employeeId,
      employeeName: logData.employeeName,
      dateTime: Timestamp.fromDate(logData.dateTime),
      status: logData.status,
      notes: logData.notes || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
  };

  if (logData.status === "Clock Out") {
      dataToSave.sessionWorkDuration = await calculateWorkDuration(logData.employeeId, logData.dateTime);
  }
  
  try {
      const newLogRef = await addDoc(collection(db, TIME_LOGS_COLLECTION), dataToSave);
      
      // If a Clock In was added, check if it can "close" an existing Clock Out
      if (logData.status === "Clock In") {
          const dayStart = startOfDay(logData.dateTime);
          const dayEnd = endOfDay(logData.dateTime);
          
          const q = query(
              collection(db, TIME_LOGS_COLLECTION),
              where("employeeId", "==", logData.employeeId),
              where("status", "==", "Clock Out"),
              where("dateTime", ">=", Timestamp.fromDate(dayStart)),
              where("dateTime", "<=", Timestamp.fromDate(dayEnd)),
              orderBy("dateTime", "asc")
          );

          const subsequentClockOutsSnapshot = await getDocs(q);
          
          for (const doc of subsequentClockOutsSnapshot.docs) {
              const clockOutTime = (doc.data().dateTime as Timestamp).toDate();
              if (clockOutTime > logData.dateTime) {
                  // This is a subsequent clock out. Recalculate its duration.
                  const newDuration = await calculateWorkDuration(logData.employeeId, clockOutTime);
                  await updateDoc(doc.ref, { sessionWorkDuration: newDuration, updatedAt: serverTimestamp() });
                  // We assume there's only one relevant clock-out to update per new clock-in for simplicity.
                  // If multiple clock-outs exist after this clock-in, the first one found will be updated.
                  break; 
              }
          }
      }

      const newLogSnap = await getDoc(newLogRef);
      if (!newLogSnap.exists()) {
           throw new Error("Failed to retrieve newly added time log document.");
      }
      const addedLogData = { id: newLogSnap.id, ...newLogSnap.data() as TimeLogEventData };
      const convertedLog = convertTimeLogEvent(addedLogData);
      if (!convertedLog) throw new Error("Failed to convert newly added document.");
      return convertedLog;
  } catch (error) {
      console.error("[TimeLogService] Error adding time log event to Firestore:", error);
      throw error;
  }
}

export async function updateTimeLogEventService(logId: string, logDataFromPage: Partial<Omit<TimeLogEvent, 'id' | 'createdAt' | 'updatedAt'>>): Promise<TimeLogEvent> {
    try {
        const logRef = doc(db, TIME_LOGS_COLLECTION, logId);
        const updatePayloadFirestore: { [key: string]: any } = { updatedAt: serverTimestamp() };

        let needsRecalculation = false;
        let employeeId = logDataFromPage.employeeId;
        
        if (!employeeId) {
            const currentDoc = await getDoc(logRef);
            if (currentDoc.exists()) {
                employeeId = currentDoc.data().employeeId;
            } else {
                throw new Error("Cannot update: Original log not found.");
            }
        }

        if (logDataFromPage.status && ["End Break", "End Lunch", "Clock Out"].includes(logDataFromPage.status)) {
            needsRecalculation = true;
        }

        for (const key in logDataFromPage) {
            if (Object.prototype.hasOwnProperty.call(logDataFromPage, key)) {
                if (key === 'sessionWorkDuration' && logDataFromPage.sessionWorkDuration === undefined) {
                    continue; 
                }
                if (['id', 'createdAt', 'updatedAt'].includes(key)) continue;
                const value = (logDataFromPage as any)[key];
                updatePayloadFirestore[key] = (key === 'dateTime' && value) ? Timestamp.fromDate(new Date(value)) : value;
            }
        }

        await updateDoc(logRef, updatePayloadFirestore);

        if (needsRecalculation && employeeId && logDataFromPage.dateTime) {
            const eventDateTime = new Date(logDataFromPage.dateTime);
            const dayStart = startOfDay(eventDateTime);
            const dayEnd = endOfDay(eventDateTime);

            const allDayLogsQuery = query(
                collection(db, TIME_LOGS_COLLECTION),
                where("employeeId", "==", employeeId),
                where("dateTime", ">=", Timestamp.fromDate(dayStart)),
                where("dateTime", "<=", Timestamp.fromDate(dayEnd)),
                orderBy("dateTime", "asc")
            );

            const dayLogsSnapshot = await getDocs(allDayLogsQuery);
            const dayLogs = dayLogsSnapshot.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    ...data,
                    dateTime: (data.dateTime as Timestamp).toDate(),
                } as TimeLogEvent;
            });

            let clockOutToRecalculate: {id: string, dateTime: Date} | null = null;
            let clockInForSession: Date | null = null;

            for (let i = dayLogs.length - 1; i >= 0; i--) {
                const log = dayLogs[i];
                if (log.dateTime <= eventDateTime && log.status === 'Clock In') {
                    let isClosed = false;
                    for (let j = i + 1; j < dayLogs.length; j++) {
                        if (dayLogs[j].status === 'Clock Out') {
                            isClosed = true;
                            break;
                        }
                    }
                    if(!isClosed || dayLogs.find(l => l.id === logId)) {
                        clockInForSession = log.dateTime;
                        break;
                    }
                }
            }

            if (clockInForSession) {
                for (const log of dayLogs) {
                    if (log.dateTime > clockInForSession && log.status === 'Clock Out') {
                        clockOutToRecalculate = { id: log.id, dateTime: log.dateTime };
                        break;
                    }
                }
            }


            if (clockOutToRecalculate) {
                const newDuration = await calculateWorkDuration(employeeId, clockOutToRecalculate.dateTime);
                await updateDoc(doc(db, TIME_LOGS_COLLECTION, clockOutToRecalculate.id), { sessionWorkDuration: newDuration, updatedAt: serverTimestamp() });
            }
        }


        const updatedLogSnap = await getDoc(logRef);
        if (!updatedLogSnap.exists()) throw new Error(`Failed to retrieve updated time log document with ID: ${logId}`);
        const updatedLogData = { id: updatedLogSnap.id, ...updatedLogSnap.data() as TimeLogEventData };
        const convertedLog = convertTimeLogEvent(updatedLogData);

        if (!convertedLog) throw new Error("Failed to convert updated document.");
        return convertedLog;

    } catch (error) {
        console.error(`[TimeLogService] update: Error updating time log event ${logId} to Firestore:`, error);
        throw error;
    }
}

export async function deleteTimeLogEventService(logId: string): Promise<void> {
    try {
        const logRef = doc(db, TIME_LOGS_COLLECTION, logId);
        await deleteDoc(logRef);
    } catch (error) {
        console.error(`[TimeLogService] Error deleting time log event ${logId} from Firestore:`, error);
        throw error;
    }
}

const calculateDurationForImport = (
    clockOutTime: Date,
    allLogsForDay: Array<{ dateTime: Date; status: TimeLogEvent['status'] }>
): string => {
    let sessionStartTime: Date | null = null;
    let applicableClockInEvent: { dateTime: Date; status: TimeLogEvent['status'] } | undefined;

    // Find the latest Clock In before this Clock Out that isn't already paired with another Clock Out.
    const potentialClockIns = allLogsForDay
        .filter(log => log.status === 'Clock In' && log.dateTime < clockOutTime)
        .sort((a, b) => b.dateTime.getTime() - a.dateTime.getTime());

    for (const clockIn of potentialClockIns) {
        // Find the next Clock Out after this Clock In
        const nextClockOut = allLogsForDay.find(log => log.status === 'Clock Out' && log.dateTime > clockIn.dateTime);
        // If the next Clock Out is our current clockOutTime, we've found our pair.
        if (nextClockOut && nextClockOut.dateTime.getTime() === clockOutTime.getTime()) {
            applicableClockInEvent = clockIn;
            break;
        }
        // If there's no next Clock Out, this Clock In is unclosed, so it can't be ours if our clockOutTime is not the first.
        // This logic is complex. A simpler way is to find the latest clock-in before the clock-out,
        // as long as it's not "taken" by another clock-out that is also before our target clock-out.
    }
    
    if (!applicableClockInEvent) {
         // Fallback: take the latest clockin before this clockout. This is the logic that was failing.
         // Let's refine: find latest clockin before this clockout.
         applicableClockInEvent = potentialClockIns[0];
    }
    
    if (!applicableClockInEvent) {
        return "N/A (No preceding Clock-In found)";
    }

    sessionStartTime = applicableClockInEvent.dateTime;
    
    const sessionEvents = allLogsForDay.filter(log => 
        log.dateTime >= sessionStartTime! && log.dateTime <= clockOutTime
    );
    
    let totalBreakMs = 0;
    let totalLunchMs = 0;
    let breakStartTime: Date | null = null;
    let lunchStartTime: Date | null = null;

    for (const event of sessionEvents) {
        if (event.status === "Start Break") breakStartTime = event.dateTime;
        else if (event.status === "End Break" && breakStartTime) {
            totalBreakMs += differenceInMilliseconds(event.dateTime, breakStartTime);
            breakStartTime = null;
        } else if (event.status === "Start Lunch") lunchStartTime = event.dateTime;
        else if (event.status === "End Lunch" && lunchStartTime) {
            totalLunchMs += differenceInMilliseconds(event.dateTime, lunchStartTime);
            lunchStartTime = null;
        }
    }
    
    if (breakStartTime) totalBreakMs += differenceInMilliseconds(clockOutTime, breakStartTime);
    if (lunchStartTime) totalLunchMs += differenceInMilliseconds(clockOutTime, lunchStartTime);

    const sessionGrossDurationMs = differenceInMilliseconds(clockOutTime, sessionStartTime);
    const netWorkDurationMs = sessionGrossDurationMs - totalBreakMs - totalLunchMs;
    return formatDurationFromMs(Math.max(0, netWorkDurationMs));
};


export async function batchAddTimeLogEventsService(
  logs: Array<{ employeeId: string; dateTime: string; status: TimeLogEvent['status']; notes?: string; employeeName: string; }>
): Promise<void> {
    const timeLogCollection = collection(db, TIME_LOGS_COLLECTION);
    
    if (logs.length === 0) return;

    const batch = writeBatch(db);

    const employeeIdsInImport = [...new Set(logs.map(l => l.employeeId))];
    const dateTimesInImport = logs.map(l => new Date(l.dateTime)).filter(d => !isNaN(d.getTime()));

    if (dateTimesInImport.length === 0) {
        console.log("No valid dates found in import file. Aborting.");
        return;
    }

    const minDate = min(dateTimesInImport);
    const maxDate = max(dateTimesInImport);

    const existingLogsQuery = query(
        timeLogCollection,
        where('employeeId', 'in', employeeIdsInImport),
        where('dateTime', '>=', startOfDay(minDate)),
        where('dateTime', '<=', endOfDay(maxDate))
    );
    const existingLogsSnapshot = await getDocs(existingLogsQuery);
    
    const existingLogHashes = new Set<string>();
    existingLogsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const dateTime = (data.dateTime as Timestamp).toDate();
        const hash = `${data.employeeId}_${dateTime.toISOString()}`;
        existingLogHashes.add(hash);
    });

    const logsToProcess: Array<{ employeeId: string; dateTime: Date; status: TimeLogEvent['status']; notes?: string; employeeName: string; }> = [];

    logs.forEach(logData => {
        const dateTime = new Date(logData.dateTime);
        if (isNaN(dateTime.getTime())) {
            console.warn(`Skipping row with invalid date:`, logData);
            return;
        }
        const hash = `${logData.employeeId}_${dateTime.toISOString()}`;
        if (!existingLogHashes.has(hash)) {
            logsToProcess.push({ ...logData, dateTime });
            existingLogHashes.add(hash); // Add to prevent duplicates within the same file
        }
    });

    // Group all logs (existing + new) by employee and day
    const allLogsByEmployeeDay = new Map<string, Array<{ dateTime: Date; status: TimeLogEvent['status']; }>>();
    
    // Add existing logs to the map
    existingLogsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const dateTime = (data.dateTime as Timestamp).toDate();
        const dayKey = `${data.employeeId}_${format(dateTime, 'yyyy-MM-dd')}`;
        if (!allLogsByEmployeeDay.has(dayKey)) allLogsByEmployeeDay.set(dayKey, []);
        allLogsByEmployeeDay.get(dayKey)!.push({ dateTime, status: data.status });
    });

    // Add new logs to the map
    logsToProcess.forEach(log => {
        const dayKey = `${log.employeeId}_${format(log.dateTime, 'yyyy-MM-dd')}`;
        if (!allLogsByEmployeeDay.has(dayKey)) allLogsByEmployeeDay.set(dayKey, []);
        allLogsByEmployeeDay.get(dayKey)!.push({ dateTime: log.dateTime, status: log.status });
    });
    
    // Sort all logs within each day
    allLogsByEmployeeDay.forEach(dayLogs => dayLogs.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime()));


    logsToProcess.forEach(logData => {
        const dataToSave: Omit<TimeLogEventData, "sessionWorkDuration"> = {
            employeeId: logData.employeeId,
            employeeName: logData.employeeName,
            dateTime: Timestamp.fromDate(logData.dateTime),
            status: logData.status,
            notes: logData.notes || "",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };

        if (logData.status === "Clock Out") {
            const dayKey = `${logData.employeeId}_${format(logData.dateTime, 'yyyy-MM-dd')}`;
            const allLogsForThisDay = allLogsByEmployeeDay.get(dayKey) || [];
            (dataToSave as TimeLogEventData).sessionWorkDuration = calculateDurationForImport(logData.dateTime, allLogsForThisDay);
        }
        
        const docRef = doc(timeLogCollection);
        batch.set(docRef, dataToSave);
    });
    
    try {
        await batch.commit();
    } catch (error) {
        console.error("Error committing batch time log events:", error);
        throw error;
    }
}
