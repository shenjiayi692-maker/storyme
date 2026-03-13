import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenAI({ apiKey });

export interface StoryPage {
  english: string;
  chinese: string;
  imagePrompt: string;
  imageUrl?: string;
  audioData?: string;
}

export interface Story {
  title: string;
  pages: StoryPage[];
}

export interface WordSet {
  difficulty: 'Easy' | 'Intermediate' | 'Difficult';
  words: string[];
}

export const generateLevelWords = async (): Promise<WordSet[]> => {
  const response = await genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: "Generate 3 sets of English vocabulary words for kids. Each set should contain 5 words. The sets should be categorized by difficulty: 'Easy', 'Intermediate', and 'Difficult'. Return as a JSON array of objects, each with 'difficulty' and 'words' (array of strings) properties.",
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            difficulty: { type: Type.STRING, enum: ["Easy", "Intermediate", "Difficult"] },
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
};

export const processImportedStory = async (text: string): Promise<Story> => {
  const prompt = `I have an imported story text. Please break it down into 5-7 logical pages for a children's book. 
  For each page, provide:
  1. The original English text (or a slightly simplified version if it's too complex).
  2. A Chinese translation.
  3. A descriptive image prompt for an illustration.
  
  Original Text: ${text.substring(0, 2000)}
  
  Return as a JSON object with a title and an array of pages.`;

  const response = await genAI.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
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
                english: { type: Type.STRING },
                chinese: { type: Type.STRING },
                imagePrompt: { type: Type.STRING }
              },
              required: ["english", "chinese", "imagePrompt"]
            }
          }
        },
        required: ["title", "pages"]
      }
    }
  });

  return JSON.parse(response.text || "{}") as Story;
};

export const generateStory = async (
  level: string,
  type: string,
  location: string,
  activities: string,
  values: string
): Promise<Story> => {
  const prompt = `Create a children's story for a ${level} level reader. 
  Type: ${type}
  Location: ${location}
  Activities: ${activities}
  Values: ${values}
  
  The story should have 5-7 pages. Each page needs:
  1. English text (appropriate for ${level} level).
  2. Chinese translation.
  3. A descriptive image prompt for an illustration.
  
  Return as a JSON object with a title and an array of pages.`;

  const response = await genAI.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
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
                english: { type: Type.STRING },
                chinese: { type: Type.STRING },
                imagePrompt: { type: Type.STRING }
              },
              required: ["english", "chinese", "imagePrompt"]
            }
          }
        },
        required: ["title", "pages"]
      }
    }
  });

  return JSON.parse(response.text || "{}") as Story;
};

export const generateImage = async (prompt: string, size: "1K" | "2K" | "4K" = "1K") => {
  const response = await genAI.models.generateContent({
    model: "gemini-3-pro-image-preview",
    contents: [{ text: `A whimsical children's book illustration: ${prompt}. Soft colors, friendly characters.` }],
    config: {
      imageConfig: {
        aspectRatio: "1:1",
        imageSize: size
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
};

export const generateSpeech = async (text: string) => {
  const response = await genAI.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
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
};

export const chatWithGemini = async (message: string, history: any[]) => {
  const chat = genAI.chats.create({
    model: "gemini-3.1-pro-preview",
    config: {
      systemInstruction: "You are a friendly storytelling assistant for kids. Keep answers simple, encouraging, and safe.",
    },
  });

  const response = await chat.sendMessage({ message });
  return response.text;
};
