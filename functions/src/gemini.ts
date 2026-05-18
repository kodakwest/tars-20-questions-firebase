import { answerInterpreterSchema, geminiTurnResponseSchema } from "./schemas.js";
import { buildStrategistPrompt } from "./prompts.js";
import type { AnswerValue, GameReferencePack, GeminiTurnResponse } from "./types.js";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-001";
const PROJECT_ID = process.env.GCLOUD_PROJECT || "tars-20-questions";

type VertexAIClient = import("@google-cloud/vertexai").VertexAI;
type GenerativeModel = import("@google-cloud/vertexai").GenerativeModel;

let _vertexAI: VertexAIClient | null = null;

async function getVertexAI(): Promise<VertexAIClient> {
  if (!_vertexAI) {
    const { VertexAI } = await import("@google-cloud/vertexai");
    _vertexAI = new VertexAI({ project: PROJECT_ID, location: "us-central1" });
  }
  return _vertexAI;
}

async function getModel(vertexAI: VertexAIClient, config: {
  model: string;
  generationConfig: Record<string, unknown>;
}): Promise<GenerativeModel> {
  return vertexAI.getGenerativeModel(config);
}

export async function queryStrategist(
  systemPrompt: string,
  referencePack: GameReferencePack,
  conversationHistory: string
): Promise<GeminiTurnResponse> {
  const fullPrompt = buildStrategistPrompt(referencePack, conversationHistory);
  const vertexAI = await getVertexAI();

  const model = await getModel(vertexAI, {
    model: GEMINI_MODEL,
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
  });

  const candidate = result.response?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned an empty response");

  return geminiTurnResponseSchema.parse(JSON.parse(text)) as GeminiTurnResponse;
}

export async function queryAnswerInterpreter(userRawInput: string): Promise<AnswerValue> {
  const normalized = userRawInput.trim().toLowerCase();
  if (["yes", "y", "yeah", "yep", "correct", "right", "true", "sure"].includes(normalized)) return "yes";
  if (["no", "n", "nope", "nah", "incorrect", "wrong", "false"].includes(normalized)) return "no";
  if (["kind of", "kind_of", "sort of", "sorta", "maybe", "partially", "sometimes"].includes(normalized)) return "kind_of";
  if (["unknown", "i don't know", "dont know", "not sure", "unsure"].includes(normalized)) return "unknown";

  try {
    const vertexAI = await getVertexAI();
    const model = await getModel(vertexAI, {
      model: GEMINI_MODEL,
      generationConfig: { temperature: 0, maxOutputTokens: 64, responseMimeType: "application/json" },
    });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: `Normalize this 20 Questions answer to JSON {"answer":"yes|no|kind_of|unknown"}: ${userRawInput}` }] }],
    });
    const text = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return "unknown";
    return answerInterpreterSchema.parse(JSON.parse(text)).answer;
  } catch {
    return "unknown";
  }
}

export function validateResponse(response: unknown): { valid: boolean; error?: string } {
  const parsed = geminiTurnResponseSchema.safeParse(response);
  if (parsed.success) return { valid: true };
  return { valid: false, error: parsed.error.message };
}
