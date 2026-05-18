import { answerInterpreterSchema, geminiTurnResponseSchema } from "./schemas.js";
import { buildStrategistPrompt } from "./prompts.js";
import type { AnswerValue, GameReferencePack, GeminiTurnResponse } from "./types.js";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-001";
const PROJECT_ID = process.env.GCLOUD_PROJECT || "tars-20-questions";
const LOCATION = "us-central1";

// Vertex AI REST endpoint — no SDK dependency.
// Cloud Function service account handles auth via metadata server.
const BASE_URL = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${GEMINI_MODEL}:generateContent`;

async function fetchWithAuth(body: unknown): Promise<Record<string, unknown>> {
  // In Cloud Functions, the metadata server provides the access token.
  const tokenRes = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=https://aiplatform.googleapis.com",
    { headers: { "Metadata-Flavor": "Google" } }
  );
  const token = await tokenRes.text();

  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Vertex AI API error ${res.status}: ${errText}`);
  }

  return res.json() as Promise<Record<string, unknown>>;
}

function extractText(response: Record<string, unknown>): string | undefined {
  const candidates = response.candidates as Array<Record<string, unknown>> | undefined;
  if (!candidates?.length) return undefined;
  const content = candidates[0].content as Record<string, unknown> | undefined;
  if (!content) return undefined;
  const parts = content.parts as Array<Record<string, unknown>> | undefined;
  return parts?.[0]?.text as string | undefined;
}

export async function queryStrategist(
  systemPrompt: string,
  referencePack: GameReferencePack,
  conversationHistory: string
): Promise<GeminiTurnResponse> {
  const fullPrompt = buildStrategistPrompt(referencePack, conversationHistory);

  const body = {
    contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
    },
  };

  const response = await fetchWithAuth(body);
  const text = extractText(response);
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
    const body = {
      contents: [{
        role: "user",
        parts: [{ text: `Normalize this 20 Questions answer to JSON {"answer":"yes|no|kind_of|unknown"}: ${userRawInput}` }],
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 64, responseMimeType: "application/json" },
    };
    const response = await fetchWithAuth(body);
    const text = extractText(response);
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
