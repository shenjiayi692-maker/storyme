import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider,
  signOut,
  updateProfile,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: string;
  readingLevel?: string;
  createdAt: string;
  dailyStamps?: number;
  currentStreak?: number;
  lastCompletedDate?: string;
  recentReads?: string[];
}

export const signUpWithEmail = async (email: string, password: string, name: string): Promise<{ user: FirebaseUser; profile: UserProfile }> => {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  
  await updateProfile(user, { displayName: name });
  
  const profile: UserProfile = {
    uid: user.uid,
    name,
    email,
    role: 'client',
    readingLevel: '',
    createdAt: new Date().toISOString(),
    dailyStamps: 0,
    currentStreak: 0,
    recentReads: []
  };
  
  await setDoc(doc(db, 'users', user.uid), profile);
  
  return { user, profile };
};

export const signInWithEmail = async (email: string, password: string): Promise<{ user: FirebaseUser; profile: UserProfile | null }> => {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  
  const profile = await getUserProfile(user.uid);
  
  return { user, profile };
};

export const signInWithGoogle = async (): Promise<{ user: FirebaseUser; profile: UserProfile }> => {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  const user = result.user;
  
  const docSnap = await getDoc(doc(db, 'users', user.uid));
  
  let profile: UserProfile;
  if (!docSnap.exists()) {
    profile = {
      uid: user.uid,
      name: user.displayName || 'Explorer',
      email: user.email || '',
      role: 'client',
      readingLevel: '',
      createdAt: new Date().toISOString(),
      dailyStamps: 0,
      currentStreak: 0,
      recentReads: []
    };
    await setDoc(doc(db, 'users', user.uid), profile);
  } else {
    profile = docSnap.data() as UserProfile;
  }
  
  return { user, profile };
};

export const signOutUser = async () => {
  await signOut(auth);
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const docSnap = await getDoc(doc(db, 'users', uid));
  if (docSnap.exists()) {
    return docSnap.data() as UserProfile;
  }
  return null;
};
