import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import { audioBlobFromBase64 } from './audio';

/**
 * Uploads a page's narration to Firebase Storage and returns its download URL.
 * Narration easily exceeds Firestore's 1 MB document limit, so it is stored as a
 * file under the owner's folder (see storage.rules) and only the URL is saved.
 */
export async function uploadNarration(uid: string, storyId: string, pageIndex: number, base64Audio: string): Promise<string> {
  const blob = audioBlobFromBase64(base64Audio);
  const ext = blob.type === 'audio/mpeg' ? 'mp3' : 'wav';
  const storageRef = ref(storage, `users/${uid}/stories/${storyId}/page_${pageIndex}.${ext}`);
  const snapshot = await uploadBytes(storageRef, blob, { contentType: blob.type });
  return getDownloadURL(snapshot.ref);
}
