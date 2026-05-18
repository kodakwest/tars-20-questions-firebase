import { VertexAI } from "@google-cloud/vertexai";
import { answerInterpreterSchema, geminiTurnResponseSchema } from "./schemas.js";
import { buildStrategistPrompt } from "./prompts.js";
import type { AnswerValue, GameReferencePack, GeminiTurnResponse } from "./types.js";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-001";
const PROJECT_ID = process.env.GCLOUD_PROJECT || "tars-20-questions";
const LOCATION = "us-central1";

const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });

export async function queryStrategist(
  systemPrompt: string,
  referencePack: GameReferencePack,
  conversationHistory: string
): Promise<GeminiTurnResponse> {
  const fullPrompt = buildStrategistPrompt(referencePack, conversationHistory);

  const model = vertexAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
  });

  const text = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
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

  // Fallback: ask Gemini to interpret
  try {
    const model = vertexAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 64,
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{
          text: `Normalize this 20 Questions answer to JSON {"answer":"yes|no|kind_of|unknown"}: ${userRawInput}`
        }]
      }],
    });

    const text = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return "unknown";
    const parsed: unknown = JSON.parse(text);
    return answerInterpreterSchema.parse(parsed).answer;
  } catch {
    return "unknown";
  }
}

export function validateResponse(response: unknown): { valid: boolean; error?: string } {
  const parsed = geminiTurnResponseSchema.safeParse(response);
  if (parsed.success) {
    return { valid: true };
  }
  return { valid: false, error: parsed.error.message };
}
