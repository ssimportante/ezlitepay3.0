// src/lib/firebase/config.ts
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

// Explicitly read from process.env
const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const firebaseAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const firebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const firebaseStorageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const firebaseMessagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const firebaseAppId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
const firebaseMeasurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

const criticalErrorMessage = `
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
CRITICAL FIREBASE CONFIGURATION ERROR:
One or more Firebase environment variables (NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_PROJECT_ID) 
are missing or empty. These values are automatically provided by the App Hosting environment.
If you are running locally, please ensure your .env.local file is set up correctly.

The application attempted to load the following:
- NEXT_PUBLIC_FIREBASE_API_KEY: ${firebaseApiKey === undefined ? 'undefined' : (firebaseApiKey === "" ? "EMPTY STRING" : `"${firebaseApiKey.substring(0,5)}..."`)}
- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: ${firebaseAuthDomain === undefined ? 'undefined' : (firebaseAuthDomain === "" ? "EMPTY STRING" : `"${firebaseAuthDomain}"`)}
- NEXT_PUBLIC_FIREBASE_PROJECT_ID: ${firebaseProjectId === undefined ? 'undefined' : (firebaseProjectId === "" ? "EMPTY STRING" : `"${firebaseProjectId}"`)}

The application cannot proceed without this configuration.
If you see 'auth/invalid-api-key' or other Firebase errors, it likely means the backend configuration is not yet complete.
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`;

if (!firebaseApiKey || !firebaseAuthDomain || !firebaseProjectId) {
  console.error(criticalErrorMessage);
  throw new Error("Firebase configuration is missing or invalid. Check server console logs for details.");
}

console.log("[FirebaseConfig] Initializing Firebase with the following configuration:");
console.log("[FirebaseConfig] API Key (Loaded):", firebaseApiKey ? `***...${firebaseApiKey.slice(-4)}` : "MISSING/EMPTY");
console.log("[FirebaseConfig] Auth Domain:", firebaseAuthDomain || "MISSING/EMPTY");
console.log("[FirebaseConfig] Project ID:", firebaseProjectId || "MISSING/EMPTY");
console.log("[FirebaseConfig] Storage Bucket:", firebaseStorageBucket || "MISSING/EMPTY (Required for file uploads)");
console.log("[FirebaseConfig] Messaging Sender ID:", firebaseMessagingSenderId || "MISSING/EMPTY (Optional)");
console.log("[FirebaseConfig] App ID:", firebaseAppId || "MISSING/EMPTY (Optional, but recommended)");
console.log("[FirebaseConfig] Measurement ID:", firebaseMeasurementId || "NOT SET or EMPTY (Optional, for Analytics)");

const firebaseConfig = {
  apiKey: firebaseApiKey,
  authDomain: firebaseAuthDomain,
  projectId: firebaseProjectId,
  storageBucket: firebaseStorageBucket,
  messagingSenderId: firebaseMessagingSenderId,
  appId: firebaseAppId,
  measurementId: firebaseMeasurementId,
};

let app: FirebaseApp;
let auth: Auth;
let dbInstance: Firestore;
let storageInstance: FirebaseStorage;


// Conditional initialization for client vs. server
if (typeof window !== "undefined") {
    // Client-side execution
    console.log("[FirebaseConfig] Running on client. Checking if Firebase app needs initialization...");
    if (!getApps().length) {
      try {
        console.log("[FirebaseConfig] No existing Firebase app found. Initializing new app...");
        app = initializeApp(firebaseConfig);
        console.log("[FirebaseConfig] Firebase app initialized successfully. Project ID from app:", app.options.projectId);
      } catch (e: any) {
        console.error("[FirebaseConfig] CRITICAL ERROR DURING initializeApp():", e.message, e.code, e);
        console.error(criticalErrorMessage);
        throw new Error(`Firebase app initialization failed: ${e.message}. Check Firebase config and .env variables.`);
      }
    } else {
      app = getApps()[0];
      console.log("[FirebaseConfig] Existing Firebase app found. Using instance for Project ID:", app.options.projectId);
    }
} else {
    // Server-side execution - Firebase Admin SDK will be used for backend services,
    // so we only need a placeholder 'app' for type consistency if some services import this file.
    // The real backend 'app' is the adminApp in admin-config.ts.
    console.log("[FirebaseConfig] Running on server. Client SDK initialization skipped.");
    app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
}


try {
  console.log("[FirebaseConfig] Attempting to get Auth instance...");
  auth = getAuth(app);
  console.log("[FirebaseConfig] Firebase Auth instance obtained successfully.");
} catch (e: any) {
  console.error("[FirebaseConfig] CRITICAL ERROR DURING getAuth():", e.message, e.code, e);
  throw new Error(`Failed to get Firebase Auth instance: ${e.message}.`);
}

// Only configure Firestore persistence on the client-side
if (typeof window !== "undefined") {
  try {
      console.log("[FirebaseConfig] Attempting to get Firestore instance with modern persistence...");
      dbInstance = initializeFirestore(app, {
        localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
      });
      console.log("[FirebaseConfig] Firebase Firestore instance obtained successfully with persistence configured.");
    } catch (err: any) {
      if (err.code === 'failed-precondition') {
        console.warn(
          '[FirebaseConfig] Firestore persistence failed-precondition: Multiple tabs open or other persistence issue. Falling back to in-memory persistence for this tab.'
        );
        dbInstance = getFirestore(app);
      } else if (err.code === 'unimplemented') {
        console.warn(
          '[FirebaseConfig] The current browser does not support all of the features required to enable persistence. Falling back to in-memory persistence.'
        );
        dbInstance = getFirestore(app);
      } else {
        console.error("[FirebaseConfig] CRITICAL ERROR DURING getFirestore():", err.message, err.code, err);
        throw new Error(`Failed to get Firebase Firestore instance: ${err.message}. Ensure Firebase app initialized correctly and Firestore is enabled in your project.`);
      }
  }
} else {
    // For server-side, we get a non-persistent instance. The adminDb from admin-config.ts should be preferred.
    dbInstance = getFirestore(app);
}

try {
  console.log("[FirebaseConfig] Attempting to get Storage instance...");
  storageInstance = getStorage(app);
  console.log("[FirebaseConfig] Firebase Storage instance obtained successfully.");
} catch (e: any) {
  console.error("[FirebaseConfig] CRITICAL ERROR DURING getStorage():", e.message, e.code, e);
  throw new Error(`Failed to get Firebase Storage instance: ${e.message}. Ensure Firebase app initialized correctly, Storage is enabled, and NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is set.`);
}

export { app, auth, dbInstance as db, storageInstance as storage };
