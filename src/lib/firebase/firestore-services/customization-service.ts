// src/lib/firebase/firestore-services/customization-service.ts
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

const CUSTOMIZATION_COLLECTION = "customizationSettings";
const DROPDOWN_OPTIONS_DOC_ID = "dropdownOptions";

export interface CustomizationSettings {
  employeeTypes: string[];
  departments: string[];
  positions: string[];
  documentTypes: string[];
  employeeStatuses: string[];
}

const defaultCustomizationSettings: CustomizationSettings = {
    employeeTypes: ["Regular", "Fixed-term", "Part-time", "Probationary", "Trainee"],
    departments: ["Management", "Operations", "Bar", "Kitchen", "Counter"],
    positions: ["Manager", "Supervisor", "Cashier", "Cook", "Server", "Bartender"],
    documentTypes: ["Resume", "Contract", "NDA", "Performance Review", "Incident Report", "Coaching Form", "Other"],
    employeeStatuses: ["Active", "Inactive", "On Leave", "Resigned", "Terminated", "End-of-Contract"],
};


export async function getCustomizationSettings(): Promise<CustomizationSettings> {
  const docRef = doc(db, CUSTOMIZATION_COLLECTION, DROPDOWN_OPTIONS_DOC_ID);
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      // Ensure all fields from the interface exist on the returned object
      const data = docSnap.data() as Partial<CustomizationSettings>;
      return {
        employeeTypes: data.employeeTypes || defaultCustomizationSettings.employeeTypes,
        departments: data.departments || defaultCustomizationSettings.departments,
        positions: data.positions || defaultCustomizationSettings.positions,
        documentTypes: data.documentTypes || defaultCustomizationSettings.documentTypes,
        employeeStatuses: data.employeeStatuses || defaultCustomizationSettings.employeeStatuses,
      };
    } else {
      // If the document doesn't exist, create it with all defaults
      await setDoc(docRef, { ...defaultCustomizationSettings, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return defaultCustomizationSettings;
    }
  } catch (error) {
    console.error("[CustomizationService] Error getting customization settings:", error);
    throw error;
  }
}

export async function updateCustomizationSettings(settings: Partial<CustomizationSettings>): Promise<void> {
  const docRef = doc(db, CUSTOMIZATION_COLLECTION, DROPDOWN_OPTIONS_DOC_ID);
  try {
    const dataToUpdate: { [key: string]: any } = { ...settings };
    // Always include the update timestamp
    dataToUpdate.updatedAt = serverTimestamp();

    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        await updateDoc(docRef, dataToUpdate);
    } else {
        // If it doesn't exist, create it with potentially partial settings merged into defaults
        const newSettings = {
            ...defaultCustomizationSettings,
            ...settings,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };
        await setDoc(docRef, newSettings);
    }
  } catch (error) {
    console.error("[CustomizationService] Error updating customization settings:", error);
    throw error;
  }
}
