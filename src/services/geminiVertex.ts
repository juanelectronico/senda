import { GoogleGenAI } from "@google/genai";

export async function processFiscalData(prompt: string) {
  const ai = new GoogleGenAI({
    vertexai: true,
    project: "project-9a1eb3ec-f78b-469d-bda",
    location: "us-central1"
  });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt
  });

  return response.text;
}