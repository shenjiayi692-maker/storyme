import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Loader2, Image as ImageIcon, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { generateImage } from '../services/gemini';
import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export default function ImageGenerator() {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    setError(null);
    setGeneratedImage(null);
    setSuccess(false);

    try {
      const base64Image = await generateImage(prompt);
      if (base64Image) {
        setGeneratedImage(base64Image);
      } else {
        setError('Failed to generate image. Please try again.');
      }
    } catch (err: any) {
      console.error('Generation error:', err);
      setError(err.message || 'An error occurred during generation.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!generatedImage || !auth.currentUser) return;

    setIsUploading(true);
    setError(null);

    try {
      // Save base64 string directly to Firestore
      await addDoc(collection(db, 'generated_images'), {
        imageData: generatedImage,
        prompt: prompt,
        userId: auth.currentUser.uid,
        createdAt: serverTimestamp()
      });

      setSuccess(true);
    } catch (err: any) {
      console.error('Save error:', err);
      setError(err.message || 'An error occurred during saving.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-2">
          <Sparkles className="text-indigo-600" />
          Gemini Image Generator
        </h1>
        <p className="text-gray-600">Generate images with Gemini and save them to Firestore</p>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the image you want to generate..."
          className="w-full p-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all min-h-[100px]"
          disabled={isGenerating || isUploading}
        />
        
        <button
          onClick={handleGenerate}
          disabled={isGenerating || isUploading || !prompt.trim()}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <ImageIcon size={20} />
              Generate Image
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 text-rose-600 p-4 rounded-xl flex items-center gap-3 border border-rose-100">
          <AlertCircle size={20} />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {generatedImage && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="relative aspect-square rounded-2xl overflow-hidden border border-gray-200 shadow-lg">
            <img src={generatedImage} alt="Generated" className="w-full h-full object-cover" />
          </div>

          {!success ? (
            <button
              onClick={handleSave}
              disabled={isUploading}
              className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="animate-spin" />
                  Saving to Firestore...
                </>
              ) : (
                <>
                  <Upload size={20} />
                  Save to Firestore
                </>
              )}
            </button>
          ) : (
            <div className="bg-emerald-50 text-emerald-600 p-4 rounded-xl flex items-center gap-3 border border-emerald-100">
              <CheckCircle2 size={20} />
              <div className="flex-1">
                <p className="text-sm font-bold">Successfully saved!</p>
                <p className="text-xs opacity-80">Image saved to your collection.</p>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
