import { GoogleGenAI, GenerateContentResponse, Schema } from "@google/genai";
import { ChatMessage, MelodyNote } from '../types';

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API Key is missing!");
  }
  return new GoogleGenAI({ apiKey: apiKey || '' });
};

export const streamChatResponse = async (
  history: ChatMessage[],
  newMessage: string,
  onChunk: (text: string) => void
) => {
  const ai = getAiClient();
  const chat = ai.chats.create({
    model: 'gemini-3-pro-preview',
    config: {
      systemInstruction: 'You are an expert music theory instructor. If asked to generate a melody or music, provide the notes in a clear text format. Be concise, helpful, and encouraging.',
    },
    history: history.map(h => ({
      role: h.role,
      parts: [{ text: h.text }]
    }))
  });

  try {
    const result = await chat.sendMessageStream({ message: newMessage });
    for await (const chunk of result) {
        const c = chunk as GenerateContentResponse;
        if (c.text) {
            onChunk(c.text);
        }
    }
  } catch (error) {
    console.error("Chat Error:", error);
    onChunk("\n[Error: Unable to get response from Gemini. Please check your API key.]");
  }
};

export const transcribeSheetMusic = async (base64Image: string): Promise<MelodyNote[]> => {
  const ai = getAiClient();
  
  const prompt = `Analyze this sheet music image accurately. Extract the melody notes in sequence.
  Ignore complex chords for now, just pick the top melody line.
  Assume a standard tempo of 120 BPM (quarter note = 0.5s) unless marked otherwise, but output seconds for duration.
  Return ONLY a JSON array of objects with keys:
  - "noteName": string (Scientific pitch notation, e.g. "C4", "A#3", "D5").
  - "duration": number (in seconds).
  Do not include markdown blocks. Just the raw JSON string.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', // High reasoning model for OMR
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/png', data: base64Image } },
          { text: prompt }
        ]
      },
    });

    const text = response.text || '';
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(jsonStr) as MelodyNote[];
  } catch (error) {
    console.error("Sheet Transcription Error:", error);
    throw error;
  }
};