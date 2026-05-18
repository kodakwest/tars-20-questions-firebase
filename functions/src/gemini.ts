import { GoogleGenAI } from "@google/genai";
import { answerInterpreterSchema, geminiTurnResponseSchema } from "./schemas.js";
import { buildStrategistPrompt } from "./prompts.js";
import type { AnswerValue, GameReferencePack, GeminiTurnResponse } from "./types.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export async function queryStrategist(
  systemPrompt: string,
  referencePack: GameReferencePack,
  conversationHistory: string
): Promise<GeminiTurnResponse> {
  const fullPrompt = buildStrategistPrompt(referencePack, conversationHistory);

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
    config: {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      temperature: 0.6,
      maxOutputTokens: 1024,
      responseMimeType: "application/json"
    }
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response");
  }
  const parsed: unknown = JSON.parse(text);
  return geminiTurnResponseSchema.parse(parsed);
}

export async function queryAnswerInterpreter(userRawInput: string): Promise<AnswerValue> {
  const normalized = userRawInput.trim().toLowerCase();
  if (["yes", "y", "yeah", "yep", "correct", "right", "true", "sure"].includes(normalized)) {
    return "yes";
  }
  if (["no", "n", "nope", "nah", "incorrect", "wrong", "false"].includes(normalized)) {
    return "no";
  }
  if (["kind of", "kind_of", "sort of", "sorta", "maybe", "partially", "sometimes"].includes(normalized)) {
    return "kind_of";
  }
  if (["unknown", "i don't know", "dont know", "not sure", "unsure"].includes(normalized)) {
    return "unknown";
  }

  if (!GEMINI_API_KEY) {
    return "unknown";
  }

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{
      role: "user",
      parts: [{
        text: `Normalize this 20 Questions answer to JSON {"answer":"yes|no|kind_of|unknown"}: ${userRawInput}`
      }]
    }],
    config: {
      temperature: 0,
      maxOutputTokens: 64,
      responseMimeType: "application/json"
    }
  });
  const text = response.text;
  if (!text) {
    return "unknown";
  }
  const parsed: unknown = JSON.parse(text);
  return answerInterpreterSchema.parse(parsed).answer;
}

export function validateResponse(response: unknown): { valid: boolean; error?: string } {
  const parsed = geminiTurnResponseSchema.safeParse(response);
  if (parsed.success) {
    return { valid: true };
  }
  return { valid: false, error: parsed.error.message };
}
