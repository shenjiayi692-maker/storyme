import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

/**
 * Converts a base64 string to a Blob.
 * @param base64 The base64 string (with or without data:image/png;base64, prefix).
 * @param contentType The MIME type of the content.
 * @returns A Blob representing the image.
 */
function base64ToBlob(base64: string, contentType = 'image/png'): Blob {
  const byteString = atob(base64.split(',')[1] || base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: contentType });
}

/**
 * Uploads a base64 image to Firebase Storage.
 * @param storyId The ID of the story.
 * @param pageNumber The page number.
 * @param base64Image The base64 encoded image.
 * @returns The download URL of the uploaded image.
 */
export async function uploadImageToStorage(storyId: string, pageNumber: number, base64Image: string): Promise<string> {
  try {
    const blob = base64ToBlob(base64Image);
    const storageRef = ref(storage, `stories/${storyId}/page_${pageNumber}.png`);
    const snapshot = await uploadBytes(storageRef, blob);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  } catch (error) {
    console.error('Error uploading image to storage:', error);
    throw error;
  }
}

/**
 * Uploads a base64 audio to Firebase Storage.
 * @param storyId The ID of the story.
 * @param pageNumber The page number.
 * @param base64Audio The base64 encoded audio.
 * @returns The download URL of the uploaded audio.
 */
export async function uploadAudioToStorage(storyId: string, pageNumber: number, base64Audio: string): Promise<string> {
  try {
    const blob = base64ToBlob(base64Audio, 'audio/mpeg');
    const storageRef = ref(storage, `stories/${storyId}/page_${pageNumber}.mp3`);
    const snapshot = await uploadBytes(storageRef, blob);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  } catch (error) {
    console.error('Error uploading audio to storage:', error);
    throw error;
  }
}
