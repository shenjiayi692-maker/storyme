/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  Sparkles, 
  ChevronRight, 
  ChevronLeft, 
  Volume2, 
  MessageCircle, 
  X, 
  Send,
  Loader2,
  Trophy,
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
  AlertCircle
} from 'lucide-react';
import { 
  generateLevelWords, 
  generateStory, 
  generateImage, 
  generateSpeech, 
  chatWithGemini,
  processImportedStory,
  Story,
  WordSet
} from './services/gemini';
import { parsePdf, parseDocx, truncateText } from './services/fileParser';
import { auth, db } from './firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  sendEmailVerification,
  updateProfile,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs,
  orderBy,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type AppState = 'home' | 'my-books' | 'progress' | 'welcome' | 'testing' | 'config' | 'reading' | 'loading' | 'import' | 'auth';
type AuthMode = 'login' | 'signup' | 'verify';

export default function App() {
  const [state, setState] = useState<AppState>('home');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [wordSets, setWordSets] = useState<WordSet[]>([]);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [results, setResults] = useState<{set: string, correct: number, missed: number}[]>([]);
  
  const [level, setLevel] = useState('');
  
  const [storyConfig, setStoryConfig] = useState({
    type: 'Adventure',
    location: 'A magical forest',
    activities: '',
    values: 'Kindness and bravery',
    imageSize: '1K' as '1K' | '2K' | '4K'
  });

  const [story, setStory] = useState<Story | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [isGeneratingPage, setIsGeneratingPage] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  const [myBooks, setMyBooks] = useState<Story[]>([]);

  // Chatbot state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'ai', text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const docRef = doc(db, 'users', u.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserProfile(data);
          setLevel(data.readingLevel || '');
        }
        fetchBooks(u.uid);
      } else {
        setUserProfile(null);
        setMyBooks([]);
        setLevel('');
      }
    });
    return unsubscribe;
  }, []);

  const fetchBooks = async (uid: string) => {
    try {
      const q = query(collection(db, 'books'), where('uid', '==', uid), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const books: Story[] = [];
      querySnapshot.forEach((doc) => {
        books.push(doc.data() as Story);
      });
      setMyBooks(books);
    } catch (error) {
      console.error("Error fetching books:", error);
    }
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
        await updateProfile(userCredential.user, { displayName: name });
        await sendEmailVerification(userCredential.user);
        
        const profile = {
          uid: userCredential.user.uid,
          name,
          email,
          readingLevel: '',
          createdAt: serverTimestamp()
        };
        await setDoc(doc(db, 'users', userCredential.user.uid), profile);
        setUserProfile(profile);
        setAuthMode('verify');
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        setState('home');
      }
    } catch (error: any) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const startTest = async () => {
    setState('loading');
    setLoadingMessage('Preparing your word quest...');
    try {
      const sets = await generateLevelWords();
      setWordSets(sets);
      setResults(sets.map(s => ({ set: s.difficulty, correct: 0, missed: 0 })));
      setState('testing');
      setCurrentSetIndex(0);
      setCurrentWordIndex(0);
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
    
    if (currentWordIndex < 4) {
      setCurrentWordIndex(prev => prev + 1);
    } else if (currentSetIndex < 2) {
      setCurrentSetIndex(prev => prev + 1);
      setCurrentWordIndex(0);
    } else {
      // Determine level
      const totalCorrect = newResults.reduce((acc, r) => acc + r.correct, 0);
      let determinedLevel = 'Story Starter';
      if (totalCorrect > 12) determinedLevel = 'Master Storyteller';
      else if (totalCorrect > 8) determinedLevel = 'Plot Detective';
      else if (totalCorrect > 4) determinedLevel = 'Word Explorer';
      
      setLevel(determinedLevel);
      saveLevel(determinedLevel);
      setState('config');
    }
  };

  const saveLevel = async (newLevel: string) => {
    if (user) {
      await setDoc(doc(db, 'users', user.uid), { readingLevel: newLevel }, { merge: true });
      setUserProfile(prev => ({ ...prev, readingLevel: newLevel }));
    }
  };

  const createStory = async () => {
    setState('loading');
    setLoadingMessage('Weaving your magical story...');
    try {
      const generatedStory = await generateStory(
        level,
        storyConfig.type,
        storyConfig.location,
        storyConfig.activities,
        storyConfig.values
      );
      const storyWithUid = { ...generatedStory, uid: user?.uid, createdAt: serverTimestamp() };
      setStory(storyWithUid);
      setCurrentPage(0);
      setState('reading');
      generatePageAssets(0, storyWithUid);
      
      if (user) {
        await addDoc(collection(db, 'books'), storyWithUid);
        fetchBooks(user.uid);
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
    setLoadingMessage('Reading your story...');
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
      const importedStory = await processImportedStory(truncated);
      const storyWithUid = { ...importedStory, uid: user?.uid, isImported: true, createdAt: serverTimestamp() };
      
      setStory(storyWithUid);
      setCurrentPage(0);
      setState('reading');
      generatePageAssets(0, storyWithUid);

      if (user) {
        await addDoc(collection(db, 'books'), storyWithUid);
        fetchBooks(user.uid);
      }
    } catch (error) {
      console.error("Import error:", error);
      alert("Failed to import story. Please try again.");
      setState('home');
    }
  };

  const generatePageAssets = async (index: number, currentStory: any) => {
    if (!currentStory.pages[index]) return;
    if (currentStory.pages[index].imageUrl && currentStory.pages[currentPage].audioData) return;

    setIsGeneratingPage(true);
    try {
      const page = currentStory.pages[index];
      const [imageUrl, audioData] = await Promise.all([
        page.imageUrl ? Promise.resolve(page.imageUrl) : generateImage(page.imagePrompt, storyConfig.imageSize),
        page.audioData ? Promise.resolve(page.audioData) : generateSpeech(page.english)
      ]);

      const updatedPages = [...currentStory.pages];
      updatedPages[index] = { ...page, imageUrl: imageUrl || undefined, audioData: audioData || undefined };
      const updatedStory = { ...currentStory, pages: updatedPages };
      setStory(updatedStory);
    } catch (error) {
      console.error("Error generating page assets:", error);
    } finally {
      setIsGeneratingPage(false);
    }
  };

  const playAudio = (base64: string) => {
    const audio = new Audio(`data:audio/wav;base64,${base64}`);
    audio.play();
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsChatLoading(true);
    try {
      const aiResponse = await chatWithGemini(userMsg, []);
      setChatMessages(prev => [...prev, { role: 'ai', text: aiResponse || 'I am not sure how to answer that.' }]);
    } catch (error) {
      console.error(error);
    } finally {
      setIsChatLoading(false);
    }
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

  if (!user && state !== 'auth') {
    return (
      <div className="min-h-screen bg-[#FDFCF0] flex flex-col items-center justify-center p-6">
        <div className="bg-white p-12 rounded-[40px] shadow-2xl border border-gray-100 max-w-md w-full text-center space-y-8">
          <div className="bg-indigo-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-indigo-100">
            <BookOpen className="text-white w-10 h-10" />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-gray-900">StoryMe</h1>
            <p className="text-gray-500">Log in to start your magical journey!</p>
          </div>
          <button 
            onClick={() => setState('auth')}
            className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
          >
            Get Started
          </button>
        </div>
      </div>
    );
  }

  return (
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
          <NavButton id="home" label="Home" icon={HomeIcon} />
          <NavButton id="my-books" label="My books" icon={Library} />
          <button className="text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-xl font-medium">Explore</button>
          <NavButton id="progress" label="Progress" icon={BarChart3} />
          <div className="flex items-center gap-4 pl-4 border-l border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                {user?.displayName?.[0] || 'U'}
              </div>
              <span className="text-sm font-bold text-gray-700">{user?.displayName}</span>
            </div>
            <button 
              onClick={() => signOut(auth)}
              className="text-gray-400 hover:text-rose-500 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </button>
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
                    {authMode === 'login' ? 'Welcome Back!' : authMode === 'signup' ? 'Join StoryMe' : 'Verify Email'}
                  </h2>
                  <p className="text-gray-500">
                    {authMode === 'login' ? 'Continue your reading adventure' : authMode === 'signup' ? 'Create an account for your child' : 'Please check your inbox'}
                  </p>
                </div>

                {authMode === 'verify' ? (
                  <div className="text-center space-y-6">
                    <div className="bg-indigo-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                      <Mail className="w-10 h-10 text-indigo-600" />
                    </div>
                    <p className="text-gray-600">We've sent a verification link to your email. Please click it to activate your account.</p>
                    <button 
                      onClick={() => setAuthMode('login')}
                      className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold"
                    >
                      Go to Login
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleAuth} className="space-y-4">
                    {authMode === 'signup' && (
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-400 uppercase ml-2">Name</label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" />
                          <input name="name" type="text" required placeholder="Your child's name" className="w-full pl-12 pr-4 py-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:border-indigo-400 outline-none transition-all" />
                        </div>
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase ml-2">Email</label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" />
                        <input name="email" type="email" required placeholder="parent@email.com" className="w-full pl-12 pr-4 py-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:border-indigo-400 outline-none transition-all" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase ml-2">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" />
                        <input name="password" type="password" required placeholder="••••••••" className="w-full pl-12 pr-4 py-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:border-indigo-400 outline-none transition-all" />
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
                      {authLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : authMode === 'login' ? 'Log In' : 'Sign Up'}
                    </button>

                    <p className="text-center text-sm text-gray-500">
                      {authMode === 'login' ? "Don't have an account? " : "Already have an account? "}
                      <button 
                        type="button"
                        onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                        className="text-indigo-600 font-bold hover:underline"
                      >
                        {authMode === 'login' ? 'Sign Up' : 'Log In'}
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
                  Imagine it. Create it. Read it.
                </motion.h2>
                <motion.p 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="text-xl text-gray-600 max-w-2xl mb-12 leading-relaxed"
                >
                  Personalized storybooks crafted to your child's reading level — aligned with RAZ, Fountas & Pinnell, and Lexile frameworks.
                </motion.p>
                
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <button 
                    onClick={() => level ? setState('config') : setState('welcome')}
                    className="bg-[#2D3E50] hover:bg-[#1A2A3A] text-white px-10 py-5 rounded-2xl text-xl font-bold flex items-center gap-3 shadow-2xl transition-all hover:scale-105"
                  >
                    <Sparkles className="w-6 h-6" />
                    Create new story
                  </button>
                  <button 
                    onClick={() => setState('import')}
                    className="bg-white border-2 border-gray-100 hover:border-indigo-200 text-gray-700 px-10 py-5 rounded-2xl text-xl font-bold flex items-center gap-3 shadow-xl transition-all hover:scale-105"
                  >
                    <Upload className="w-6 h-6 text-indigo-500" />
                    Import your story
                  </button>
                </div>
                <p className="mt-8 text-sm text-gray-400">9 of 10 stories remaining this week</p>
              </div>

              {/* Recent Books */}
              <div className="max-w-7xl mx-auto px-6 pb-20">
                <div className="flex justify-between items-center mb-10">
                  <h3 className="text-2xl font-bold text-gray-900">Recently Read</h3>
                  <button onClick={() => setState('my-books')} className="text-indigo-600 font-bold hover:underline">View all</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-8">
                  {myBooks.slice(0, 4).map((book, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      onClick={() => {
                        setStory(book);
                        setCurrentPage(0);
                        setState('reading');
                      }}
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
                        <p className="text-sm text-gray-400">{book.isImported ? 'Imported Story' : 'AI Generated'}</p>
                      </div>
                    </motion.div>
                  ))}
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
                <h2 className="text-4xl font-black text-gray-900">Import Your Story</h2>
                <p className="text-gray-500 text-lg">Upload a PDF or Word file and we'll turn it into a magical illustrated book!</p>
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
                    <p className="text-xl font-bold text-gray-900">Click or drag file here</p>
                    <p className="text-gray-400">PDF, DOCX, or TXT (Max 500 words)</p>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 p-6 rounded-3xl flex items-start gap-4 text-left">
                <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
                <p className="text-amber-800 text-sm">
                  <strong>Tip:</strong> Stories under 500 words work best. If your file is longer, we'll only take the first 500 words to keep the magic focused!
                </p>
              </div>

              <button 
                onClick={() => setState('home')}
                className="text-gray-400 font-bold hover:text-gray-600"
              >
                Go back
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
                <h2 className="text-6xl font-serif font-bold text-gray-900">Do you know this word?</h2>
                <p className="text-xl text-gray-500">Let's find your reading level!</p>
              </div>

              <div className="grid lg:grid-cols-2 gap-16 items-center">
                {/* Dog Illustration */}
                <div className="relative">
                  <motion.div 
                    animate={{ y: [0, -10, 0] }}
                    transition={{ repeat: Infinity, duration: 3 }}
                    className="bg-white p-8 rounded-[60px] shadow-2xl border border-gray-100"
                  >
                    <img 
                      src="https://picsum.photos/seed/cute-dog/800/800" 
                      alt="Cute dog" 
                      className="w-full aspect-square object-cover rounded-[40px]"
                      referrerPolicy="no-referrer"
                    />
                  </motion.div>
                  <div className="absolute -bottom-6 -right-6 bg-yellow-400 p-6 rounded-3xl shadow-xl rotate-12">
                    <Sparkles className="w-8 h-8 text-white" />
                  </div>
                </div>

                {/* Test Content */}
                <div className="space-y-10">
                  <div className="flex flex-wrap gap-3">
                    {['Story Starter', 'Word Explorer', 'Sentence Builder', 'Page Turner', 'Chapter Chaser', 'Plot Detective'].map((l) => (
                      <div 
                        key={l}
                        className={cn(
                          "px-4 py-2 rounded-full text-sm font-bold border transition-all",
                          level === l 
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-lg" 
                          : "bg-white text-gray-400 border-gray-100"
                        )}
                      >
                        {l} {level === l && '✓'}
                      </div>
                    ))}
                  </div>

                  <motion.div 
                    key={wordSets[currentSetIndex]?.words[currentWordIndex]}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-indigo-50 p-16 rounded-[40px] border-2 border-indigo-100 text-center"
                  >
                    <span className="text-6xl font-black text-indigo-900 tracking-tight">
                      {wordSets[currentSetIndex]?.words[currentWordIndex]}
                    </span>
                  </motion.div>

                  <div className="space-y-6">
                    <div className="flex justify-between text-sm font-bold uppercase tracking-widest">
                      <span className="text-gray-400">Level: {wordSets[currentSetIndex]?.difficulty}</span>
                      <div className="flex gap-4">
                        <span className="text-emerald-500">{results[currentSetIndex]?.correct}/5 correct</span>
                        <span className="text-rose-400">{results[currentSetIndex]?.missed}/2 missed</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <button 
                        onClick={() => handleWordResponse(false)}
                        className="bg-white border-2 border-gray-100 hover:border-gray-200 text-gray-700 py-6 rounded-3xl text-2xl font-bold transition-all"
                      >
                        Still learning
                      </button>
                      <button 
                        onClick={() => handleWordResponse(true)}
                        className="bg-[#2D3E50] hover:bg-[#1A2A3A] text-white py-6 rounded-3xl text-2xl font-bold transition-all shadow-xl"
                      >
                        I know it!
                      </button>
                    </div>
                  </div>

                  <button 
                    onClick={() => setState('home')}
                    className="flex items-center gap-2 text-gray-400 font-bold hover:text-gray-600"
                  >
                    <ChevronLeft className="w-5 h-5" /> Back
                  </button>
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
                    <h2 className="text-4xl font-serif font-bold text-gray-900">My Books</h2>
                    <div className="flex gap-2 bg-white/50 p-1.5 rounded-2xl w-fit backdrop-blur-sm">
                      <button className="bg-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-sm text-indigo-600">My Stories ({myBooks.length})</button>
                      <button className="px-6 py-2.5 rounded-xl font-bold text-sm text-gray-500 hover:bg-white/30 transition-colors">Imported Books</button>
                    </div>
                  </div>
                  <button 
                    onClick={() => level ? setState('config') : setState('welcome')}
                    className="bg-[#2D3E50] hover:bg-[#1A2A3A] text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-2 shadow-xl"
                  >
                    <Plus className="w-5 h-5" />
                    Create new story
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-8">
                  {myBooks.map((book, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => {
                        setStory(book);
                        setCurrentPage(0);
                        setState('reading');
                      }}
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
                        <p className="text-sm text-gray-400">{book.isImported ? 'Imported' : level || 'Plot Detective'}</p>
                      </div>
                    </motion.div>
                  ))}
                  {myBooks.length === 0 && (
                    <div className="col-span-full py-32 text-center space-y-6">
                      <div className="bg-white/50 w-24 h-24 rounded-full flex items-center justify-center mx-auto">
                        <Library className="w-12 h-12 text-gray-300" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-gray-500 text-xl font-medium">No stories in your library yet.</p>
                        <p className="text-gray-400">Start by creating or importing a magical tale!</p>
                      </div>
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
              <h2 className="text-4xl font-serif font-bold text-gray-900">Your Progress</h2>

              <div className="space-y-8">
                {/* Daily Stamps */}
                <div className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm space-y-6">
                  <div className="flex items-center gap-3">
                    <Trophy className="w-8 h-8 text-yellow-500" />
                    <h3 className="text-2xl font-bold text-gray-900">Daily stamps</h3>
                  </div>
                  <p className="text-gray-500 text-lg">Finish one new book (record every page) to get a stamp for that day.</p>
                  <div className="grid grid-cols-7 gap-4">
                    {[...Array(7)].map((_, i) => (
                      <div key={i} className="aspect-square rounded-2xl bg-gray-50 border-2 border-dashed border-gray-100 flex items-center justify-center text-gray-200">
                        <Zap className="w-6 h-6" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Reading Level */}
                <div className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm space-y-8">
                  <h3 className="text-2xl font-bold text-gray-900">My reading level</h3>
                  <div className="flex items-center gap-6">
                    <div className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold text-xl shadow-lg shadow-indigo-100">
                      {level || 'Plot Detective'}
                    </div>
                    <p className="text-gray-500 text-lg">Stories are matched to this level</p>
                  </div>
                  <button 
                    onClick={startTest}
                    className="text-indigo-600 font-bold text-lg hover:underline flex items-center gap-2"
                  >
                    I want to test and adjust my level <ChevronRight className="w-5 h-5" />
                  </button>
                </div>

                {/* Word List */}
                <div className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-all group">
                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold text-gray-900">My word list</h3>
                    <p className="text-gray-500 text-lg">Tap on words while reading to start building your list!</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-2xl group-hover:bg-indigo-50 transition-colors">
                    <ChevronRight className="w-8 h-8 text-gray-400 group-hover:text-indigo-600" />
                  </div>
                </div>

                {/* Streak */}
                <div className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm space-y-6">
                  <h3 className="text-2xl font-bold text-gray-900">Current streak</h3>
                  <div className="flex items-baseline gap-3">
                    <span className="text-8xl font-black text-indigo-600">0</span>
                    <span className="text-3xl font-bold text-indigo-600">days</span>
                  </div>
                  <p className="text-gray-500 text-lg">Complete a new book each day to keep your streak.</p>
                </div>
              </div>
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
                <h2 className="text-6xl font-black text-gray-900 leading-tight">Ready for a <br/>Magical Adventure?</h2>
                <p className="text-2xl text-gray-600 max-w-lg mx-auto">First, let's see how many words you know so we can pick the perfect story for you!</p>
              </div>
              <button 
                onClick={startTest}
                className="group relative bg-indigo-600 hover:bg-indigo-700 text-white px-12 py-6 rounded-[32px] text-2xl font-bold transition-all hover:scale-105 active:scale-95 shadow-2xl shadow-indigo-200"
              >
                Start My Quest
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

          {state === 'config' && (
            <motion.div 
              key="config"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="max-w-5xl mx-auto px-6 py-16 space-y-12"
            >
              <div className="text-center space-y-4">
                <h2 className="text-5xl font-black text-gray-900">Customize Your Story</h2>
                <p className="text-xl text-gray-500">Tell us what you want to see in your magical book!</p>
              </div>

              <div className="grid md:grid-cols-2 gap-12">
                <div className="space-y-8">
                  <div className="space-y-4">
                    <label className="text-sm font-bold text-gray-900 uppercase tracking-widest ml-2">Story Type</label>
                    <select 
                      value={storyConfig.type}
                      onChange={e => setStoryConfig({...storyConfig, type: e.target.value})}
                      className="w-full p-5 rounded-3xl bg-white border-2 border-gray-100 focus:border-indigo-400 outline-none transition-all text-xl shadow-sm"
                    >
                      <option>Adventure</option>
                      <option>Fairy Tale</option>
                      <option>Space Journey</option>
                      <option>Animal Friends</option>
                      <option>Mystery</option>
                    </select>
                  </div>

                  <div className="space-y-4">
                    <label className="text-sm font-bold text-gray-900 uppercase tracking-widest ml-2">Setting</label>
                    <input 
                      type="text"
                      value={storyConfig.location}
                      onChange={e => setStoryConfig({...storyConfig, location: e.target.value})}
                      placeholder="e.g. Under the sea, On Mars..."
                      className="w-full p-5 rounded-3xl bg-white border-2 border-gray-100 focus:border-indigo-400 outline-none transition-all text-xl shadow-sm"
                    />
                  </div>

                  <div className="space-y-4">
                    <label className="text-sm font-bold text-gray-900 uppercase tracking-widest ml-2">Fun Activities (Optional)</label>
                    <input 
                      type="text"
                      value={storyConfig.activities}
                      onChange={e => setStoryConfig({...storyConfig, activities: e.target.value})}
                      placeholder="e.g. Baking a cake, Flying a kite..."
                      className="w-full p-5 rounded-3xl bg-white border-2 border-gray-100 focus:border-indigo-400 outline-none transition-all text-xl shadow-sm"
                    />
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="space-y-4">
                    <label className="text-sm font-bold text-gray-900 uppercase tracking-widest ml-2">Values to Instill</label>
                    <input 
                      type="text"
                      value={storyConfig.values}
                      onChange={e => setStoryConfig({...storyConfig, values: e.target.value})}
                      placeholder="e.g. Sharing, Bravery, Honesty..."
                      className="w-full p-5 rounded-3xl bg-white border-2 border-gray-100 focus:border-indigo-400 outline-none transition-all text-xl shadow-sm"
                    />
                  </div>

                  <div className="space-y-4">
                    <label className="text-sm font-bold text-gray-900 uppercase tracking-widest ml-2">Illustration Quality</label>
                    <div className="grid grid-cols-3 gap-4">
                      {(['1K', '2K', '4K'] as const).map(size => (
                        <button
                          key={size}
                          onClick={() => setStoryConfig({...storyConfig, imageSize: size})}
                          className={cn(
                            "py-4 rounded-2xl font-bold transition-all text-lg",
                            storyConfig.imageSize === size 
                            ? "bg-indigo-600 text-white shadow-xl shadow-indigo-100" 
                            : "bg-white text-indigo-400 border-2 border-indigo-50 hover:border-indigo-200"
                          )}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button 
                    onClick={createStory}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-8 rounded-[32px] text-3xl font-bold transition-all hover:scale-[1.02] active:scale-95 shadow-2xl shadow-indigo-200 flex items-center justify-center gap-4"
                  >
                    Generate Story
                    <Sparkles className="w-8 h-8" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {state === 'reading' && story && (
            <motion.div 
              key="reading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-7xl mx-auto px-6 py-12 space-y-10"
            >
              <div className="flex justify-between items-center bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
                <div className="flex items-center gap-6">
                  <button 
                    onClick={() => setState('my-books')}
                    className="p-3 hover:bg-gray-50 rounded-2xl text-gray-400 transition-colors"
                  >
                    <ChevronLeft className="w-8 h-8" />
                  </button>
                  <h3 className="text-3xl font-black text-gray-900">{story.title}</h3>
                </div>
                <div className="text-indigo-600 font-bold bg-indigo-50 px-6 py-3 rounded-2xl text-lg">Page {currentPage + 1} of {story.pages.length}</div>
              </div>

              <div className="grid lg:grid-cols-2 gap-16">
                {/* Illustration */}
                <div className="relative aspect-square bg-white rounded-[60px] shadow-2xl shadow-indigo-100 border-8 border-white overflow-hidden group">
                  {story.pages[currentPage].imageUrl ? (
                    <motion.img 
                      key={story.pages[currentPage].imageUrl}
                      initial={{ opacity: 0, scale: 1.1 }}
                      animate={{ opacity: 1, scale: 1 }}
                      src={story.pages[currentPage].imageUrl} 
                      alt="Story illustration"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center space-y-6 text-indigo-200">
                      <ImageIcon className="w-24 h-24 animate-pulse" />
                      <p className="text-xl font-bold">Drawing illustration...</p>
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
                      <p className="text-4xl font-bold text-gray-900 leading-[1.4]">
                        {story.pages[currentPage].english}
                      </p>
                      {story.pages[currentPage].audioData && (
                        <button 
                          onClick={() => playAudio(story.pages[currentPage].audioData!)}
                          className="absolute -right-6 -top-6 bg-indigo-600 text-white p-4 rounded-[24px] shadow-2xl hover:scale-110 active:scale-95 transition-all"
                        >
                          <Volume2 className="w-6 h-6" />
                        </button>
                      )}
                    </div>
                    <div className="h-px bg-gray-100 w-full" />
                    <p className="text-3xl font-medium text-gray-400 leading-[1.4]">
                      {story.pages[currentPage].chinese}
                    </p>
                  </div>

                  <div className="flex gap-6 pt-10">
                    <button 
                      disabled={currentPage === 0}
                      onClick={() => {
                        const newPage = currentPage - 1;
                        setCurrentPage(newPage);
                        generatePageAssets(newPage, story);
                      }}
                      className="flex-1 bg-white border-2 border-gray-100 text-gray-500 py-6 rounded-[32px] font-bold text-xl disabled:opacity-30 flex items-center justify-center gap-3 hover:bg-gray-50 transition-colors"
                    >
                      <ChevronLeft className="w-6 h-6" /> Previous
                    </button>
                    <button 
                      disabled={currentPage === story.pages.length - 1}
                      onClick={() => {
                        const newPage = currentPage + 1;
                        setCurrentPage(newPage);
                        generatePageAssets(newPage, story);
                      }}
                      className="flex-1 bg-indigo-600 text-white py-6 rounded-[32px] font-bold text-xl disabled:opacity-30 flex items-center justify-center gap-3 hover:bg-indigo-700 transition-all shadow-2xl shadow-indigo-100"
                    >
                      Next <ChevronRight className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
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
                  <span className="font-bold text-lg">Story Helper</span>
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
                    <p className="text-gray-400 font-medium">Ask me anything about the story!</p>
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
                    placeholder="Ask a question..."
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
  );
}
