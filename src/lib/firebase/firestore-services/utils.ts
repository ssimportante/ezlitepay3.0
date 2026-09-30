// src/lib/firebase/firestore-services/utils.ts
import { Timestamp } from "firebase/firestore";

/**
 * Logs a message to the console with a timestamp and an optional title.
 * This is a simple logger that can be used for debugging purposes.
 * @param title The title of the log message.
 * @param message The message to log.
 */
export const log = (title: string, message?: any) => {
  const timestamp = new Date().toISOString();
  if (message) {
    console.log(`[${timestamp}] ${title}:`, message);
  } else {
    console.log(`[${timestamp}] ${title}`);
  }
};


/**
 * Converts Firestore Timestamps to JavaScript Date objects within a given object.
 * @param data The object to process.
 * @param dateFields An array of keys that should be converted if they are Timestamps.
 * @returns A new object with Timestamps converted to Dates.
 */
export function convertTimestampsToDates<T extends object>(
  data: T,
  dateFields: (keyof T)[]
): T {
  if (!data) return data;

  const convertedData: T = { ...data };

  for (const field of dateFields) {
    const value = convertedData[field];
    if (value instanceof Timestamp) {
      (convertedData[field] as any) = value.toDate();
    }
  }
  return convertedData;
}
