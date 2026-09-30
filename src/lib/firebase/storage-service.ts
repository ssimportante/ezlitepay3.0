// src/lib/firebase/storage-service.ts
import { ref, uploadString, getDownloadURL, deleteObject, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/firebase/config";

/**
 * Uploads a file (Blob or File object) to Firebase Storage.
 * @param file The file to upload.
 * @param path The path in Firebase Storage where the file should be stored (e.g., "profilePictures/userId.jpg").
 * @returns A promise that resolves with the download URL of the uploaded file.
 */
export async function uploadFileToStorage(file: File | Blob, path: string): Promise<string> {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(storageRef);
  return downloadURL;
}

/**
 * Uploads a base64 data URL (e.g., from a canvas or file reader) to Firebase Storage.
 * @param dataUrl The base64 data URL string.
 * @param path The path in Firebase Storage where the file should be stored.
 * @returns A promise that resolves with the download URL of the uploaded file.
 */
export async function uploadDataUrlToStorage(dataUrl: string, path: string): Promise<string> {
  const storageRef = ref(storage, path);
  const snapshot = await uploadString(storageRef, dataUrl, 'data_url');
  const downloadURL = await getDownloadURL(snapshot.ref);
  return downloadURL;
}

/**
 * Deletes a file from Firebase Storage.
 * @param path The path of the file in Firebase Storage to delete.
 * @returns A promise that resolves when the file is deleted.
 */
export async function deleteFileFromStorage(path: string): Promise<void> {
  const storageRef = ref(storage, path);
  try {
    await deleteObject(storageRef);
  } catch (error: any) {
    if (error.code === 'storage/object-not-found') {
      console.warn(`[StorageService] File not found at path: ${path}. Nothing to delete.`);
    } else {
      throw error;
    }
  }
}

export const isFirebaseStorageUrl = (url: string | null | undefined): boolean => {
    if (!url) return false;
    return url.includes("firebasestorage.googleapis.com/v0/b/") || url.includes("storage.googleapis.com/");
};

export const getFirebaseStoragePathFromUrl = (url: string): string | null => {
    if (!isFirebaseStorageUrl(url)) {
        return null;
    }
    try {
        const urlObject = new URL(url);
        const pathSegments = urlObject.pathname.split('/o/');
        if (pathSegments.length > 1) {
            const encodedPath = pathSegments.slice(1).join('/o/');
            const gcsPath = decodeURIComponent(encodedPath);
            return gcsPath;
        }
        return null;
    } catch (e) {
        return null;
    }
};
