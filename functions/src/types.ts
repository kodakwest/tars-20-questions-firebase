import type { Timestamp } from "firebase-admin/firestore";

export type GameMode = "user_thinks" | "ai_thinks";
export type GameStatus = "in_progress" | "won" | "lost" | "abandoned";
export type AnswerValue = "yes" | "no" | "kind_of" | "unknown";
export type ConfidenceBand = "early" | "narrowing" | "high_confidence" | "final_guess";

export interface Entity {
  id: string;
  canonicalName: string;
  domain: "character" | "object" | "place";
  entityTypes: string[];
  aliases: string[];
  description: string;
  popularityPrior: number;
  status: "active" | "deprecated";
  datasetVersion: string;
}

export interface EntityAssertion {
  entityId: string;
  attributeKey: string;
  value: AnswerValue;
  numericValue: number;
  confidence: number;
}

export interface Attribute {
  key: string;
  label: string;
  appliesToDomains: string[];
  questionTemplates: string[];
  askStage: string[];
  active: boolean;
}

export interface AttributeStats {
  attributeKey: string;
  domain: string;
  counts: { yes: number; no: number; kind_of: number; unknown: number };
  coverage: number;
  splitQuality: number;
  deadAttribute: boolean;
}

export interface Game {
  id: string;
  mode: GameMode;
  status: GameStatus;
  datasetVersion: string;
  turn: number;
  maxTurns: number;
  inferredDomain: string | null;
  confidenceBand: ConfidenceBand;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CandidateScore {
  entityId: string;
  score: number;
}

export interface Turn {
  turn: number;
  type: "question" | "guess" | "clarification" | "result";
  questionText: string;
  spokenText: string;
  attributeKey: string | null;
  userAnswer: AnswerValue | null;
  numericAnswer: number | null;
  candidateSnapshot: { top: CandidateScore[]; candidateCount: number };
  geminiRationaleSummary: string;
  createdAt: Timestamp;
}

export interface GameReferencePack {
  gameId: string;
  turn: number;
  knownAnswers: { attributeKey: string; answer: string }[];
  askedAttributes: string[];
  candidateClusters: { label: string; estimatedCount: number; usefulAttributes: string[] }[];
  topCandidateHints: { name: string; matchedFacts: string[]; missingUsefulFacts: string[] }[];
  recommendedAttributes: { attributeKey: string; splitQuality: number; reason: string }[];
  avoidAttributes: { attributeKey: string; reason: string }[];
  contradictions: string[];
  instruction: "Use this as reference only. Do not treat it as a script.";
}

export interface GeminiTurnResponse {
  action: "question" | "guess" | "clarification" | "game_over";
  questionText?: string;
  spokenText?: string;
  attributeKey?: string;
  guess?: { entityName: string; confidence: "low" | "medium" | "high" };
  confidenceBand: ConfidenceBand;
  rationaleSummary: string;
}

export interface Outcome {
  gameId: string;
  datasetVersion: string;
  result: "win" | "loss" | "abandoned";
  targetEntityName: string;
  finalGuess: string;
  turnsUsed: number;
  failureReasons: string[];
  userProvidedFact: { text: string; suggestedAttributes: string[] } | null;
}

export interface AdvanceGameInput {
  gameId: string;
  previousAnswer?: string;
}

export interface ClientTurnResponse {
  gameId: string;
  status: GameStatus;
  turn: number;
  action: GeminiTurnResponse["action"];
  questionText: string;
  spokenText: string;
  attributeKey: string | null;
  guess: GeminiTurnResponse["guess"] | null;
  confidenceBand: ConfidenceBand;
}
