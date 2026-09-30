
// src/lib/firebase/firestore-services/company-service.ts
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config"; // Client-side db

const COMPANY_SETTINGS_COLLECTION = "companySettings";
const COMPANY_SETTINGS_DOC_ID = "main"; 

export interface CompanySettings {
  id?: string; 
  businessName?: string;
  businessAddress?: string;
  payrollEmail?: string;
  companyLogoUrl?: string | null; 
  defaultCurrency?: string;
  emailNotifs?: boolean;
  darkMode?: boolean; 
  lastLeaveResetYear?: number;
  updatedAt?: any; 
  createdAt?: any; 
}

export async function getCompanySettings(): Promise<CompanySettings | null> {
  const docRef = doc(db, COMPANY_SETTINGS_COLLECTION, COMPANY_SETTINGS_DOC_ID);
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const settings = { id: docSnap.id, ...docSnap.data() } as CompanySettings;
      return settings;
    } else {
      console.warn("[CompanyService] Company settings document not found.");
      return null;
    }
  } catch (error) {
    console.error("[CompanyService] Error getting company settings from Firestore:", error);
    // In a client-side context, it's often better to return null or an empty object
    // than to throw an error that might crash the component tree.
    // The component using this service should handle the null case.
    return null; 
  }
}

export async function updateCompanySettings(settings: Partial<CompanySettings>): Promise<void> {
  const docRef = doc(db, COMPANY_SETTINGS_COLLECTION, COMPANY_SETTINGS_DOC_ID);
  
  const dataToUpdate: { [key: string]: any } = {};
  for (const key in settings) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
      const value = (settings as any)[key];
      if (value !== undefined) { 
        dataToUpdate[key] = value;
      }
    }
  }
  
  if (Object.keys(dataToUpdate).length > 0) {
    dataToUpdate.updatedAt = serverTimestamp();
  } else {
    // No actual data to update, so we can return early.
    return;
  }
  
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      await updateDoc(docRef, dataToUpdate);
    } else {
      // If the document doesn't exist, create it.
      dataToUpdate.createdAt = serverTimestamp(); // Add createdAt on initial creation
      await setDoc(docRef, dataToUpdate);
    }
  } catch (error) {
    console.error("[CompanyService] Error in updateCompanySettings (service):", error);
    throw error; // Re-throw to be handled by the calling component
  }
}


export async function initializeCompanySettingsIfNeeded(defaultSettings: CompanySettings): Promise<void> {
  // This function is intended for setup scripts or a one-time server-side check.
  // Running it frequently on the client might lead to unnecessary reads.
  try {
    const currentSettings = await getCompanySettings();
    if (!currentSettings) {
        // The doc doesn't exist, so let's create it.
        const initialData = { ...defaultSettings };
        delete initialData.id; // Don't save the 'id' field inside the document
        // `updateCompanySettings` handles creation if the doc doesn't exist.
        await updateCompanySettings({ ...initialData, createdAt: serverTimestamp() }); 
        console.log("[CompanyService] Initialized company settings with defaults.");
    }
  } catch (error) {
      // It's often better to log this error than to let it crash the app on startup.
      console.error("[CompanyService] Error during initializeCompanySettingsIfNeeded:", error);
  }
}
