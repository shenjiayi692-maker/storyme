import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Translates text using Gemini.
 */
export async function translateText(text: string, targetLanguage: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Translate the following text to ${targetLanguage}: ${text}`,
  });
  return response.text || "";
}
