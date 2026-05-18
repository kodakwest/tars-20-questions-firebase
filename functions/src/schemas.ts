import { z } from "zod";

export const gameModeSchema = z.enum(["user_thinks", "ai_thinks"]);
export const answerValueSchema = z.enum(["yes", "no", "kind_of", "unknown"]);
export const confidenceBandSchema = z.enum(["early", "narrowing", "high_confidence", "final_guess"]);

export const startGameInputSchema = z.object({
  mode: gameModeSchema.default("user_thinks"),
  domain: z.enum(["character", "object", "place"]).optional()
});

export const advanceGameInputSchema = z.object({
  gameId: z.string().min(1),
  previousAnswer: z.string().trim().min(1).optional()
});

export const getGameInputSchema = z.object({
  gameId: z.string().min(1)
});

export const geminiTurnResponseSchema = z.object({
  action: z.enum(["question", "guess", "clarification", "game_over"]),
  questionText: z.string().min(1).optional(),
  spokenText: z.string().min(1).optional(),
  attributeKey: z.string().min(1).optional(),
  guess: z.object({
    entityName: z.string().min(1),
    confidence: z.enum(["low", "medium", "high"])
  }).optional(),
  confidenceBand: confidenceBandSchema,
  rationaleSummary: z.string().min(1)
}).superRefine((value, context) => {
  if (value.action === "question" && !value.attributeKey) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "question responses require attributeKey" });
  }
  if (value.action === "guess" && !value.guess) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "guess responses require guess" });
  }
});

export const answerInterpreterSchema = z.object({
  answer: answerValueSchema
});
