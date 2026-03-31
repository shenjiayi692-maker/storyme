/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  Sparkles, 
  ChevronRight, 
  ChevronLeft, 
  Volume2, 
  Square,
  MessageCircle, 
  X, 
  Send,
  Loader2,
  Trophy,
  Award,
  Wand2,
  Image as ImageIcon,
  Home as HomeIcon,
  Library,
  BarChart3,
  LogOut,
  Plus,
  Calendar,
  Zap,
  ChevronDown,
  Upload,
  FileText,
  User,
  Mail,
  Lock,
  CheckCircle2,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { 
  generateLevelWords, 
  generateStory, 
  generateImage, 
  generateSpeech, 
  chatWithGemini,
  processImportedStory,
  getWordDetails,
  generateStoryOptions,
  generateAllStoryOptions,
  Story, 
  WordSet,
  StoryOption
} from './services/gemini';
import { parsePdf, parseDocx, truncateText } from './services/fileParser';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { auth, db } from './firebase';
import { Language, translations } from './translations';
import { GLOBAL_STORY_OPTIONS } from './constants/storyOptions';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendEmailVerification, 
  onAuthStateChanged, 
  signOut, 
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  getDocFromServer,
  getDocs
} from 'firebase/firestore';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function cleanData(data: any): any {
  if (data === undefined) return null;
  if (data === null || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(cleanData);
  
  const cleaned: any = {};
  for (const key in data) {
    if (data[key] !== undefined) {
      cleaned[key] = cleanData(data[key]);
    }
  }
  return cleaned;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    (this as any).state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    const state = (this as any).state;
    const props = (this as any).props;

    if (state.hasError) {
      // Fallback to English if translations are not available
      const fallbackT = translations['English'];
      let errorMessage = fallbackT.somethingWentWrong;
      try {
        const parsedError = JSON.parse(state.error?.message || "");
        if (parsedError.error) {
          errorMessage = `Database Error: ${parsedError.error}`;
        }
      } catch (e) {
        errorMessage = state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-gray-100 text-center space-y-6">
            <div className="bg-rose-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 text-rose-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">{fallbackT.oops}</h2>
            <p className="text-gray-600">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return props.children;
  }
}
// --- End Error Handling ---

type AppState = 'home' | 'my-books' | 'explore' | 'progress' | 'welcome' | 'testing' | 'test-result' | 'config' | 'reading' | 'loading' | 'import' | 'auth' | 'reading-choice' | 're-test-ask';
type AuthMode = 'login' | 'signup' | 'verify';

const pageVariants = {
  initial: (direction: number) => ({
    x: direction > 0 ? '100%' : '-100%',
    rotateY: direction > 0 ? 45 : -45,
    opacity: 0,
    scale: 0.9,
  }),
  animate: {
    x: 0,
    rotateY: 0,
    opacity: 1,
    scale: 1,
    transition: {
      x: { type: "spring", stiffness: 300, damping: 30 },
      opacity: { duration: 0.2 },
      rotateY: { duration: 0.4 },
      scale: { duration: 0.4 }
    }
  },
  exit: (direction: number) => ({
    x: direction > 0 ? '-100%' : '100%',
    rotateY: direction > 0 ? -45 : 45,
    opacity: 0,
    scale: 0.9,
    transition: {
      x: { type: "spring", stiffness: 300, damping: 30 },
      opacity: { duration: 0.2 },
      rotateY: { duration: 0.4 },
      scale: { duration: 0.4 }
    }
  })
};

export default function App() {
  const [state, setState] = useState<AppState>('home');
  const [currentLanguage, setCurrentLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('appLanguage');
    return (saved as Language) || 'English';
  });
  const t = translations[currentLanguage];

  const translateLevel = (levelName: string) => {
    if (!levelName) return t.plotDetective;
    const key = levelName.toLowerCase().replace(/\s+/g, '') as keyof typeof t;
    return (t[key] as string) || levelName;
  };

  const getLevelValue = (levelName: string) => {
    const levels = ['Word Explorer', 'Sentence Builder', 'Page Turner', 'Chapter Chaser', 'Plot Detective'];
    return levels.indexOf(levelName);
  };

  const categorizeBook = (subject: string) => {
    const s = subject.toLowerCase();
    if (s.includes('magic') || s.includes('adventure') || s.includes('quest') || s.includes('fantasy') || s.includes('space') || s.includes('hero')) {
      return 'adventureAndMagic';
    }
    if (s.includes('animal') || s.includes('nature') || s.includes('forest') || s.includes('ocean') || s.includes('garden') || s.includes('pet')) {
      return 'animalsAndNature';
    }
    if (s.includes('friend') || s.includes('value') || s.includes('kindness') || s.includes('sharing') || s.includes('family') || s.includes('love') || s.includes('honesty')) {
      return 'friendshipAndValues';
    }
    if (s.includes('science') || s.includes('discover') || s.includes('learn') || s.includes('history') || s.includes('invention') || s.includes('explore')) {
      return 'scienceAndDiscovery';
    }
    return 'adventureAndMagic'; // Default
  };

  const translateSubject = (subjectKey: string) => {
    return (t[subjectKey as keyof typeof t] as string) || subjectKey;
  };

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const [wordSets, setWordSets] = useState<WordSet[]>([]);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [results, setResults] = useState<{set: string, correct: number, missed: number}[]>([]);
  const [previousLevel, setPreviousLevel] = useState<string | null>(null);
  const [levelImproved, setLevelImproved] = useState(false);
  
  const [level, setLevel] = useState('');
  
  const [storyConfig, setStoryConfig] = useState({
    characters: [] as string[],
    locations: [] as string[],
    characterDetails: '',
    locationDetails: '',
    activities: '',
    values: [] as string[],
    imageSize: '1K' as '1K' | '2K' | '4K',
    storyLang: currentLanguage
  });
  const [customCharacterInput, setCustomCharacterInput] = useState('');
  const [customLocationInput, setCustomLocationInput] = useState('');
  const [configStep, setConfigStep] = useState(1);
  const [configOptions, setConfigOptions] = useState<{
    characters: StoryOption[],
    locations: StoryOption[],
    values: StoryOption[]
  }>({
    characters: [],
    locations: [],
    values: []
  });

  const [configOptionsPool, setConfigOptionsPool] = useState<{
    characters: StoryOption[],
    locations: StoryOption[],
    values: StoryOption[]
  }>({
    characters: [],
    locations: [],
    values: []
  });

  const [story, setStory] = useState<Story | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [isGeneratingPage, setIsGeneratingPage] = useState(false);
  const generatingPagesRef = useRef<Set<number>>(new Set());
  const prefetchLoopRef = useRef<number>(0);
  const [loadingMessage, setLoadingMessage] = useState('');

  const [myBooks, setMyBooks] = useState<Story[]>([]);
  const [allBooks, setAllBooks] = useState<Story[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Word list and progress states
  const [myWordList, setMyWordList] = useState<{word: string, explanation: string, exampleSentence: string, status: 'learning' | 'learned', addedAt: string}[]>([]);
  const [wordListFilter, setWordListFilter] = useState<'learning' | 'learned' | 'all'>('learning');
  const [showWordList, setShowWordList] = useState(false);
  const [dailyStamps, setDailyStamps] = useState<number>(0);
  const [currentStreak, setCurrentStreak] = useState<number>(0);
  const [lastCompletedDate, setLastCompletedDate] = useState<string | null>(null);

  // Word detail modal state
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [wordDetails, setWordDetails] = useState<any>(null);
  const [isWordLoading, setIsWordLoading] = useState(false);

  // Chatbot state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [readingWordIndex, setReadingWordIndex] = useState<number | null>(null);
  const [readingMode, setReadingMode] = useState<'read' | 'listen'>('read');
  const [direction, setDirection] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setReadingWordIndex(null);
  };

  const resetStoryConfig = () => {
    setStoryConfig({
      characters: [],
      locations: [],
      characterDetails: '',
      locationDetails: '',
      activities: '',
      values: [],
      imageSize: '1K',
      storyLang: currentLanguage
    });
    setConfigOptions({
      characters: [],
      locations: [],
      values: []
    });
    setConfigOptionsPool({
      characters: [],
      locations: [],
      values: []
    });
    setConfigStep(1);
    setStory(null);
    setCurrentPage(0);
    setReadingWordIndex(null);
  };
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'ai', text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const path = `users/${u.uid}`;
        try {
          const docRef = doc(db, path);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserProfile(data);
            setLevel(data.readingLevel || '');
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, path);
        }
      } else {
        setUserProfile(null);
        setLevel('');
      }
      setIsAuthReady(true);
    });

    // Load local storage data for guest/progress
    const storedWordList = localStorage.getItem('myWordList');
    if (storedWordList) setMyWordList(JSON.parse(storedWordList));

    const storedStamps = localStorage.getItem('dailyStamps');
    const lastStampDate = localStorage.getItem('lastStampDate');
    const today = new Date().toDateString();
    
    if (lastStampDate !== today) {
      setDailyStamps(0);
      localStorage.setItem('dailyStamps', '0');
      localStorage.setItem('lastStampDate', today);
    } else if (storedStamps) {
      setDailyStamps(parseInt(storedStamps));
    }

    const storedStreak = localStorage.getItem('currentStreak');
    const storedLastDate = localStorage.getItem('lastCompletedDate');
    if (storedLastDate) {
      const lastDate = new Date(storedLastDate);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (lastDate.toDateString() !== today && lastDate.toDateString() !== yesterday.toDateString()) {
        setCurrentStreak(0);
        localStorage.setItem('currentStreak', '0');
      } else if (storedStreak) {
        setCurrentStreak(parseInt(storedStreak));
      }
    } else if (storedStreak) {
      setCurrentStreak(parseInt(storedStreak));
    }

    setLastCompletedDate(storedLastDate);

    // Load local books
    const storedMyBooks = localStorage.getItem('myBooks');
    if (storedMyBooks) setMyBooks(JSON.parse(storedMyBooks));
    
    const storedAllBooks = localStorage.getItem('allBooks');
    if (storedAllBooks) setAllBooks(JSON.parse(storedAllBooks));

    return () => unsubscribe();
  }, []);

  // Firestore Data Sync
  useEffect(() => {
    if (!user || !isAuthReady) return;

    const path = 'stories';
    
    // Sync My Books
    const myQuery = query(
      collection(db, path), 
      where('uid', '==', user.uid)
    );

    const unsubscribeMy = onSnapshot(myQuery, (snapshot) => {
      const books = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Story));
      setMyBooks(books);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    // Sync Global Books (Explore)
    const globalQuery = query(
      collection(db, path)
    );

    const unsubscribeGlobal = onSnapshot(globalQuery, (snapshot) => {
      const books = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Story));
      setAllBooks(books);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    // Sync User Profile
    const userPath = `users/${user.uid}`;
    const unsubscribeUser = onSnapshot(doc(db, userPath), (snapshot) => {
      if (snapshot.exists()) {
        const profile = snapshot.data();
        setUserProfile(profile);
        if (profile.readingLevel) setLevel(profile.readingLevel);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, userPath);
    });

    return () => {
      unsubscribeMy();
      unsubscribeGlobal();
      unsubscribeUser();
    };
  }, [user, isAuthReady]);

  // Test Connection
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    if ((state === 'config' || state === 'welcome' || state === 're-test-ask') && configOptions.characters.length === 0) {
      refreshAllOptions();
    }
  }, [state]);

  const refreshAllOptions = async () => {
    try {
      const isEnglish = currentLanguage.toLowerCase() === 'english';
      
      const translateOptions = (options: any[]) => {
        return options.map(opt => {
          if (isEnglish) return { text: opt.text, emoji: opt.emoji };
          const translation = opt.translations[currentLanguage] || opt.text;
          return {
            text: `${opt.text} (${translation})`,
            emoji: opt.emoji
          };
        });
      };

      const allOptions = {
        characters: translateOptions(GLOBAL_STORY_OPTIONS.characters),
        locations: translateOptions(GLOBAL_STORY_OPTIONS.locations),
        values: translateOptions(GLOBAL_STORY_OPTIONS.values)
      };

      setConfigOptionsPool(allOptions);
      
      // Pick initial 8 random ones from the 24
      const getRandom8 = (arr: any[]) => {
        const shuffled = [...arr].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, 8);
      };

      setConfigOptions({
        characters: getRandom8(allOptions.characters),
        locations: getRandom8(allOptions.locations),
        values: getRandom8(allOptions.values)
      });
    } catch (error) {
      console.error("Error refreshing all options:", error);
    }
  };

  const compressImage = (base64: string, maxWidth = 640, quality = 0.5): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          // Use webp if possible, fallback to jpeg
          try {
            resolve(canvas.toDataURL('image/webp', quality));
          } catch (e) {
            resolve(canvas.toDataURL('image/jpeg', quality));
          }
        } else {
          resolve(base64);
        }
      };
      img.onerror = () => resolve(base64);
    });
  };

  const handleAuth = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const name = formData.get('name') as string;

    try {
      if (authMode === 'signup') {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const u = userCredential.user;
        
        await updateProfile(u, { displayName: name });
        await sendEmailVerification(u);
        
        const path = `users/${u.uid}`;
        const profile = {
          uid: u.uid,
          name,
          email,
          role: 'client',
          readingLevel: '',
          createdAt: new Date().toISOString()
        };
        
        try {
          await setDoc(doc(db, path), cleanData(profile));
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, path);
        }
        
        setUser(u);
        setUserProfile(profile);
        setAuthMode('verify');
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const u = userCredential.user;
        
        if (!u.emailVerified) {
          setAuthError('Please verify your email address before logging in.');
          setAuthMode('verify');
          return;
        }
        
        const path = `users/${u.uid}`;
        try {
          const docSnap = await getDoc(doc(db, path));
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserProfile(data);
            setLevel(data.readingLevel || '');
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, path);
        }
        
        setState('home');
      }
    } catch (error: any) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setAuthError('');
    setAuthLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const u = result.user;
      
      const path = `users/${u.uid}`;
      const docSnap = await getDoc(doc(db, path));
      
      let profile: any;
      if (!docSnap.exists()) {
        profile = {
          uid: u.uid,
          name: u.displayName || 'Explorer',
          email: u.email,
          role: 'client',
          readingLevel: '',
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, path), cleanData(profile));
      } else {
        profile = docSnap.data();
      }
      
      setUser(u);
      setUserProfile(profile);
      setLevel(profile.readingLevel || '');
      setState('home');
    } catch (error: any) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const trackReading = async (bookId: string, isOwner: boolean) => {
    if (user && bookId) {
      const userPath = `users/${user.uid}`;
      const storyPath = `stories/${bookId}`;
      
      try {
        // Update user's recent reads list (keep last 10)
        const currentRecent = userProfile?.recentReads || [];
        const newRecent = [bookId, ...currentRecent.filter((id: string) => id !== bookId)].slice(0, 10);
        
        await updateDoc(doc(db, userPath), cleanData({ recentReads: newRecent }));
        setUserProfile((prev: any) => ({ ...prev, recentReads: newRecent }));

        // Also update lastOpenedAt if owner
        if (isOwner) {
          await updateDoc(doc(db, storyPath), cleanData({ lastOpenedAt: new Date().toISOString() }));
        }
      } catch (error) {
        console.error("Failed to update reading history:", error);
      }
    }
  };

  const openBook = async (book: Story) => {
    setStory(book);
    setCurrentPage(0);
    setState('reading-choice');
    
    // Fetch assets from subcollection if logged in
    if (user && book.id) {
      try {
        const assetsRef = collection(db, `stories/${book.id}/assets`);
        const snapshot = await getDocs(assetsRef);
        const assets: Record<number, { imageUrl?: string; audioData?: string }> = {};
        snapshot.forEach(doc => {
          const id = doc.id;
          // Handle both legacy (idx) and new (idx_type) formats
          const parts = id.split('_');
          const idx = parseInt(parts[0]);
          if (isNaN(idx)) return;
          
          if (!assets[idx]) assets[idx] = {};
          const data = doc.data();
          
          if (parts.length > 1) {
            if (parts[1] === 'image') assets[idx].imageUrl = data.imageUrl;
            else if (parts[1] === 'audio') assets[idx].audioData = data.audioData;
          } else {
            // Legacy format
            if (data.imageUrl) assets[idx].imageUrl = data.imageUrl;
            if (data.audioData) assets[idx].audioData = data.audioData;
          }
        });
        
        setStory(prev => {
          if (!prev || prev.id !== book.id) return prev;
          const newPages = prev.pages.map((page, idx) => ({
            ...page,
            ...assets[idx]
          }));
          return { ...prev, pages: newPages };
        });
      } catch (err) {
        console.error("Failed to fetch story assets:", err);
      }
    }
    
    generatePageAssets(0, book);
    
    if (book.id) {
      trackReading(book.id, book.uid === user?.uid);
    }
  };

  const startTest = async () => {
    setState('loading');
    setLoadingMessage(t.preparingQuest);
    setPreviousLevel(userProfile?.readingLevel || null);
    setLevelImproved(false);
    try {
      const sets = await generateLevelWords(currentLanguage);
      setWordSets(sets);
      setResults(sets.map(s => ({ set: s.difficulty, correct: 0, missed: 0 })));
      setState('testing');
      setCurrentSetIndex(0);
      setCurrentWordIndex(0);
      setLevel(''); // Fixed: level is a string
    } catch (error) {
      console.error(error);
      setState('home');
    }
  };

  const handleWordResponse = (known: boolean) => {
    const newResults = [...results];
    if (known) {
      newResults[currentSetIndex].correct += 1;
    } else {
      newResults[currentSetIndex].missed += 1;
    }
    setResults(newResults);
    
    const levels = ['Word Explorer', 'Sentence Builder', 'Page Turner', 'Chapter Chaser', 'Plot Detective'];

    if (newResults[currentSetIndex].missed >= 2) {
      // User failed 2 words in the current level.
      // Logic: If fail Level 2 (index 1), give Level 1 (index 0).
      // If fail Level 1 (index 0), give Level 1 (index 0).
      const determinedLevel = levels[Math.max(0, currentSetIndex - 1)];
      setLevel(determinedLevel);
      saveLevel(determinedLevel);
      
      if (previousLevel && getLevelValue(determinedLevel) > getLevelValue(previousLevel)) {
        setLevelImproved(true);
      }
      
      setState('test-result');
      return;
    }

    if (currentWordIndex < 2) {
      setCurrentWordIndex(prev => prev + 1);
    } else if (currentSetIndex < 4) {
      setCurrentSetIndex(prev => prev + 1);
      setCurrentWordIndex(0);
    } else {
      // Passed all 5 levels!
      const determinedLevel = levels[4]; // Plot Detective
      setLevel(determinedLevel);
      saveLevel(determinedLevel);
      
      if (previousLevel && getLevelValue(determinedLevel) > getLevelValue(previousLevel)) {
        setLevelImproved(true);
      }
      
      setState('test-result');
    }
  };

  const refreshOptions = async (category: 'characters' | 'locations' | 'values') => {
    if (configOptionsPool[category].length > 8) {
      // Pick 8 random ones from the pool that are different from current if possible
      const currentTexts = configOptions[category].map(o => o.text);
      const available = configOptionsPool[category].filter(o => !currentTexts.includes(o.text));
      
      let newSet;
      if (available.length >= 8) {
        newSet = available.sort(() => 0.5 - Math.random()).slice(0, 8);
      } else {
        newSet = [...configOptionsPool[category]].sort(() => 0.5 - Math.random()).slice(0, 8);
      }
      
      setConfigOptions(prev => ({ ...prev, [category]: newSet }));
    } else {
      try {
        const newOptions = await generateStoryOptions(category, level || 'Word Explorer', currentLanguage);
        setConfigOptions(prev => ({ ...prev, [category]: newOptions }));
      } catch (error) {
        console.error(`Error refreshing ${category} options:`, error);
      }
    }
  };

  const saveLevel = async (newLevel: string) => {
    if (user) {
      const path = `users/${user.uid}`;
      try {
        await updateDoc(doc(db, path), cleanData({ readingLevel: newLevel }));
        setUserProfile(prev => ({ ...prev, readingLevel: newLevel }));
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    }
  };

  const createStory = async () => {
    setState('loading');
    setLoadingMessage(t.weavingStory);
    try {
      const generatedStory = await generateStory(
        level,
        storyConfig.characters,
        storyConfig.locations,
        storyConfig.activities,
        storyConfig.values,
        currentLanguage,
        storyConfig.characterDetails,
        storyConfig.locationDetails
      );
      
      const storyWithUid = { ...generatedStory, uid: user?.uid || null, level, createdAt: new Date().toISOString() };
      
      if (user) {
        const path = 'stories';
        try {
          const docRef = doc(collection(db, path));
          const storyWithId = { ...storyWithUid, id: docRef.id };
          
          await setDoc(docRef, cleanData(storyWithId));
          setStory(storyWithId);
          setCurrentPage(0);
          setState('reading-choice');
          generatePageAssets(0, storyWithId);
          trackReading(docRef.id, true);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, path);
        }
      } else {
        setStory(storyWithUid);
        setCurrentPage(0);
        setState('reading-choice');
        generatePageAssets(0, storyWithUid);
        const newMyBooks = [storyWithUid as Story, ...myBooks];
        setMyBooks(newMyBooks);
        localStorage.setItem('myBooks', JSON.stringify(newMyBooks));
        
        const newAllBooks = [storyWithUid as Story, ...allBooks];
        setAllBooks(newAllBooks);
        localStorage.setItem('allBooks', JSON.stringify(newAllBooks));
      }
    } catch (error) {
      console.error(error);
      setState('config');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setState('loading');
    setLoadingMessage(t.readingStory);
    try {
      let text = '';
      if (file.type === 'application/pdf') {
        text = await parsePdf(file);
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        text = await parseDocx(file);
      } else {
        text = await file.text();
      }

      const truncated = truncateText(text, 500);
      const importedStory = await processImportedStory(truncated, currentLanguage);
      const storyWithUid = { ...importedStory, uid: user?.uid || null, level, isImported: true, createdAt: new Date().toISOString() };
      
      if (user) {
        const path = 'stories';
        try {
          const docRef = doc(collection(db, path));
          const storyWithId = { ...storyWithUid, id: docRef.id };
          
          await setDoc(docRef, cleanData(storyWithId));
          setStory(storyWithId);
          setCurrentPage(0);
          setState('reading-choice');
          generatePageAssets(0, storyWithId);
          trackReading(docRef.id, true);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, path);
        }
      } else {
        setStory(storyWithUid);
        setCurrentPage(0);
        setState('reading-choice');
        generatePageAssets(0, storyWithUid);
        const newMyBooks = [storyWithUid as Story, ...myBooks];
        setMyBooks(newMyBooks);
        localStorage.setItem('myBooks', JSON.stringify(newMyBooks));

        const newAllBooks = [storyWithUid as Story, ...allBooks];
        setAllBooks(newAllBooks);
        localStorage.setItem('allBooks', JSON.stringify(newAllBooks));
      }
    } catch (error) {
      console.error("Import error:", error);
      alert(t.failedToImport);
      setState('home');
    }
  };

  const generatePageAssets = async (index: number, currentStory: any) => {
    if (!currentStory.pages[index]) return;
    
    // Helper to generate for a single page
    const generateForPage = async (idx: number) => {
      // Avoid redundant generation
      if (generatingPagesRef.current.has(idx)) return;
      
      const page = currentStory.pages[idx];
      if (!page) return;

      const needsImage = !page.imageUrl;
      const needsAudio = !page.audioData;
      
      if (!needsImage && !needsAudio) return;

      generatingPagesRef.current.add(idx);
      try {
        if (needsImage) {
          try {
            const url = await generateImage(page.imagePrompt, storyConfig.imageSize);
            if (url) {
              // Compress image to save space
              page.imageUrl = await compressImage(url, 800, 0.6);
            }
          } catch (err) {
            console.error(`Image generation failed for page ${idx}:`, err);
          }
        }
        
        if (needsAudio) {
          try {
            const data = await generateSpeech(page.text);
            if (data) page.audioData = data;
          } catch (err) {
            console.error(`Speech generation failed for page ${idx}:`, err);
          }
        }

        // Update state to reflect new assets
        setStory(prev => {
          if (!prev || prev.id !== currentStory.id) return prev;
          const newPages = [...prev.pages];
          newPages[idx] = { ...page };
          const updatedStory = { ...prev, pages: newPages };
          
          // Persist changes
          if (user && updatedStory.id) {
            // Save heavy assets to subcollection to avoid 1MB document limit
            // We split image and audio into separate documents to double the available space
            const imagePath = `stories/${updatedStory.id}/assets/${idx}_image`;
            const audioPath = `stories/${updatedStory.id}/assets/${idx}_audio`;
            
            if (page.imageUrl) {
              setDoc(doc(db, imagePath), cleanData({ uid: user.uid, imageUrl: page.imageUrl })).catch(err => {
                console.error(`Error updating image asset for page ${idx}:`, err);
              });
            }
            
            if (page.audioData) {
              setDoc(doc(db, audioPath), cleanData({ uid: user.uid, audioData: page.audioData })).catch(err => {
                console.error(`Error updating audio asset for page ${idx}:`, err);
              });
            }

            // Update main document but keep it small
            // We only keep the cover image (page 0) in the main document for the Explore view
            const pagesForMainDoc = newPages.map((p, i) => {
              const { imageUrl, audioData, ...rest } = p;
              if (i === 0 && imageUrl) {
                return { ...rest, imageUrl };
              }
              return rest;
            });

            const path = `stories/${updatedStory.id}`;
            updateDoc(doc(db, path), cleanData({ pages: pagesForMainDoc })).catch(err => {
              console.error(`Error updating main story document for page ${idx}:`, err);
            });
          } else {
            // Update local storage for non-logged in users
            const updateLocal = (list: Story[]) => {
              return list.map(b => b.title === updatedStory.title ? updatedStory : b);
            };
            
            setMyBooks(prevMy => {
              const updated = updateLocal(prevMy);
              localStorage.setItem('myBooks', JSON.stringify(updated));
              return updated;
            });
            
            setAllBooks(prevAll => {
              const updated = updateLocal(prevAll);
              localStorage.setItem('allBooks', JSON.stringify(updated));
              return updated;
            });
          }
          
          return updatedStory;
        });
      } catch (err) {
        console.error(`Error generating assets for page ${idx}:`, err);
      } finally {
        generatingPagesRef.current.delete(idx);
      }
    };

    setIsGeneratingPage(true);
    await generateForPage(index);
    setIsGeneratingPage(false);

    // Pre-fetch all subsequent pages in parallel with a small stagger to avoid rate limits
    const loopId = ++prefetchLoopRef.current;
    const prefetch = async () => {
      const pagesToGenerate = [];
      for (let i = 0; i < currentStory.pages.length; i++) {
        if (i === index) continue; // Skip current page as it's already done
        
        // Check if page already has assets or is being generated
        if ((currentStory.pages[i].imageUrl && currentStory.pages[i].audioData) || generatingPagesRef.current.has(i)) continue;
        
        pagesToGenerate.push(i);
      }

      // Start generation for all needed pages in parallel with a small stagger
      pagesToGenerate.forEach((i, staggerIdx) => {
        setTimeout(async () => {
          // Stop if a new prefetch loop has started
          if (loopId !== prefetchLoopRef.current) return;
          await generateForPage(i);
        }, staggerIdx * 800); // 800ms stagger between starting each page to be safe with rate limits
      });
    };
    prefetch();
  };

  const playAudio = (base64: string, text: string, onEnded?: () => void) => {
    stopAudio();
    try {
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const isWav = binaryString.startsWith('RIFF');
      const isMp3 = binaryString.startsWith('ID3') || (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0);

      let blob: Blob;
      if (isWav) {
        blob = new Blob([bytes], { type: 'audio/wav' });
      } else if (isMp3) {
        blob = new Blob([bytes], { type: 'audio/mpeg' });
      } else {
        const header = new ArrayBuffer(44);
        const view = new DataView(header);
        view.setUint32(0, 0x52494646, false);
        view.setUint32(4, 36 + len, true);
        view.setUint32(8, 0x57415645, false);
        view.setUint32(12, 0x666d7420, false);
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, 24000, true);
        view.setUint32(28, 24000 * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        view.setUint32(36, 0x64617461, false);
        view.setUint32(40, len, true);
        const wavBytes = new Uint8Array(44 + len);
        wavBytes.set(new Uint8Array(header), 0);
        wavBytes.set(bytes, 44);
        blob = new Blob([wavBytes], { type: 'audio/wav' });
      }

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      const words = text.split(/\s+/).filter(w => w.length > 0);
      
      audio.onplay = () => {
        setReadingWordIndex(0);
      };

      audio.ontimeupdate = () => {
        if (audio.duration) {
          const progress = audio.currentTime / audio.duration;
          const index = Math.floor(progress * words.length);
          setReadingWordIndex(Math.min(index, words.length - 1));
        }
      };

      audio.onended = () => {
        setReadingWordIndex(null);
        URL.revokeObjectURL(url);
        audioRef.current = null;
        if (onEnded) onEnded();
      };

      audio.onerror = (e) => {
        console.error("Audio playback error:", e);
        setReadingWordIndex(null);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };
      
      audio.play().catch(err => {
        console.error("Audio play failed:", err);
        setReadingWordIndex(null);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      });
    } catch (err) {
      console.error("Error preparing audio:", err);
    }
  };

  useEffect(() => {
    if (state === 'reading' && readingMode === 'listen' && story?.pages[currentPage]?.audioData && !isGeneratingPage) {
      const timer = setTimeout(() => {
        playAudio(story.pages[currentPage].audioData!, story.pages[currentPage].text, () => {
          if (currentPage < story.pages.length - 1) {
            const nextPage = currentPage + 1;
            setDirection(1);
            setCurrentPage(nextPage);
            generatePageAssets(nextPage, story);
          } else {
            finishStory();
          }
        });
      }, 1500);
      return () => {
        clearTimeout(timer);
        stopAudio();
      };
    }
  }, [currentPage, state, readingMode, story, isGeneratingPage]);

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsChatLoading(true);
    try {
      const aiResponse = await chatWithGemini(userMsg, [], currentLanguage);
      setChatMessages(prev => [...prev, { role: 'ai', text: aiResponse || 'I am not sure how to answer that.' }]);
    } catch (error) {
      console.error(error);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleWordClick = async (word: string) => {
    // Clean word from punctuation
    const cleanWord = word.replace(/[.,!?;:()"]/g, '');
    setSelectedWord(cleanWord);
    
    // Check if word is in current page annotations
    if (story && story.pages[currentPage].annotations) {
      const annotation = story.pages[currentPage].annotations.find(a => a.word.toLowerCase() === cleanWord.toLowerCase());
      if (annotation) {
        setWordDetails({
          explanation: annotation.explanation,
          exampleSentence: story.pages[currentPage].text
        });
        return;
      }
    }

    setIsWordLoading(true);
    try {
      const details = await getWordDetails(cleanWord, currentLanguage);
      setWordDetails(details);
    } catch (error) {
      console.error("Error fetching word details:", error);
    } finally {
      setIsWordLoading(false);
    }
  };

  const addToWordList = () => {
    if (!selectedWord || !wordDetails) return;
    
    const newWord = {
      word: selectedWord,
      explanation: wordDetails.explanation,
      exampleSentence: wordDetails.exampleSentence,
      status: 'learning' as const,
      addedAt: new Date().toISOString().split('T')[0]
    };

    if (!myWordList.some(w => w.word.toLowerCase() === selectedWord.toLowerCase())) {
      const updatedList = [newWord, ...myWordList];
      setMyWordList(updatedList);
      localStorage.setItem('myWordList', JSON.stringify(updatedList));
    }
    setSelectedWord(null);
  };

  const markAsLearned = (word: string) => {
    const updatedList = myWordList.map(w => 
      w.word.toLowerCase() === word.toLowerCase() ? { ...w, status: 'learned' as const } : w
    );
    setMyWordList(updatedList);
    localStorage.setItem('myWordList', JSON.stringify(updatedList));
  };

  const finishStory = async () => {
    const today = new Date().toDateString();
    
    // Update daily stamps
    const newStamps = dailyStamps + 1;
    setDailyStamps(newStamps);
    localStorage.setItem('dailyStamps', newStamps.toString());
    localStorage.setItem('lastStampDate', today);

    // Update streak
    let newStreak = currentStreak;
    if (lastCompletedDate) {
      const lastDate = new Date(lastCompletedDate);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (lastDate.toDateString() === yesterday.toDateString()) {
        newStreak += 1;
      } else if (lastDate.toDateString() !== today) {
        newStreak = 1;
      }
    } else {
      newStreak = 1;
    }
    
    setCurrentStreak(newStreak);
    setLastCompletedDate(today);
    localStorage.setItem('currentStreak', newStreak.toString());
    localStorage.setItem('lastCompletedDate', today);

    if (user) {
      const path = `users/${user.uid}`;
      try {
        await updateDoc(doc(db, path), cleanData({
          dailyStamps: newStamps,
          currentStreak: newStreak,
          lastCompletedDate: today
        }));
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    }

    setState('progress');
  };

  const NavButton = ({ id, label, icon: Icon }: { id: AppState, label: string, icon: any }) => (
    <button 
      onClick={() => setState(id)}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all",
        state === id ? "bg-indigo-50 text-indigo-600" : "text-gray-600 hover:bg-gray-50"
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#FDFCF0] text-[#2D3436] font-sans selection:bg-indigo-100">
      {/* Header */}
      <header className="px-6 py-4 flex justify-between items-center border-b border-gray-100 bg-white sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-1.5 rounded-lg">
            <BookOpen className="text-white w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">StoryMe</h1>
        </div>
        
        <nav className="hidden md:flex items-center gap-4">
          <NavButton id="home" label={t.home} icon={HomeIcon} />
          <NavButton id="my-books" label={t.myBooks} icon={Library} />
          <NavButton id="explore" label={t.explore} icon={Sparkles} />
          <NavButton id="progress" label={t.progress} icon={BarChart3} />
          
          <div className="flex items-center gap-2 ml-2 pr-4 border-r border-gray-100">
            <select 
              value={currentLanguage}
              onChange={(e) => {
                const newLang = e.target.value as Language;
                setCurrentLanguage(newLang);
                localStorage.setItem('appLanguage', newLang);
              }}
              className="bg-gray-50 text-sm font-bold text-gray-600 outline-none cursor-pointer px-3 py-1.5 rounded-xl hover:bg-gray-100 transition-colors border border-gray-100"
            >
              <option value="English">English</option>
              <option value="French">Français</option>
              <option value="Chinese">中文</option>
              <option value="Korean">한국어</option>
              <option value="Spanish">Español</option>
            </select>
          </div>

          <div className="flex items-center gap-4 pl-4">
            {user ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                    {user?.displayName?.[0] || 'U'}
                  </div>
                  <span className="text-sm font-bold text-gray-700">{user?.displayName}</span>
                </div>
                <button 
                  onClick={async () => {
                    await signOut(auth);
                    setUser(null);
                    setUserProfile(null);
                    setMyBooks([]);
                    setState('home');
                  }}
                  className="text-gray-400 hover:text-rose-500 transition-colors"
                  title={t.signOut}
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </>
            ) : (
              <button 
                onClick={() => {
                  setAuthMode('login');
                  setState('auth');
                }}
                className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center gap-2"
              >
                <User className="w-4 h-4" />
                {t.logIn}
              </button>
            )}
          </div>
        </nav>
      </header>

      <main className="relative">
        <AnimatePresence mode="wait">
          {state === 'auth' && (
            <motion.div 
              key="auth"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-md mx-auto py-20 px-6"
            >
              <div className="bg-white p-10 rounded-[40px] shadow-2xl border border-gray-100 space-y-8">
                <div className="text-center space-y-2">
                  <h2 className="text-3xl font-black text-gray-900">
                    {authMode === 'login' ? t.welcomeBack : authMode === 'signup' ? t.joinStoryMe : t.verifyEmail}
                  </h2>
                  <p className="text-gray-500">
                    {authMode === 'login' ? t.continueAdventure : authMode === 'signup' ? t.createAccountChild : t.checkInbox}
                  </p>
                </div>

                {authMode === 'verify' ? (
                  <div className="text-center space-y-6">
                    <div className="bg-indigo-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                      <Mail className="w-10 h-10 text-indigo-600" />
                    </div>
                    <p className="text-gray-600">{t.verificationSent}</p>
                    <div className="space-y-3">
                      <button 
                        onClick={async () => {
                          if (auth.currentUser) {
                            await auth.currentUser.reload();
                            if (auth.currentUser.emailVerified) {
                              setUser(auth.currentUser);
                              setState('home');
                            } else {
                              setAuthError('Email not verified yet. Please check your inbox.');
                            }
                          }
                        }}
                        className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2"
                      >
                        <RefreshCw className="w-5 h-5" />
                        {t.iveVerified}
                      </button>
                      <button 
                        onClick={() => setAuthMode('login')}
                        className="w-full text-indigo-600 py-2 font-bold"
                      >
                        {t.backToLogin}
                      </button>
                    </div>
                    {authError && (
                      <div className="bg-rose-50 text-rose-600 p-4 rounded-xl text-sm flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        {authError}
                      </div>
                    )}
                  </div>
                ) : (
                  <form onSubmit={handleAuth} className="space-y-4">
                    {authMode === 'signup' && (
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 uppercase ml-2">{t.name}</label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" />
                          <input name="name" type="text" required placeholder={t.childNamePlaceholder} className="w-full pl-12 pr-4 py-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:border-indigo-400 outline-none transition-all" />
                        </div>
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase ml-2">{t.email}</label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" />
                        <input name="email" type="email" required placeholder={t.emailPlaceholder} className="w-full pl-12 pr-4 py-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:border-indigo-400 outline-none transition-all" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase ml-2">{t.password}</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" />
                        <input name="password" type="password" required placeholder="********" className="w-full pl-12 pr-4 py-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:border-indigo-400 outline-none transition-all" />
                      </div>
                    </div>

                    {authError && (
                      <div className="flex items-center gap-2 text-rose-500 text-sm bg-rose-50 p-3 rounded-xl">
                        <AlertCircle className="w-4 h-4" />
                        {authError}
                      </div>
                    )}

                    <button 
                      disabled={authLoading}
                      className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                    >
                      {authLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : authMode === 'login' ? t.logIn : t.signUp}
                    </button>

                    <div className="relative py-4">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
                      <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-gray-400 font-bold">{t.orContinueWith}</span></div>
                    </div>

                    <button 
                      type="button"
                      onClick={handleGoogleAuth}
                      disabled={authLoading}
                      className="w-full bg-white border-2 border-gray-100 text-gray-700 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:border-indigo-200 transition-all"
                    >
                      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                      Google
                    </button>

                    <p className="text-center text-sm text-gray-500">
                      {authMode === 'login' ? t.dontHaveAccount : t.alreadyHaveAccount}
                      <button 
                        type="button"
                        onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                        className="text-indigo-600 font-bold hover:underline"
                      >
                        {authMode === 'login' ? t.signUp : t.logIn}
                      </button>
                    </p>
                  </form>
                )}
              </div>
            </motion.div>
          )}

          {state === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="min-h-[calc(100vh-73px)]"
            >
              {/* Hero Section */}
              <div className="relative h-[600px] flex flex-col items-center justify-center text-center px-6 overflow-hidden">
                <div className="absolute inset-0 -z-10 opacity-20 pointer-events-none">
                  <div className="absolute top-20 left-10 w-64 h-64 bg-pink-200 rounded-full blur-3xl" />
                  <div className="absolute bottom-20 right-10 w-96 h-96 bg-indigo-200 rounded-full blur-3xl" />
                  <img 
                    src="https://picsum.photos/seed/magic/1920/1080" 
                    className="w-full h-full object-cover opacity-30 grayscale" 
                    referrerPolicy="no-referrer"
                    alt="" 
                  />
                </div>

                <motion.h2 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="text-7xl font-serif font-bold text-gray-900 mb-6"
                >
                  {t.heroTitle}
                </motion.h2>
                <motion.p 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="text-xl text-gray-600 max-w-2xl mb-12 leading-relaxed"
                >
                  {t.heroSubtitle}
                </motion.p>
                
                <div className="flex flex-col items-center gap-8">
                  <div className="flex flex-col md:flex-row items-center gap-6">
                    <button 
                      onClick={() => {
                        resetStoryConfig();
                        level ? setState('re-test-ask') : setState('welcome');
                      }}
                      className="bg-[#2D3E50] hover:bg-[#1A2A3A] text-white px-10 py-5 rounded-2xl text-xl font-bold flex items-center gap-3 shadow-2xl transition-all hover:scale-105"
                    >
                      <Sparkles className="w-6 h-6" />
                      {t.createNewStory}
                    </button>
                    <button 
                      onClick={() => setState('import')}
                      className="bg-white border-2 border-gray-100 hover:border-indigo-200 text-gray-700 px-10 py-5 rounded-2xl text-xl font-bold flex items-center gap-3 shadow-xl transition-all hover:scale-105"
                    >
                      <Upload className="w-6 h-6 text-indigo-500" />
                      {t.importYourStory}
                    </button>
                  </div>
                </div>
              </div>

              {/* Recent Books */}
              <div className="max-w-7xl mx-auto px-6 pb-20">
                <div className="flex justify-between items-center mb-10">
                  <h3 className="text-2xl font-bold text-gray-900">{t.recentlyRead}</h3>
                  <button onClick={() => setState('my-books')} className="text-indigo-600 font-bold hover:underline">{t.viewAll}</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-8">
                  {userProfile?.recentReads && userProfile.recentReads.length > 0 ? (
                    allBooks
                      .filter(b => userProfile.recentReads.includes(b.id))
                      .sort((a, b) => userProfile.recentReads.indexOf(a.id) - userProfile.recentReads.indexOf(b.id))
                      .slice(0, 4)
                      .map((book, i) => (
                        <motion.div 
                          key={i}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.1 }}
                          onClick={() => openBook(book)}
                          className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden cursor-pointer hover:shadow-xl transition-all group"
                        >
                          <div className="relative aspect-[3/4] overflow-hidden bg-gray-50">
                            {book.pages[0].imageUrl ? (
                              <img 
                                src={book.pages[0].imageUrl} 
                                alt={book.title} 
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-200">
                                <ImageIcon className="w-12 h-12" />
                              </div>
                            )}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                openBook(book);
                                setReadingMode('listen');
                              }}
                              className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm p-3 rounded-2xl shadow-lg hover:bg-indigo-600 hover:text-white transition-all scale-0 group-hover:scale-100"
                            >
                              <Volume2 className="w-5 h-5" />
                            </button>
                          </div>
                          <div className="p-6">
                            <h4 className="font-bold text-gray-900 mb-1 line-clamp-1">{book.title}</h4>
                            <p className="text-sm text-gray-400">{t.by} {book.uid === user?.uid ? t.you : t.explorer}</p>
                          </div>
                        </motion.div>
                      ))
                  ) : (
                    <div className="col-span-full py-12 text-center text-gray-400 italic bg-white/50 rounded-3xl border-2 border-dashed border-gray-100">
                      {t.noRecentStories}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {state === 'import' && (
            <motion.div 
              key="import"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto py-20 px-6 text-center space-y-10"
            >
              <div className="space-y-4">
                <div className="bg-indigo-50 w-24 h-24 rounded-[40px] flex items-center justify-center mx-auto">
                  <FileText className="w-12 h-12 text-indigo-600" />
                </div>
                <h2 className="text-4xl font-black text-gray-900">{t.importStoryTitle}</h2>
                <p className="text-gray-500 text-lg">{t.importStorySubtitle}</p>
              </div>

              <div className="bg-white p-12 rounded-[40px] border-4 border-dashed border-indigo-100 hover:border-indigo-300 transition-colors relative group">
                <input 
                  type="file" 
                  accept=".pdf,.docx,.txt"
                  onChange={handleImport}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <div className="space-y-4">
                  <Upload className="w-12 h-12 text-indigo-400 mx-auto group-hover:scale-110 transition-transform" />
                  <div>
                    <p className="text-xl font-bold text-gray-900">{t.clickOrDrag}</p>
                    <p className="text-gray-400">{t.fileTypes}</p>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 p-6 rounded-3xl flex items-start gap-4 text-left">
                <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
                <p className="text-amber-800 text-sm">
                  <strong>Tip:</strong> {t.importTip}
                </p>
              </div>

              <button 
                onClick={() => setState('home')}
                className="text-gray-400 font-bold hover:text-gray-600"
              >
                {t.goBack}
              </button>
            </motion.div>
          )}

          {state === 'testing' && (
            <motion.div 
              key="testing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-6xl mx-auto px-6 py-12"
            >
              <div className="text-center space-y-4 mb-12">
                <h2 className="text-6xl font-serif font-bold text-gray-900">{t.doYouKnowWord}</h2>
                <p className="text-xl text-gray-500">{t.findReadingLevel}</p>
              </div>

              <div className="max-w-4xl mx-auto space-y-12">
                {/* Test Content */}
                <div className="space-y-10">
                  <div className="flex flex-wrap justify-center gap-3">
                    {['Word Explorer', 'Sentence Builder', 'Page Turner', 'Chapter Chaser', 'Plot Detective'].map((l, idx) => {
                      const translatedLevel = 
                        l === 'Word Explorer' ? t.wordExplorer :
                        l === 'Sentence Builder' ? t.sentenceBuilder :
                        l === 'Page Turner' ? t.pageTurner :
                        l === 'Chapter Chaser' ? t.chapterChaser :
                        l === 'Plot Detective' ? t.plotDetective : l;
                      return (
                        <div 
                          key={l}
                          className={cn(
                            "px-6 py-3 rounded-full text-sm font-bold border transition-all",
                            (level === l || results[idx]?.correct > 1)
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-lg" 
                            : "bg-white text-gray-400 border-gray-100"
                          )}
                        >
                          {translatedLevel} {(level === l || results[idx]?.correct > 1) && <CheckCircle2 className="w-4 h-4 inline-block ml-2" />}
                        </div>
                      );
                    })}
                  </div>

                  <motion.div 
                    key={wordSets[currentSetIndex]?.words[currentWordIndex]}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-indigo-50 p-20 rounded-[40px] border-2 border-indigo-100 text-center shadow-inner"
                  >
                    <span className="text-7xl font-black text-indigo-900 tracking-tight">
                      {wordSets[currentSetIndex]?.words[currentWordIndex]}
                    </span>
                  </motion.div>

                  <div className="space-y-6">
                    <div className="flex justify-between text-sm font-bold uppercase tracking-widest">
                      <span className="text-gray-400">{t.level}: {currentSetIndex + 1} / 5</span>
                      <div className="flex gap-4">
                        <span className="text-emerald-500">{results[currentSetIndex]?.correct}/3 {t.correct}</span>
                        <span className="text-rose-400">{results[currentSetIndex]?.missed}/3 {t.missed}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <button 
                        onClick={() => handleWordResponse(false)}
                        className="bg-white border-2 border-gray-100 hover:border-gray-200 text-gray-700 py-8 rounded-3xl text-2xl font-bold transition-all"
                      >
                        {t.stillLearning}
                      </button>
                      <button 
                        onClick={() => handleWordResponse(true)}
                        className="bg-[#2D3E50] hover:bg-[#1A2A3A] text-white py-8 rounded-3xl text-2xl font-bold transition-all shadow-xl"
                      >
                        {t.iKnowIt}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <button 
                      onClick={() => setState('home')}
                      className="flex items-center gap-2 text-gray-400 font-bold hover:text-gray-600"
                    >
                      <ChevronLeft className="w-5 h-5" /> {t.back}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ... Other states (my-books, progress, welcome, config, reading, loading) ... */}
          {/* I will keep the existing implementations for these but wrap them in the new layout */}
          
          {state === 'my-books' && (
            <motion.div 
              key="my-books"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="min-h-[calc(100vh-73px)] bg-[#C084FC]/10"
            >
              <div className="max-w-7xl mx-auto px-6 py-12">
                <div className="flex justify-between items-start mb-12">
                  <div className="space-y-6">
                    <h2 className="text-4xl font-serif font-bold text-gray-900">{t.myBooks}</h2>
                    <div className="flex gap-2 bg-white/50 p-1.5 rounded-2xl w-fit backdrop-blur-sm">
                      <button className="bg-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-sm text-indigo-600">{t.myStories} ({myBooks.length})</button>
                      <button className="px-6 py-2.5 rounded-xl font-bold text-sm text-gray-500 hover:bg-white/30 transition-colors">{t.importedBooks}</button>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      resetStoryConfig();
                      level ? setState('re-test-ask') : setState('welcome');
                    }}
                    className="bg-[#2D3E50] hover:bg-[#1A2A3A] text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-2 shadow-xl"
                  >
                    <Plus className="w-5 h-5" />
                    {t.createNewStory}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-8">
                  {myBooks.map((book, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => openBook(book)}
                      className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden cursor-pointer hover:shadow-xl transition-all group"
                    >
                      <div className="relative aspect-[3/4] overflow-hidden bg-gray-50">
                        {book.pages[0].imageUrl ? (
                          <img 
                            src={book.pages[0].imageUrl} 
                            alt={book.title} 
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-200">
                            <ImageIcon className="w-12 h-12" />
                          </div>
                        )}
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            openBook(book);
                            setReadingMode('listen');
                          }}
                          className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm p-3 rounded-2xl shadow-lg hover:bg-indigo-600 hover:text-white transition-all scale-0 group-hover:scale-100"
                        >
                          <Volume2 className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="p-6">
                        <h4 className="font-bold text-gray-900 mb-1 line-clamp-1">{book.title}</h4>
                        <p className="text-sm text-gray-400">{book.isImported ? t.imported : translateLevel(book.level || level)}</p>
                      </div>
                    </motion.div>
                  ))}
                  {!user ? (
                    <div className="col-span-full py-32 text-center space-y-8 bg-white/50 rounded-[40px] border-2 border-dashed border-indigo-100">
                      <div className="bg-indigo-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto">
                        <Lock className="w-12 h-12 text-indigo-600" />
                      </div>
                      <div className="space-y-4 max-w-md mx-auto">
                        <h3 className="text-2xl font-bold text-gray-900">{t.signInToSeeLibrary}</h3>
                        <p className="text-gray-500">{t.storiesSavedToAccount}</p>
                        <button 
                          onClick={() => {
                            setAuthMode('login');
                            setState('auth');
                          }}
                          className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
                        >
                          {t.logIn} / {t.signUp}
                        </button>
                      </div>
                    </div>
                  ) : myBooks.length === 0 && (
                    <div className="col-span-full py-32 text-center space-y-6">
                      <div className="bg-white/50 w-24 h-24 rounded-full flex items-center justify-center mx-auto">
                        <Library className="w-12 h-12 text-gray-300" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-gray-500 text-xl font-medium">{t.noStoriesYet}</p>
                        <p className="text-gray-400">{t.startByCreating}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {state === 'explore' && (
            <motion.div 
              key="explore"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="min-h-[calc(100vh-73px)] bg-indigo-50/30"
            >
              <div className="max-w-7xl mx-auto px-6 py-12">
                <div className="flex justify-between items-start mb-12">
                  <div className="space-y-4">
                    <h2 className="text-4xl font-serif font-bold text-gray-900">{t.exploreStories}</h2>
                    <p className="text-gray-500 text-lg">{t.discoverMagical}</p>
                  </div>
                </div>

                <div className="space-y-16">
                  {(() => {
                    // Group books by fixed categories
                    const grouped = allBooks.reduce((acc, book) => {
                      const categoryKey = categorizeBook(book.subject || 'General');
                      if (!acc[categoryKey]) acc[categoryKey] = [];
                      acc[categoryKey].push(book);
                      return acc;
                    }, {} as Record<string, Story[]>);

                    // Sort categories by book count and pick top 4
                    const sortedCategories = (Object.entries(grouped) as [string, Story[]][])
                      .sort((a, b) => b[1].length - a[1].length)
                      .slice(0, 4);

                    if (sortedCategories.length === 0) {
                      return (
                        <div className="py-32 text-center space-y-6">
                          <div className="bg-white/50 w-24 h-24 rounded-full flex items-center justify-center mx-auto">
                            <Library className="w-12 h-12 text-gray-300" />
                          </div>
                          <p className="text-gray-500 text-xl font-medium">{t.noStoriesYet}</p>
                        </div>
                      );
                    }

                    return sortedCategories.map(([categoryKey, books]) => {
                      const isExpanded = expandedCategories.has(categoryKey);
                      const displayedBooks = isExpanded ? books : books.slice(0, 3);

                      return (
                        <div key={categoryKey} className="space-y-8">
                          <div className="flex items-center gap-4">
                            <div className="h-px bg-gray-200 flex-1" />
                            <h3 className="text-2xl font-black text-indigo-900 uppercase tracking-widest px-4">
                              {translateSubject(categoryKey)}
                            </h3>
                            <div className="h-px bg-gray-200 flex-1" />
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-8">
                            {displayedBooks.map((book, i) => (
                              <motion.div 
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05 }}
                                onClick={() => openBook(book)}
                                className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden cursor-pointer hover:shadow-xl transition-all group"
                              >
                                <div className="aspect-[3/4] overflow-hidden bg-gray-50">
                                  {book.pages[0].imageUrl ? (
                                    <img 
                                      src={book.pages[0].imageUrl} 
                                      alt={book.title} 
                                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-200">
                                      <ImageIcon className="w-12 h-12" />
                                    </div>
                                  )}
                                </div>
                                <div className="p-6">
                                  <h4 className="font-bold text-gray-900 mb-1 line-clamp-1">{book.title}</h4>
                                  <div className="flex justify-between items-center">
                                    <p className="text-sm text-gray-400">{t.by} {book.uid === user?.uid ? t.you : t.explorer}</p>
                                    <p className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">{translateLevel(book.level || 'Word Explorer')}</p>
                                  </div>
                                </div>
                              </motion.div>
                            ))}
                          </div>

                          {books.length > 3 && (
                            <div className="flex justify-center mt-8">
                              <button
                                onClick={() => {
                                  const newExpanded = new Set(expandedCategories);
                                  if (isExpanded) {
                                    newExpanded.delete(categoryKey);
                                  } else {
                                    newExpanded.add(categoryKey);
                                  }
                                  setExpandedCategories(newExpanded);
                                }}
                                className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-indigo-100 text-indigo-600 font-bold rounded-2xl hover:bg-indigo-50 transition-colors"
                              >
                                {isExpanded ? t.back : t.viewAll}
                                <ChevronDown className={clsx("w-5 h-5 transition-transform", isExpanded && "rotate-180")} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                  {allBooks.length === 0 && (
                    <div className="py-32 text-center space-y-6">
                      <div className="bg-white/50 w-24 h-24 rounded-full flex items-center justify-center mx-auto">
                        <Sparkles className="w-12 h-12 text-gray-300" />
                      </div>
                      <p className="text-gray-500 text-xl font-medium">{t.noStoriesYet}</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {state === 'progress' && (
            <motion.div 
              key="progress"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-3xl mx-auto px-6 py-12 space-y-12"
            >
              {!user ? (
                <div className="py-32 text-center space-y-8 bg-white p-12 rounded-[40px] border border-gray-100 shadow-sm">
                  <div className="bg-indigo-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto">
                    <BarChart3 className="w-12 h-12 text-indigo-600" />
                  </div>
                  <div className="space-y-4 max-w-md mx-auto">
                    <h3 className="text-3xl font-bold text-gray-900">{t.trackProgress}</h3>
                    <p className="text-gray-500 text-lg">{t.signInToSave}</p>
                    <button 
                      onClick={() => {
                        setAuthMode('login');
                        setState('auth');
                      }}
                      className="bg-indigo-600 text-white px-10 py-5 rounded-2xl font-bold text-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
                    >
                      {t.logIn} / {t.signUp}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h2 className="text-4xl font-serif font-bold text-gray-900">
                      {showWordList ? t.myWordList : t.yourProgress}
                    </h2>
                    {showWordList && (
                      <button 
                        onClick={() => setShowWordList(false)}
                        className="text-indigo-600 font-bold hover:underline"
                      >
                        {t.backToOverview}
                      </button>
                    )}
                  </div>

                  <AnimatePresence mode="wait">
                    {!showWordList ? (
                      <motion.div 
                        key="overview"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="space-y-8"
                      >
                    {/* Daily Stamps */}
                    <div className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm space-y-6">
                      <div className="flex items-center gap-3">
                        <Trophy className="w-8 h-8 text-yellow-500" />
                        <h3 className="text-2xl font-bold text-gray-900">{t.dailyStamps}</h3>
                      </div>
                      <p className="text-gray-500 text-lg">{t.finishOneBook}</p>
                      <div className="grid grid-cols-7 gap-4">
                        {[...Array(7)].map((_, i) => (
                          <div 
                            key={i} 
                            className={cn(
                              "aspect-square rounded-2xl flex items-center justify-center transition-all duration-500",
                              i < dailyStamps 
                                ? "bg-yellow-100 border-2 border-yellow-400 text-yellow-600 scale-110 shadow-lg shadow-yellow-100" 
                                : "bg-gray-50 border-2 border-dashed border-gray-100 text-gray-200"
                            )}
                          >
                            <Zap className={cn("w-6 h-6", i < dailyStamps && "fill-current")} />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Reading Level */}
                    <div className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm space-y-8">
                      <h3 className="text-2xl font-bold text-gray-900">{t.myReadingLevel}</h3>
                      <div className="flex items-center gap-6">
                        <div className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold text-xl shadow-lg shadow-indigo-100">
                          {translateLevel(level)}
                        </div>
                        <p className="text-gray-500 text-lg">{t.storiesMatched}</p>
                      </div>
                      <button 
                        onClick={startTest}
                        className="text-indigo-600 font-bold text-lg hover:underline flex items-center gap-2"
                      >
                        {t.wantToTest} <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Word List Entry */}
                    <div 
                      onClick={() => setShowWordList(true)}
                      className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-all group"
                    >
                      <div className="space-y-2">
                        <h3 className="text-2xl font-bold text-gray-900">{t.myWordList}</h3>
                        <p className="text-gray-500 text-lg">{myWordList.length} {t.wordsCollected}</p>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-2xl group-hover:bg-indigo-50 transition-colors">
                        <ChevronRight className="w-8 h-8 text-gray-400 group-hover:text-indigo-600" />
                      </div>
                    </div>

                    {/* Streak */}
                    <div className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm space-y-6">
                      <h3 className="text-2xl font-bold text-gray-900">{t.currentStreak}</h3>
                      <div className="flex items-baseline gap-3">
                        <span className="text-8xl font-black text-indigo-600">{currentStreak}</span>
                        <span className="text-3xl font-bold text-indigo-600">{t.days}</span>
                      </div>
                      <p className="text-gray-500 text-lg">{t.completeNewBook}</p>
                    </div>

                    {/* Badges */}
                    <div className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm space-y-8">
                      <div className="flex items-center gap-3">
                        <Award className="w-8 h-8 text-indigo-600" />
                        <h3 className="text-2xl font-bold text-gray-900">{t.badges}</h3>
                      </div>
                      <div className="grid gap-6">
                        {[3, 5, 10].map(days => (
                          <div 
                            key={days}
                            className={cn(
                              "flex items-center gap-6 p-6 rounded-3xl border-2 transition-all",
                              currentStreak >= days 
                                ? "bg-indigo-50 border-indigo-200" 
                                : "bg-gray-50 border-gray-100 opacity-60"
                            )}
                          >
                            <div className={cn(
                              "w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg",
                              currentStreak >= days ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-400"
                            )}>
                              <Trophy className="w-8 h-8" />
                            </div>
                            <div className="space-y-1">
                              <h4 className="text-xl font-bold text-gray-900">
                                {t.dayReaderBadge.replace('{days}', days.toString())}
                              </h4>
                              <p className="text-gray-500">
                                {t.finishNewBookOnXDays.replace('{days}', days.toString())}
                              </p>
                              <p className="text-sm font-bold text-indigo-600">
                                {t.currentStreakLabel.replace('{streak}', currentStreak.toString())}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="word-list"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-8"
                  >
                    {/* Summary Cards */}
                    <div className="grid grid-cols-3 gap-6">
                      <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm text-center space-y-1">
                        <div className="text-5xl font-bold text-gray-900">{myWordList.length}</div>
                        <div className="text-gray-400 font-medium">{t.totalWords}</div>
                      </div>
                      <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm text-center space-y-1">
                        <div className="text-5xl font-bold text-orange-400">
                          {myWordList.filter(w => (w.status || 'learning') === 'learning').length}
                        </div>
                        <div className="text-gray-400 font-medium">{t.stillLearning}</div>
                      </div>
                      <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm text-center space-y-1">
                        <div className="text-5xl font-bold text-green-500">
                          {myWordList.filter(w => w.status === 'learned').length}
                        </div>
                        <div className="text-gray-400 font-medium">{t.learned}</div>
                      </div>
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex gap-4">
                      {(['learning', 'learned', 'all'] as const).map(filter => (
                        <button
                          key={filter}
                          onClick={() => setWordListFilter(filter)}
                          className={cn(
                            "px-8 py-3 rounded-2xl font-bold transition-all text-lg",
                            wordListFilter === filter 
                              ? "bg-[#2d3748] text-white shadow-lg" 
                              : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                          )}
                        >
                          {t[filter]} ({
                            filter === 'all' 
                              ? myWordList.length 
                              : myWordList.filter(w => (w.status || 'learning') === filter).length
                          })
                        </button>
                      ))}
                    </div>

                    {myWordList.length === 0 ? (
                      <div className="bg-white p-20 rounded-[40px] text-center space-y-4">
                        <div className="bg-indigo-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                          <Plus className="w-10 h-10 text-indigo-300" />
                        </div>
                        <p className="text-gray-500 text-xl font-medium">{t.wordListEmpty}</p>
                        <p className="text-gray-400">{t.readStoriesToCollect}</p>
                      </div>
                    ) : (
                      <div className="grid gap-6">
                        {myWordList
                          .filter(w => wordListFilter === 'all' || (w.status || 'learning') === wordListFilter)
                          .map((item, idx) => (
                          <div key={idx} className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm space-y-4 hover:shadow-md transition-shadow relative group">
                            <div className="flex justify-between items-start">
                              <h4 className="text-3xl font-bold text-gray-900 font-serif">{item.word}</h4>
                              <div className="flex gap-2">
                                {(item.status || 'learning') === 'learning' && (
                                  <button 
                                    onClick={() => markAsLearned(item.word)}
                                    className="px-6 py-2 bg-white border border-gray-200 text-gray-600 rounded-2xl font-medium hover:border-indigo-600 hover:text-indigo-600 transition-all text-sm"
                                  >
                                    {t.learnedIt}
                                  </button>
                                )}
                                <button 
                                  onClick={() => {
                                    const utterance = new SpeechSynthesisUtterance(item.word);
                                    window.speechSynthesis.speak(utterance);
                                  }}
                                  className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"
                                >
                                  <Volume2 className="w-5 h-5" />
                                </button>
                              </div>
                            </div>
                            
                            <div className="space-y-4">
                              <p className="text-xl text-gray-500 leading-relaxed">
                                {item.explanation}
                              </p>
                              <p className="text-xl italic text-gray-400">
                                "{item.exampleSentence}"
                              </p>
                            </div>

                            <div className="pt-2 text-sm text-gray-300 font-medium">
                              {t.addedOn} {item.addedAt || new Date().toISOString().split('T')[0]}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
                </>
              )}
            </motion.div>
          )}

          {state === 're-test-ask' && (
            <motion.div 
              key="re-test-ask"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-2xl mx-auto text-center space-y-12 py-32 px-6"
            >
              <div className="relative inline-block">
                <div className="bg-white p-10 rounded-[50px] shadow-2xl shadow-indigo-100 border-2 border-indigo-50">
                  <RefreshCw className="w-24 h-24 text-indigo-400 animate-spin-slow" />
                </div>
                <Sparkles className="absolute -top-6 -right-6 w-16 h-16 text-yellow-400 animate-pulse" />
              </div>
              
              <div className="space-y-6">
                <h2 className="text-5xl font-black text-gray-900 leading-tight">{t.checkYourLevel}</h2>
                <p className="text-xl text-gray-600 max-w-lg mx-auto">
                  {t.currentLevelIs} <span className="text-indigo-600 font-bold">{translateLevel(level)}</span>. 
                  {t.wouldYouLikeTest}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                <button 
                  onClick={startTest}
                  className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-5 rounded-[28px] text-xl font-bold transition-all hover:scale-105 active:scale-95 shadow-xl shadow-indigo-100 flex items-center justify-center gap-3"
                >
                  <RefreshCw className="w-6 h-6" />
                  {t.testAgain}
                </button>
                <button 
                  onClick={() => setState('config')}
                  className="w-full sm:w-auto bg-white border-2 border-gray-100 hover:border-indigo-200 text-gray-700 px-10 py-5 rounded-[28px] text-xl font-bold transition-all hover:scale-105 active:scale-95 shadow-lg flex items-center justify-center gap-3"
                >
                  <Sparkles className="w-6 h-6 text-yellow-500" />
                  {t.skipToStory}
                </button>
              </div>

              <button 
                onClick={() => setState('home')}
                className="text-gray-400 font-medium hover:text-gray-600 transition-colors"
              >
                {t.maybeLater}
              </button>
            </motion.div>
          )}

          {state === 'welcome' && (
            <motion.div 
              key="welcome"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto text-center space-y-10 py-24"
            >
              <div className="relative inline-block">
                <motion.div 
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ repeat: Infinity, duration: 4 }}
                  className="bg-white p-10 rounded-[50px] shadow-2xl shadow-indigo-100 border-2 border-indigo-50"
                >
                  <Wand2 className="w-28 h-28 text-indigo-400" />
                </motion.div>
                <Sparkles className="absolute -top-6 -right-6 w-16 h-16 text-yellow-400 animate-pulse" />
              </div>
              <div className="space-y-6">
                <h2 className="text-6xl font-black text-gray-900 leading-tight">{t.readyAdventure}</h2>
                <p className="text-2xl text-gray-600 max-w-lg mx-auto">{t.firstSeeWords}</p>
              </div>
              <button 
                onClick={startTest}
                className="group relative bg-indigo-600 hover:bg-indigo-700 text-white px-12 py-6 rounded-[32px] text-2xl font-bold transition-all hover:scale-105 active:scale-95 shadow-2xl shadow-indigo-200"
              >
                {t.startMyQuest}
                <ChevronRight className="inline-block ml-3 group-hover:translate-x-2 transition-transform" />
              </button>
            </motion.div>
          )}

          {state === 'loading' && (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-40 space-y-8"
            >
              <div className="relative">
                <Loader2 className="w-20 h-20 text-indigo-400 animate-spin" />
                <Sparkles className="absolute top-0 right-0 w-8 h-8 text-yellow-400 animate-bounce" />
              </div>
              <p className="text-3xl font-bold text-indigo-800 animate-pulse">{loadingMessage}</p>
            </motion.div>
          )}

          {state === 'test-result' && (
            <motion.div 
              key="test-result"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="max-w-2xl mx-auto text-center py-24 space-y-12"
            >
              <div className="space-y-6">
                <div className="inline-block p-6 bg-indigo-100 rounded-[40px] shadow-xl shadow-indigo-50">
                  <Trophy className="w-24 h-24 text-indigo-600" />
                </div>
                <h2 className="text-5xl font-black text-gray-900">{t.questComplete}</h2>
                <p className="text-2xl text-gray-500">{t.brilliantExplorer}</p>
                {levelImproved && (
                  <div className="bg-green-50 border border-green-100 p-6 rounded-[32px] space-y-2 max-w-md mx-auto flex flex-col items-center">
                    <Sparkles className="w-8 h-8 text-green-600 mb-2" />
                    <p className="text-green-600 font-bold text-xl">{t.greatJob}</p>
                    <p className="text-green-500">{t.youHaveProgressed}</p>
                  </div>
                )}
                <div className="bg-indigo-600 text-white px-12 py-6 rounded-[32px] text-4xl font-black inline-block shadow-2xl shadow-indigo-200">
                  {translateLevel(level)}
                </div>
              </div>
              <button 
                onClick={() => {
                  setConfigStep(1);
                  setState('config');
                }}
                className="bg-[#2D3E50] hover:bg-[#1A2A3A] text-white px-12 py-6 rounded-[32px] text-2xl font-bold shadow-2xl shadow-gray-200 transition-all hover:scale-105 active:scale-95"
              >
                {t.letsMakeStory}
              </button>
            </motion.div>
          )}

          {state === 'config' && (
            <motion.div 
              key="config"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-4xl mx-auto px-6 py-16 space-y-12"
            >
              <div className="text-center space-y-4">
                <div className="flex justify-center gap-2 mb-6">
                  {[1, 2, 3].map(s => (
                    <div 
                      key={s} 
                      className={cn(
                        "w-12 h-2 rounded-full transition-all duration-500",
                        s <= configStep ? "bg-indigo-600 w-20" : "bg-gray-200"
                      )} 
                    />
                  ))}
                </div>
                <h2 className="text-5xl font-black text-gray-900">
                  {configStep === 1 && t.whoWhere}
                  {configStep === 2 && t.whatHappens}
                  {configStep === 3 && t.finalTouches}
                </h2>
                <p className="text-xl text-gray-500">
                  {configStep === 1 && t.pickHeroes}
                  {configStep === 2 && t.whatWillTheyDo}
                  {configStep === 3 && t.chooseQuality}
                </p>
              </div>

              <div className="bg-white p-10 rounded-[48px] shadow-sm border border-gray-100 space-y-10">
                {configStep === 1 && (
                  <div className="space-y-10">
                    <div className="space-y-6">
                      <div className="flex justify-between items-end">
                        <label className="text-lg font-black text-gray-900 uppercase tracking-widest">{t.whoAppears}</label>
                        <button onClick={() => refreshOptions('characters')} className="text-sm font-bold text-indigo-600 hover:underline flex items-center gap-1">
                          <Sparkles className="w-4 h-4" /> {t.refreshOptions}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {configOptions.characters.map((opt, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              const current = storyConfig.characters;
                              if (current.includes(opt.text)) {
                                setStoryConfig({...storyConfig, characters: current.filter(c => c !== opt.text)});
                              } else if (current.length < 2) {
                                setStoryConfig({...storyConfig, characters: [...current, opt.text]});
                              }
                            }}
                            className={cn(
                              "p-6 rounded-3xl border-2 transition-all text-left space-y-2 group",
                              storyConfig.characters.includes(opt.text)
                                ? "border-indigo-600 bg-indigo-50 shadow-lg shadow-indigo-100"
                                : "border-gray-100 hover:border-indigo-200 hover:bg-gray-50"
                            )}
                          >
                            <span className="text-4xl block group-hover:scale-110 transition-transform">{opt.emoji}</span>
                            <span className="font-bold text-gray-900 block">{opt.text}</span>
                          </button>
                        ))}
                        
                        {/* Custom Character Option */}
                        <div className={cn(
                          "p-6 rounded-3xl border-2 transition-all text-left space-y-3 group",
                          storyConfig.characters.some(c => !configOptionsPool.characters.some(g => g.text === c))
                            ? "border-indigo-600 bg-indigo-50 shadow-lg shadow-indigo-100"
                            : "border-gray-100 hover:border-indigo-200 hover:bg-gray-50"
                        )}>
                          <div className="flex items-center gap-2">
                            <span className="text-4xl block group-hover:scale-110 transition-transform">✨</span>
                            <span className="font-bold text-gray-900 block">{t.customCharacter}</span>
                          </div>
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              value={customCharacterInput}
                              onChange={(e) => setCustomCharacterInput(e.target.value)}
                              placeholder={t.characterName}
                              className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm focus:border-indigo-400 outline-none"
                            />
                            <button 
                              onClick={() => {
                                if (customCharacterInput.trim() && storyConfig.characters.length < 2) {
                                  setStoryConfig({
                                    ...storyConfig, 
                                    characters: [...storyConfig.characters, customCharacterInput.trim()]
                                  });
                                  setCustomCharacterInput('');
                                }
                              }}
                              disabled={!customCharacterInput.trim() || storyConfig.characters.length >= 2}
                              className="bg-indigo-600 text-white p-2 rounded-xl disabled:opacity-50"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                          {storyConfig.characters.filter(c => !configOptionsPool.characters.some(g => g.text === c)).map(c => (
                            <div key={c} className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-indigo-100 text-sm">
                              <span className="font-medium text-indigo-600 truncate mr-2">{c}</span>
                              <button 
                                onClick={() => setStoryConfig({...storyConfig, characters: storyConfig.characters.filter(char => char !== c)})}
                                className="text-gray-400 hover:text-rose-500"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Character Details */}
                    <div className="space-y-4 bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100">
                      <label className="text-sm font-black text-indigo-900 uppercase tracking-wider flex items-center gap-2">
                        <User className="w-4 h-4" /> {t.characterDetails}
                      </label>
                      <textarea 
                        value={storyConfig.characterDetails}
                        onChange={e => setStoryConfig({...storyConfig, characterDetails: e.target.value})}
                        placeholder={t.characterDetailsPlaceholder}
                        className="w-full px-4 py-3 rounded-2xl bg-white border border-indigo-100 text-sm focus:border-indigo-400 outline-none resize-none h-20 shadow-sm"
                      />
                    </div>

                    <div className="space-y-6">
                      <div className="flex justify-between items-end">
                        <label className="text-lg font-black text-gray-900 uppercase tracking-widest">{t.whereHappens}</label>
                        <button onClick={() => refreshOptions('locations')} className="text-sm font-bold text-indigo-600 hover:underline flex items-center gap-1">
                          <Sparkles className="w-4 h-4" /> {t.refreshOptions}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {configOptions.locations.map((opt, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              const current = storyConfig.locations;
                              if (current.includes(opt.text)) {
                                setStoryConfig({...storyConfig, locations: current.filter(l => l !== opt.text)});
                              } else if (current.length < 2) {
                                setStoryConfig({...storyConfig, locations: [...current, opt.text]});
                              }
                            }}
                            className={cn(
                              "p-6 rounded-3xl border-2 transition-all text-left space-y-2 group",
                              storyConfig.locations.includes(opt.text)
                                ? "border-indigo-600 bg-indigo-50 shadow-lg shadow-indigo-100"
                                : "border-gray-100 hover:border-indigo-200 hover:bg-gray-50"
                            )}
                          >
                            <span className="text-4xl block group-hover:scale-110 transition-transform">{opt.emoji}</span>
                            <span className="font-bold text-gray-900 block">{opt.text}</span>
                          </button>
                        ))}

                        {/* Custom Location Option */}
                        <div className={cn(
                          "p-6 rounded-3xl border-2 transition-all text-left space-y-3 group",
                          storyConfig.locations.some(l => !configOptionsPool.locations.some(g => g.text === l))
                            ? "border-indigo-600 bg-indigo-50 shadow-lg shadow-indigo-100"
                            : "border-gray-100 hover:border-indigo-200 hover:bg-gray-50"
                        )}>
                          <div className="flex items-center gap-2">
                            <span className="text-4xl block group-hover:scale-110 transition-transform">📍</span>
                            <span className="font-bold text-gray-900 block">{t.customLocation}</span>
                          </div>
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              value={customLocationInput}
                              onChange={(e) => setCustomLocationInput(e.target.value)}
                              placeholder={t.locationName}
                              className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm focus:border-indigo-400 outline-none"
                            />
                            <button 
                              onClick={() => {
                                if (customLocationInput.trim() && storyConfig.locations.length < 2) {
                                  setStoryConfig({
                                    ...storyConfig, 
                                    locations: [...storyConfig.locations, customLocationInput.trim()]
                                  });
                                  setCustomLocationInput('');
                                }
                              }}
                              disabled={!customLocationInput.trim() || storyConfig.locations.length >= 2}
                              className="bg-indigo-600 text-white p-2 rounded-xl disabled:opacity-50"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                          {storyConfig.locations.filter(l => !configOptionsPool.locations.some(g => g.text === l)).map(l => (
                            <div key={l} className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-indigo-100 text-sm">
                              <span className="font-medium text-indigo-600 truncate mr-2">{l}</span>
                              <button 
                                onClick={() => setStoryConfig({...storyConfig, locations: storyConfig.locations.filter(loc => loc !== l)})}
                                className="text-gray-400 hover:text-rose-500"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Location Details */}
                    <div className="space-y-4 bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100">
                      <label className="text-sm font-black text-indigo-900 uppercase tracking-wider flex items-center gap-2">
                        <ImageIcon className="w-4 h-4" /> {t.locationDetails}
                      </label>
                      <textarea 
                        value={storyConfig.locationDetails}
                        onChange={e => setStoryConfig({...storyConfig, locationDetails: e.target.value})}
                        placeholder={t.locationDetailsPlaceholder}
                        className="w-full px-4 py-3 rounded-2xl bg-white border border-indigo-100 text-sm focus:border-indigo-400 outline-none resize-none h-20 shadow-sm"
                      />
                    </div>
                  </div>
                )}

                {configStep === 2 && (
                  <div className="space-y-10">
                    <div className="space-y-6">
                      <label className="text-lg font-black text-gray-900 uppercase tracking-widest">{t.whatHappensInStory}</label>
                      <textarea 
                        value={storyConfig.activities}
                        onChange={e => setStoryConfig({...storyConfig, activities: e.target.value})}
                        placeholder={t.exampleActivities}
                        className="w-full p-8 rounded-[32px] bg-gray-50 border-2 border-transparent focus:border-indigo-400 focus:bg-white outline-none transition-all text-xl min-h-[150px] resize-none"
                      />
                      <p className="text-sm text-gray-400 italic">{t.leaveBlankSurprise}</p>
                    </div>

                    <div className="space-y-6">
                      <div className="flex justify-between items-end">
                        <label className="text-lg font-black text-gray-900 uppercase tracking-widest">{t.valuesToDeliver}</label>
                        <button onClick={() => refreshOptions('values')} className="text-sm font-bold text-indigo-600 hover:underline flex items-center gap-1">
                          <Sparkles className="w-4 h-4" /> {t.refreshOptions}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {configOptions.values.map((opt, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              const current = storyConfig.values;
                              if (current.includes(opt.text)) {
                                setStoryConfig({...storyConfig, values: current.filter(v => v !== opt.text)});
                              } else if (current.length < 2) {
                                setStoryConfig({...storyConfig, values: [...current, opt.text]});
                              }
                            }}
                            className={cn(
                              "p-6 rounded-3xl border-2 transition-all text-left space-y-2 group",
                              storyConfig.values.includes(opt.text)
                                ? "border-indigo-600 bg-indigo-50 shadow-lg shadow-indigo-100"
                                : "border-gray-100 hover:border-indigo-200 hover:bg-gray-50"
                            )}
                          >
                            <span className="text-4xl block group-hover:scale-110 transition-transform">{opt.emoji}</span>
                            <span className="font-bold text-gray-900 block">{opt.text}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {configStep === 3 && (
                  <div className="space-y-10">
                    <div className="space-y-6">
                      <label className="text-lg font-black text-gray-900 uppercase tracking-widest">{t.illustrationQuality}</label>
                      <div className="grid grid-cols-3 gap-4">
                        {(['1K', '2K', '4K'] as const).map(q => (
                          <button
                            key={q}
                            onClick={() => setStoryConfig({...storyConfig, imageSize: q})}
                            className={cn(
                              "p-8 rounded-3xl border-2 transition-all font-black text-2xl",
                              storyConfig.imageSize === q
                                ? "border-indigo-600 bg-indigo-50 text-indigo-600 shadow-lg shadow-indigo-100"
                                : "border-gray-100 text-gray-400 hover:bg-gray-50"
                            )}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-8 rounded-[32px] bg-indigo-50 border-2 border-indigo-100 space-y-4">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-6 h-6 text-indigo-600" />
                        <span className="text-lg font-bold text-indigo-900">{t.currentReadingLevel}: {translateLevel(level)}</span>
                      </div>
                      <p className="text-indigo-700/70">{t.storyMatchedSkills}</p>
                      <button 
                        onClick={startTest}
                        className="text-indigo-600 font-bold hover:underline flex items-center gap-1"
                      >
                        {t.notRightRetest} <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex gap-4 pt-6">
                  {configStep > 1 && (
                    <button 
                      onClick={() => setConfigStep(prev => prev - 1)}
                      className="flex-1 p-6 rounded-[32px] bg-gray-100 text-gray-600 font-bold text-xl hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
                    >
                      <ChevronLeft className="w-6 h-6" /> {t.back}
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      if (configStep < 3) {
                        setConfigStep(prev => prev + 1);
                      } else {
                        createStory();
                      }
                    }}
                    disabled={configStep === 1 && (storyConfig.characters.length === 0 || storyConfig.locations.length === 0)}
                    className={cn(
                      "flex-[2] p-6 rounded-[32px] font-bold text-xl transition-all flex items-center justify-center gap-2 shadow-xl shadow-indigo-100",
                      (configStep === 1 && (storyConfig.characters.length === 0 || storyConfig.locations.length === 0))
                        ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                        : "bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-[1.02] active:scale-[0.98]"
                    )}
                  >
                    {configStep === 3 ? t.createMyStory : t.nextStep}
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {state === 'reading-choice' && story && (
            <motion.div 
              key="reading-choice"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="max-w-4xl mx-auto py-24 px-6 text-center space-y-12"
            >
              <div className="space-y-6">
                <div className="inline-block p-6 bg-indigo-100 rounded-[40px] shadow-xl shadow-indigo-50">
                  <BookOpen className="w-24 h-24 text-indigo-600" />
                </div>
                <h2 className="text-5xl font-black text-gray-900">{t.storyReady}</h2>
                <p className="text-2xl text-gray-500">{t.howExperience}</p>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                <button 
                  onClick={() => {
                    setReadingMode('read');
                    setState('reading');
                  }}
                  className="bg-white border-4 border-indigo-100 hover:border-indigo-600 p-10 rounded-[48px] space-y-6 transition-all hover:scale-105 group"
                >
                  <div className="group-hover:scale-110 transition-transform flex justify-center">
                    <BookOpen className="w-16 h-16 text-indigo-600" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-3xl font-black text-gray-900">{t.wantToReadAlong}</h3>
                    <p className="text-gray-500">{t.readAtPace}</p>
                  </div>
                </button>

                <button 
                  onClick={() => {
                    setReadingMode('listen');
                    setState('reading');
                  }}
                  className="bg-white border-4 border-indigo-100 hover:border-indigo-600 p-10 rounded-[48px] space-y-6 transition-all hover:scale-105 group"
                >
                  <div className="group-hover:scale-110 transition-transform flex justify-center">
                    <Volume2 className="w-16 h-16 text-indigo-600" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-3xl font-black text-gray-900">{t.wantToListen}</h3>
                    <p className="text-gray-500">{t.sitBackListen}</p>
                  </div>
                </button>
              </div>

              <button 
                onClick={() => setState('home')}
                className="text-gray-400 font-bold hover:text-gray-600"
              >
                {t.maybeLater}
              </button>
            </motion.div>
          )}

          {state === 'reading' && story && (
            <motion.div 
              key="reading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-7xl mx-auto px-6 py-12 space-y-10"
            >
              <div className="flex justify-between items-center bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm relative z-10">
                <div className="flex items-center gap-6">
                  <button 
                    onClick={() => setState('my-books')}
                    className="p-3 hover:bg-gray-50 rounded-2xl text-gray-400 transition-colors"
                  >
                    <ChevronLeft className="w-8 h-8" />
                  </button>
                  <h3 className="text-3xl font-black text-gray-900">{story.title}</h3>
                </div>
                <div className="text-indigo-600 font-bold bg-indigo-50 px-6 py-3 rounded-2xl text-lg">{t.page} {currentPage + 1} {t.of} {story.pages.length}</div>
              </div>

              <div className="relative overflow-hidden min-h-[700px] perspective-[2000px]">
                <AnimatePresence mode="popLayout" custom={direction}>
                  <motion.div 
                    key={currentPage}
                    custom={direction}
                    variants={pageVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="grid lg:grid-cols-2 gap-16 w-full"
                  >
                    {/* Illustration */}
                    <div className="relative aspect-square bg-white rounded-[60px] shadow-2xl shadow-indigo-100 border-8 border-white overflow-hidden group">
                      {story.pages[currentPage].imageUrl ? (
                        <motion.img 
                          key={story.pages[currentPage].imageUrl}
                          initial={{ opacity: 0, scale: 1.1 }}
                          animate={{ opacity: 1, scale: 1 }}
                          src={story.pages[currentPage].imageUrl} 
                          alt={t.storyIllustration}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center space-y-6 text-indigo-200">
                          <ImageIcon className="w-24 h-24 animate-pulse" />
                          <p className="text-xl font-bold">{t.drawingIllustration}</p>
                        </div>
                      )}
                      {isGeneratingPage && (
                        <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] flex items-center justify-center">
                          <Loader2 className="w-16 h-16 text-indigo-500 animate-spin" />
                        </div>
                      )}
                    </div>

                    {/* Text Content */}
                    <div className="flex flex-col justify-center space-y-12">
                      <div className="space-y-10">
                        <div className="relative">
                          <div className="text-4xl font-bold text-gray-900 leading-[1.4] flex flex-wrap gap-x-3 gap-y-2">
                            {story.pages[currentPage].text.split(/\s+/).filter(w => w.length > 0).map((word, i) => (
                              <span 
                                key={i} 
                                onClick={() => handleWordClick(word)}
                                className={clsx(
                                  "cursor-pointer transition-all underline-offset-4",
                                  readingWordIndex === i ? "text-indigo-600 underline decoration-indigo-600 scale-110" : "hover:text-indigo-600 hover:underline decoration-indigo-300"
                                )}
                              >
                                {word}
                              </span>
                            ))}
                          </div>
                          {!story.pages[currentPage].audioData ? (
                            <div className="absolute -right-6 -top-6 bg-gray-100 text-gray-400 p-4 rounded-[24px] shadow-sm animate-pulse">
                              <Loader2 className="w-6 h-6 animate-spin" />
                            </div>
                          ) : (
                            <button 
                              onClick={() => {
                                if (readingWordIndex !== null) {
                                  stopAudio();
                                } else {
                                  playAudio(story.pages[currentPage].audioData!, story.pages[currentPage].text);
                                }
                              }}
                              className="absolute -right-6 -top-6 bg-indigo-600 text-white p-4 rounded-[24px] shadow-2xl hover:scale-110 active:scale-95 transition-all"
                            >
                              {readingWordIndex !== null ? <Square className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                            </button>
                          )}
                        </div>

                        {/* Translation (Subtitles) */}
                        {story.pages[currentPage].translation && (
                          <div className="p-6 bg-indigo-50/50 rounded-3xl border border-indigo-100">
                            <p className="text-xl text-indigo-900/70 italic leading-relaxed">
                              {story.pages[currentPage].translation}
                            </p>
                          </div>
                        )}

                        {/* Questions & Annotations */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {story.pages[currentPage].questions && story.pages[currentPage].questions.length > 0 && (
                            <div className="space-y-4">
                              <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <MessageCircle className="w-4 h-4" /> {t.questions}
                              </h4>
                              <div className="space-y-3">
                                {story.pages[currentPage].questions.map((q, i) => (
                                  <div key={i} className="p-4 bg-white border border-gray-100 rounded-2xl text-gray-700 text-sm shadow-sm">
                                    {q}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {story.pages[currentPage].annotations && story.pages[currentPage].annotations.length > 0 && (
                            <div className="space-y-4">
                              <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Sparkles className="w-4 h-4" /> {t.annotations}
                              </h4>
                              <div className="space-y-3">
                                {story.pages[currentPage].annotations.map((a, i) => (
                                  <button 
                                    key={i} 
                                    onClick={() => handleWordClick(a.word)}
                                    className="w-full text-left p-4 bg-white border border-gray-100 rounded-2xl hover:border-indigo-200 transition-all shadow-sm group"
                                  >
                                    <span className="font-bold text-indigo-600 group-hover:underline">{a.word}</span>
                                    <p className="text-xs text-gray-500 mt-1 line-clamp-1">{a.explanation}</p>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="h-px bg-gray-100 w-full" />
                      </div>

                      <div className="flex gap-6 pt-10">
                        <button 
                          disabled={currentPage === 0}
                          onClick={() => {
                            stopAudio();
                            const newPage = currentPage - 1;
                            setDirection(-1);
                            setCurrentPage(newPage);
                            generatePageAssets(newPage, story);
                          }}
                          className="flex-1 bg-white border-2 border-gray-100 text-gray-500 py-6 rounded-[32px] font-bold text-xl disabled:opacity-30 flex items-center justify-center gap-3 hover:bg-gray-50 transition-colors"
                        >
                          <ChevronLeft className="w-6 h-6" /> {t.previous}
                        </button>
                          <button 
                            onClick={() => {
                              stopAudio();
                              if (currentPage === story.pages.length - 1) {
                                finishStory();
                              } else {
                                const newPage = currentPage + 1;
                                setDirection(1);
                                setCurrentPage(newPage);
                                generatePageAssets(newPage, story);
                              }
                            }}
                            className="flex-1 bg-indigo-600 text-white py-6 rounded-[32px] font-bold text-xl disabled:opacity-30 flex items-center justify-center gap-3 hover:bg-indigo-700 transition-all shadow-2xl shadow-indigo-100"
                          >
                            {currentPage === story.pages.length - 1 ? t.finishStory : t.next} <ChevronRight className="w-6 h-6" />
                          </button>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Word Detail Modal */}
        <AnimatePresence>
          {selectedWord && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedWord(null)}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-white w-full max-w-lg rounded-[48px] shadow-2xl overflow-hidden"
              >
                <div className="p-10 space-y-8">
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <h4 className="text-5xl font-black text-indigo-900 tracking-tight">{selectedWord}</h4>
                      {isWordLoading ? (
                        <div className="flex items-center gap-2 text-indigo-400">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm font-bold uppercase tracking-widest">{t.loading}...</span>
                        </div>
                      ) : (
                        <div className="text-xl font-medium text-gray-500 leading-relaxed">{wordDetails?.explanation}</div>
                      )}
                    </div>
                    <button 
                      onClick={() => setSelectedWord(null)}
                      className="p-3 hover:bg-gray-100 rounded-2xl text-gray-400 transition-colors"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>

                  {!isWordLoading && wordDetails && (
                    <div className="space-y-8">
                      <div className="space-y-4 bg-gray-50 p-6 rounded-[32px] border border-gray-100">
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t.exampleSentence}</div>
                        <div className="space-y-2">
                          <p className="text-xl font-bold text-gray-800 leading-relaxed">"{wordDetails.exampleSentence}"</p>
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <button 
                          onClick={() => {
                            const audio = new Audio(`https://api.dictionaryapi.dev/media/pronunciations/en/${selectedWord.toLowerCase()}-us.mp3`);
                            audio.play().catch(() => {
                              const utterance = new SpeechSynthesisUtterance(selectedWord);
                              window.speechSynthesis.speak(utterance);
                            });
                          }}
                          className="flex-1 bg-white border-2 border-gray-100 hover:border-indigo-200 text-gray-700 py-5 rounded-3xl font-bold flex items-center justify-center gap-3 transition-all"
                        >
                          <Volume2 className="w-6 h-6 text-indigo-500" />
                          {t.listen}
                        </button>
                        <button 
                          onClick={addToWordList}
                          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-5 rounded-3xl font-bold flex items-center justify-center gap-3 transition-all shadow-xl shadow-indigo-100"
                        >
                          <Plus className="w-6 h-6" />
                          {t.addToList}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>

      {/* Chatbot */}
      <div className="fixed bottom-8 right-8 z-50">
        <AnimatePresence>
          {isChatOpen && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              className="bg-white w-96 h-[550px] rounded-[40px] shadow-2xl border border-gray-100 flex flex-col overflow-hidden mb-6"
            >
              <div className="bg-indigo-600 p-6 flex justify-between items-center text-white">
                <div className="flex items-center gap-3">
                  <MessageCircle className="w-6 h-6" />
                  <span className="font-bold text-lg">{t.storyHelper}</span>
                </div>
                <button onClick={() => setIsChatOpen(false)} className="hover:bg-white/20 p-2 rounded-xl transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
                {chatMessages.length === 0 && (
                  <div className="text-center space-y-4 mt-20">
                    <div className="bg-indigo-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                      <Sparkles className="w-8 h-8 text-indigo-400" />
                    </div>
                    <p className="text-gray-400 font-medium">{t.askMeAnything}</p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[85%] p-4 rounded-[24px] text-base leading-relaxed",
                      msg.role === 'user' 
                      ? "bg-indigo-600 text-white rounded-tr-none" 
                      : "bg-gray-50 text-gray-900 rounded-tl-none"
                    )}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-50 p-4 rounded-[24px] rounded-tl-none">
                      <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-gray-100 bg-gray-50/30">
                <div className="relative">
                  <input 
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                    placeholder={t.askQuestion}
                    className="w-full p-4 pr-14 rounded-2xl border border-gray-100 focus:border-indigo-400 outline-none text-base shadow-sm"
                  />
                  <button 
                    onClick={handleSendMessage}
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-indigo-600 text-white p-2 rounded-xl hover:bg-indigo-700 transition-colors"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        <motion.button 
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="bg-indigo-600 text-white p-6 rounded-[32px] shadow-2xl shadow-indigo-200 flex items-center justify-center"
        >
          {isChatOpen ? <X className="w-10 h-10" /> : <MessageCircle className="w-10 h-10" />}
        </motion.button>
      </div>
    </div>
  </ErrorBoundary>
);
}
