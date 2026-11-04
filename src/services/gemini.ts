import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface StoryPage {
  text: string;
  imageUrl?: string;
  audioData?: string;
  imagePrompt?: string;
  translation?: string;
  questions?: string[];
  annotations?: (Annotation | string)[];
}

export interface Annotation {
  word: string;
  explanation: string;
}

/**
 * Older stories stored annotations as plain strings ("word: explanation");
 * newer ones store { word, explanation }. Normalize both shapes.
 */
export function normalizeAnnotation(a: Annotation | string | null | undefined): Annotation | null {
  if (!a) return null;
  if (typeof a === 'string') {
    const m = a.match(/^\s*([^:\-–—]+?)\s*[:\-–—]\s*(.+)$/);
    return m ? { word: m[1].trim(), explanation: m[2].trim() } : { word: a.trim(), explanation: '' };
  }
  if (typeof a.word !== 'string' || !a.word.trim()) return null;
  return { word: a.word, explanation: typeof a.explanation === 'string' ? a.explanation : '' };
}

export interface WordDetails {
  explanation: string;
  exampleSentence: string;
  pronunciation?: string;
}

export interface Story {
  id?: string;
  uid?: string | null;
  title: string;
  pages: StoryPage[];
  level: string;
  language: string;
  createdAt: string | number;
  authorId?: string;
  isImported?: boolean;
  subject?: string;
}

export interface WordSet {
  difficulty: string;
  words: string[];
}

export interface StoryOption {
  text: string;
  emoji: string;
}

export async function generateLevelWords(language: string): Promise<WordSet[]> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate 5 sets of words (Level 1 to Level 5) for a kids reading assessment in ${language}. Return as JSON array of objects with 'difficulty' and 'words' (array of 3 words each).`,
    config: { 
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            difficulty: { type: Type.STRING },
            words: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["difficulty", "words"]
        }
      }
    }
  });
  return JSON.parse(response.text || "[]");
}

export async function generateStory(
  level: string,
  characters: string[],
  locations: string[],
  activities: string,
  values: string[],
  language: string,
  characterDetails: string,
  locationDetails: string
): Promise<Story> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate a 5-page kids story in ${language} for level ${level}. 
    Characters: ${characters.join(", ")}. ${characterDetails}
    Locations: ${locations.join(", ")}. ${locationDetails}
    Activities: ${activities}
    Values: ${values.join(", ")}
    Return as JSON with 'title' and 'pages' (array of objects with 'text', 'imagePrompt', 'translation', 'questions', and 'annotations'). 'annotations' lists 1-3 harder words from the page, each with 'word' (exactly as it appears in the text) and a short child-friendly 'explanation'.`,
    config: { 
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          pages: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                imagePrompt: { type: Type.STRING },
                translation: { type: Type.STRING },
                questions: { type: Type.ARRAY, items: { type: Type.STRING } },
                annotations: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      word: { type: Type.STRING },
                      explanation: { type: Type.STRING }
                    },
                    required: ["word", "explanation"]
                  }
                }
              },
              required: ["text", "imagePrompt", "translation", "questions", "annotations"]
            }
          }
        },
        required: ["title", "pages"]
      }
    }
  });
  const data = JSON.parse(response.text || "{}");
  return {
    ...data,
    level,
    language,
    createdAt: new Date().toISOString()
  };
}

export async function generateImage(prompt: string, size: string = "1K"): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: `Illustration for a kids story: ${prompt}`,
    config: {
      imageConfig: {
        aspectRatio: "1:1",
        imageSize: size as any
      }
    }
  });
  
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image generated");
}

export async function generateSpeech(text: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO" as any],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Kore" }
        }
      }
    }
  });
  
  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (base64Audio) {
    // Gemini TTS returns raw 16-bit PCM (24 kHz mono); playAudio wraps it in a WAV header.
    return base64Audio;
  }
  throw new Error("No speech generated");
}

export async function chatWithGemini(message: string, history: any[], language: string): Promise<string> {
  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: `You are a helpful reading companion for a child learning ${language}. Keep your answers simple, encouraging, and educational.`
    }
  });
  
  const response = await chat.sendMessage({ message });
  return response.text || "I'm sorry, I couldn't understand that.";
}

export async function processImportedStory(text: string, language: string): Promise<Story> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Process this text into a 5-page kids story in ${language}: ${text}. Return as JSON with 'title' and 'pages' (array of objects with 'text', 'imagePrompt', 'translation', 'questions', and 'annotations'). 'annotations' lists 1-3 harder words from the page, each with 'word' (exactly as it appears in the text) and a short child-friendly 'explanation'.`,
    config: { 
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          pages: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                imagePrompt: { type: Type.STRING },
                translation: { type: Type.STRING },
                questions: { type: Type.ARRAY, items: { type: Type.STRING } },
                annotations: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      word: { type: Type.STRING },
                      explanation: { type: Type.STRING }
                    },
                    required: ["word", "explanation"]
                  }
                }
              },
              required: ["text", "imagePrompt", "translation", "questions", "annotations"]
            }
          }
        },
        required: ["title", "pages"]
      }
    }
  });
  const data = JSON.parse(response.text || "{}");
  return {
    ...data,
    level: "Intermediate",
    language,
    createdAt: new Date().toISOString()
  };
}

export async function getWordDetails(word: string, language: string): Promise<WordDetails> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Provide details for the word "${word}" in ${language}. Include 'definition', 'example', and 'pronunciation'. Return as JSON.`,
    config: { 
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          definition: { type: Type.STRING },
          example: { type: Type.STRING },
          pronunciation: { type: Type.STRING }
        },
        required: ["definition", "example", "pronunciation"]
      }
    }
  });
  const data = JSON.parse(response.text || "{}");
  return {
    explanation: data.definition || "",
    exampleSentence: data.example || "",
    pronunciation: data.pronunciation
  };
}

export async function generateStoryOptions(category: string, level: string, language: string): Promise<StoryOption[]> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate 8 creative ${category} for kids in ${language} at level ${level}. Return as JSON array of objects with 'text' and 'emoji'.`,
    config: { 
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
            emoji: { type: Type.STRING }
          },
          required: ["text", "emoji"]
        }
      }
    }
  });
  return JSON.parse(response.text || "[]");
}

export async function generateAllStoryOptions(language: string): Promise<StoryOption[]> {
  return generateStoryOptions("themes", "Beginner", language);
}
