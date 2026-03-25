import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenAI({ apiKey });

const withRetry = async <T>(fn: () => Promise<T>, maxRetries: number = 8): Promise<T> => {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Check for rate limit error (429 or RESOURCE_EXHAUSTED)
      const errorStr = JSON.stringify(error);
      const isRateLimit = 
        (error?.message && (error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED'))) ||
        error?.status === 'RESOURCE_EXHAUSTED' ||
        error?.error?.status === 'RESOURCE_EXHAUSTED' ||
        error?.error?.code === 429 ||
        (error?.response?.status === 429) ||
        (typeof error === 'string' && (error.includes('429') || error.includes('RESOURCE_EXHAUSTED'))) ||
        (errorStr && (errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED')));
        
      if (isRateLimit && i < maxRetries - 1) {
        // Exponential backoff: 3s, 6s, 12s, 24s, 48s... + jitter
        const delay = Math.pow(2, i + 1) * 2000 + Math.random() * 3000;
        console.warn(`Rate limit hit, retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
};

export interface StoryPage {
  text: string;
  translation: string;
  imagePrompt: string;
  imageUrl?: string;
  audioData?: string;
  questions?: string[];
  annotations?: { word: string; explanation: string }[];
}

export interface Story {
  id?: string;
  title: string;
  subject: string;
  pages: StoryPage[];
  uid?: string;
  createdAt?: any;
  lastOpenedAt?: any;
  isImported?: boolean;
}

export interface StoryOption {
  text: string;
  emoji: string;
}

export interface WordSet {
  difficulty: 'Level 1' | 'Level 2' | 'Level 3' | 'Level 4' | 'Level 5';
  words: string[];
}

export const generateLevelWords = async (targetLang: string = "English"): Promise<WordSet[]> => {
  return withRetry(async () => {
    const response = await genAI.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate 5 sets of English vocabulary words for kids. Each set should contain 3 words. 
      The sets should be categorized by difficulty levels which correspond to the following IELTS scores:
      - Level 1: IELTS 2.0 (Extremely basic words)
      - Level 2: IELTS 4.0 (Simple everyday words)
      - Level 3: IELTS 5.0 (Intermediate words)
      - Level 4: IELTS 6.5 (Upper-intermediate words)
      - Level 5: IELTS 7.5 (Advanced words)
      
      IMPORTANT: Generate a completely different and random set of words each time. Avoid common or repetitive words.
      Return as a JSON array of objects, each with 'difficulty' and 'words' (array of strings) properties.
      Instructions for the model are in English, but the response should be structured JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              difficulty: { type: Type.STRING, enum: ["Level 1", "Level 2", "Level 3", "Level 4", "Level 5"] },
              words: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["difficulty", "words"]
          }
        }
      }
    });
    return JSON.parse(response.text || "[]") as WordSet[];
  });
};

export const processImportedStory = async (text: string, targetLang: string = "English"): Promise<Story> => {
  const prompt = `I have an imported story text. Please break it down into 5-7 logical pages for a children's book. 
  For each page, provide:
  1. The story text in English (or a slightly simplified version if it's too complex).
  2. A descriptive image prompt for an illustration.
  
  Original Text: ${text.substring(0, 2000)}
  
  STRICT REQUIREMENT: The 'text' field for each page MUST be 100% English. DO NOT use any ${targetLang} words or characters in the English text.
  Return as a JSON object with a title, a short one-word subject (e.g., Animals, Space, Friendship), and an array of pages. 
  The title and subject should be in ${targetLang}. Use 'text' for the story language.
  
  IMPORTANT: If ${targetLang} is not English, ensure all translations are natural, idiomatic, and sound native to a ${targetLang} speaker. Avoid literal word-for-word translations.`;

  const response = await genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          subject: { type: Type.STRING },
          pages: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                imagePrompt: { type: Type.STRING }
              },
              required: ["text", "imagePrompt"]
            }
          }
        },
        required: ["title", "subject", "pages"]
      }
    }
  });

  return JSON.parse(response.text || "{}") as Story;
};

export const generateStory = async (
  level: string,
  characters: string[],
  locations: string[],
  activities: string,
  values: string[],
  targetLang: string = "English"
): Promise<Story> => {
  return withRetry(async () => {
    const prompt = `Create a children's story for a ${level} level reader. 
    
    STRICT REQUIREMENT: You MUST use ALL of the following elements in the story. They are the core foundation of the plot:
    - Characters: ${characters.join(', ')}
    - Locations: ${locations.join(', ')}
    - Activities: ${activities}
    - Values: ${values.join(', ')}
    
    The story should be built specifically around these elements. Do not ignore any of them. Each element must play a meaningful role in the narrative.
    
    STRICT REQUIREMENT: The 'text' field for each page MUST be 100% English. DO NOT use any ${targetLang} words or characters in the English text.
    The title and subject should be in ${targetLang}.
    5-7 pages. Each page:
    1. English text (${level} level).
    2. Translation of the text in ${targetLang}.
    3. Descriptive image prompt.
    4. 2 simple comprehension questions about this page. If ${targetLang} is not English, provide each question in both English and ${targetLang} (e.g., "English Question? (${targetLang} Question?)"). Ensure the ${targetLang} translation is natural and native-sounding.
    5. 2-3 key vocabulary words from this page with their explanations in ${targetLang}.
    
    IMPORTANT: If ${targetLang} is not English, ensure all translations, questions, and explanations are natural, idiomatic, and sound native to a ${targetLang} speaker. Avoid literal word-for-word translations. The goal is for a child to understand the essence and emotion of the story in their own language.
    
    Return JSON: {title, subject, pages: [{text, translation, imagePrompt, questions, annotations: [{word, explanation}]}]}
    
    BILINGUAL OPTIONS: For the 'questions' field, if ${targetLang} is not English, use the format "English Question? (${targetLang} Question?)". For the 'annotations' field, the 'word' should be in English and the 'explanation' should be in ${targetLang}.`;

    const response = await genAI.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            subject: { type: Type.STRING },
            pages: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  translation: { type: Type.STRING },
                  imagePrompt: { type: Type.STRING },
                  questions: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
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
                required: ["text", "translation", "imagePrompt", "questions", "annotations"]
              }
            }
          },
          required: ["title", "subject", "pages"]
        }
      }
    });

    return JSON.parse(response.text || "{}") as Story;
  });
};

export const generateImage = async (prompt: string, size: "1K" | "2K" | "4K" = "1K") => {
  return withRetry(async () => {
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: [
          { text: `A whimsical children's book illustration in storydrawing style: ${prompt}. Soft colors, friendly characters.` }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  }, 12);
};

export const generateSpeech = async (text: string) => {
  return withRetry(async () => {
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: {
        parts: [{ text }]
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  });
};

export const chatWithGemini = async (message: string, history: any[], language: string = "English") => {
  const chat = genAI.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: `You are a friendly storytelling assistant for kids. Keep answers simple, encouraging, and safe. Respond in ${language}. 
      If ${language} is not English, ensure your response is natural, idiomatic, and sounds like a native ${language} speaker.`,
    },
  });

  const response = await chat.sendMessage({ message });
  return response.text;
};

export const getWordDetails = async (word: string, targetLang: string = "English") => {
  const prompt = `Provide details for the English word "${word}" in ${targetLang} for a child learning English.
  Return a JSON object with:
  1. "explanation": A simple, natural, and native-sounding explanation of the word in ${targetLang}.
  2. "exampleSentence": A simple example sentence using the word in English.
  
  Return ONLY the JSON object.`;

  const response = await genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          explanation: { type: Type.STRING },
          exampleSentence: { type: Type.STRING }
        },
        required: ["explanation", "exampleSentence"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
};

export const generateStoryOptions = async (category: 'characters' | 'locations' | 'values', level: string, language: string = "English"): Promise<StoryOption[]> => {
  const isEnglish = language.toLowerCase() === 'english';
  const prompt = `Generate 8 diverse and random options for ${category} in a children's story for a ${level} level reader. 
  IMPORTANT: Provide a fresh and unique set of options each time. Avoid common or repetitive choices.
  Each option should be a short word or phrase and a single relevant emoji.
  
  ${isEnglish 
    ? `Respond in English.` 
    : `Provide each option in the following bilingual format: "English Word (${language} Translation)". For example, if the category is characters and the language is French, an option might be "Fireman (Pompier)". Ensure the ${language} translation is natural and native-sounding.`
  }
  
  Return as a JSON array of objects with 'text' and 'emoji' properties.`;

  const response = await genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
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

  return JSON.parse(response.text || "[]") as StoryOption[];
};
