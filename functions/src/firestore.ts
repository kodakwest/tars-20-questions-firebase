import { initializeApp, getApps } from "firebase-admin/app";
import { FieldValue, Firestore, Timestamp, getFirestore } from "firebase-admin/firestore";
import type {
  AnswerValue,
  Attribute,
  AttributeStats,
  ConfidenceBand,
  Entity,
  EntityAssertion,
  Game,
  GameMode,
  Outcome,
  Turn
} from "./types.js";
import {
  DATASET_VERSION,
  numericAnswer,
  seedAssertions,
  seedAttributeStats,
  seedAttributes,
  seedEntities
} from "./seed-data.js";

if (getApps().length === 0) {
  initializeApp();
}

const db: Firestore = getFirestore();

export async function createGame(mode: GameMode, domain?: string): Promise<string> {
  const gameRef = db.collection("games").doc();
  const now = Timestamp.now();
  const game: Game = {
    id: gameRef.id,
    mode,
    status: "in_progress",
    datasetVersion: DATASET_VERSION,
    turn: 0,
    maxTurns: 20,
    inferredDomain: domain ?? "character",
    confidenceBand: "early",
    createdAt: now,
    updatedAt: now
  };
  const initialTurn: Turn = {
    turn: 0,
    type: "result",
    questionText: "Game created.",
    spokenText: "Game created.",
    attributeKey: null,
    userAnswer: null,
    numericAnswer: null,
    candidateSnapshot: { top: [], candidateCount: 0 },
    geminiRationaleSummary: "Initial game state.",
    createdAt: now
  };

  const batch = db.batch();
  batch.set(gameRef, game);
  batch.set(gameRef.collection("turns").doc(turnDocId(0)), initialTurn);
  await batch.commit();
  return gameRef.id;
}

export async function getGame(gameId: string): Promise<Game> {
  const snapshot = await db.collection("games").doc(gameId).get();
  if (!snapshot.exists) {
    throw new Error(`Game ${gameId} not found`);
  }
  return toGame(snapshot.id, snapshot.data());
}

export async function getTurns(gameId: string): Promise<Turn[]> {
  const snapshot = await db.collection("games").doc(gameId).collection("turns").orderBy("turn", "asc").get();
  return snapshot.docs.map((doc) => toTurn(doc.data()));
}

export async function addTurn(gameId: string, turn: Turn): Promise<void> {
  await db.collection("games").doc(gameId).collection("turns").doc(turnDocId(turn.turn)).set(turn);
}

export async function recordTurnAnswer(gameId: string, turn: number, answer: AnswerValue): Promise<void> {
  await db.collection("games").doc(gameId).collection("turns").doc(turnDocId(turn)).update({
    userAnswer: answer,
    numericAnswer: numericAnswer(answer)
  });
}

export async function updateGame(gameId: string, updates: Partial<Omit<Game, "id" | "createdAt">>): Promise<void> {
  await db.collection("games").doc(gameId).update({
    ...updates,
    updatedAt: FieldValue.serverTimestamp()
  });
}

export async function getAllEntities(): Promise<Entity[]> {
  const snapshot = await db.collection("entities").where("status", "==", "active").get();
  if (snapshot.empty) {
    return seedEntities;
  }
  return snapshot.docs.map((doc) => toEntity(doc.id, doc.data()));
}

export async function getAssertionsForEntities(entityIds: string[]): Promise<Map<string, EntityAssertion[]>> {
  const result = new Map<string, EntityAssertion[]>();
  entityIds.forEach((entityId) => result.set(entityId, []));
  if (entityIds.length === 0) {
    return result;
  }

  const chunks = chunk(entityIds, 30);
  for (const idChunk of chunks) {
    const snapshot = await db.collection("entityAssertions").where("entityId", "in", idChunk).get();
    snapshot.docs.forEach((doc) => {
      const assertion = toEntityAssertion(doc.data());
      const existing = result.get(assertion.entityId) ?? [];
      existing.push(assertion);
      result.set(assertion.entityId, existing);
    });
  }

  const loadedCount = Array.from(result.values()).reduce((sum, assertions) => sum + assertions.length, 0);
  if (loadedCount === 0) {
    seedAssertions
      .filter((assertion) => entityIds.includes(assertion.entityId))
      .forEach((assertion) => {
        const existing = result.get(assertion.entityId) ?? [];
        existing.push(assertion);
        result.set(assertion.entityId, existing);
      });
  }
  return result;
}

export async function getAttributeStats(attributeKeys: string[], domain: string): Promise<Map<string, AttributeStats>> {
  const result = new Map<string, AttributeStats>();
  if (attributeKeys.length === 0) {
    return result;
  }
  for (const keyChunk of chunk(attributeKeys, 30)) {
    const snapshot = await db.collection("attributeStats")
      .where("domain", "==", domain)
      .where("attributeKey", "in", keyChunk)
      .get();
    snapshot.docs.forEach((doc) => {
      const stats = toAttributeStats(doc.data());
      result.set(stats.attributeKey, stats);
    });
  }
  if (result.size === 0) {
    seedAttributeStats
      .filter((stats) => stats.domain === domain && attributeKeys.includes(stats.attributeKey))
      .forEach((stats) => result.set(stats.attributeKey, stats));
  }
  return result;
}

export async function getAttributesForDomain(domain: string): Promise<Attribute[]> {
  const snapshot = await db.collection("attributes")
    .where("active", "==", true)
    .where("appliesToDomains", "array-contains", domain)
    .get();
  if (snapshot.empty) {
    return seedAttributes.filter((attribute) => attribute.active && attribute.appliesToDomains.includes(domain));
  }
  return snapshot.docs.map((doc) => toAttribute(doc.id, doc.data()));
}

export async function saveOutcome(outcome: Outcome): Promise<void> {
  await db.collection("outcomes").doc(outcome.gameId).set({
    ...outcome,
    createdAt: FieldValue.serverTimestamp()
  });
}

function turnDocId(turn: number): string {
  return turn.toString().padStart(3, "0");
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function toGame(id: string, data: FirebaseFirestore.DocumentData | undefined): Game {
  const record = objectRecord(data);
  return {
    id,
    mode: stringValue(record.mode) === "ai_thinks" ? "ai_thinks" : "user_thinks",
    status: gameStatus(record.status),
    datasetVersion: stringValue(record.datasetVersion) || DATASET_VERSION,
    turn: numberValue(record.turn),
    maxTurns: numberValue(record.maxTurns) || 20,
    inferredDomain: nullableString(record.inferredDomain),
    confidenceBand: confidenceBand(record.confidenceBand),
    createdAt: timestampValue(record.createdAt),
    updatedAt: timestampValue(record.updatedAt)
  };
}

function toTurn(data: FirebaseFirestore.DocumentData | undefined): Turn {
  const record = objectRecord(data);
  return {
    turn: numberValue(record.turn),
    type: turnType(record.type),
    questionText: stringValue(record.questionText),
    spokenText: stringValue(record.spokenText),
    attributeKey: nullableString(record.attributeKey),
    userAnswer: nullableAnswer(record.userAnswer),
    numericAnswer: nullableNumber(record.numericAnswer),
    candidateSnapshot: candidateSnapshot(record.candidateSnapshot),
    geminiRationaleSummary: stringValue(record.geminiRationaleSummary),
    createdAt: timestampValue(record.createdAt)
  };
}

function toEntity(id: string, data: FirebaseFirestore.DocumentData | undefined): Entity {
  const record = objectRecord(data);
  return {
    id,
    canonicalName: stringValue(record.canonicalName),
    domain: entityDomain(record.domain),
    entityTypes: stringArray(record.entityTypes),
    aliases: stringArray(record.aliases),
    description: stringValue(record.description),
    popularityPrior: numberValue(record.popularityPrior),
    status: stringValue(record.status) === "deprecated" ? "deprecated" : "active",
    datasetVersion: stringValue(record.datasetVersion) || DATASET_VERSION
  };
}

function toEntityAssertion(data: FirebaseFirestore.DocumentData | undefined): EntityAssertion {
  const record = objectRecord(data);
  const value = answerValue(record.value);
  return {
    entityId: stringValue(record.entityId),
    attributeKey: stringValue(record.attributeKey),
    value,
    numericValue: numberValue(record.numericValue),
    confidence: numberValue(record.confidence)
  };
}

function toAttribute(id: string, data: FirebaseFirestore.DocumentData | undefined): Attribute {
  const record = objectRecord(data);
  return {
    key: stringValue(record.key) || id,
    label: stringValue(record.label),
    appliesToDomains: stringArray(record.appliesToDomains),
    questionTemplates: stringArray(record.questionTemplates),
    askStage: stringArray(record.askStage),
    active: booleanValue(record.active)
  };
}

function toAttributeStats(data: FirebaseFirestore.DocumentData | undefined): AttributeStats {
  const record = objectRecord(data);
  const counts = objectRecord(record.counts);
  return {
    attributeKey: stringValue(record.attributeKey),
    domain: stringValue(record.domain),
    counts: {
      yes: numberValue(counts.yes),
      no: numberValue(counts.no),
      kind_of: numberValue(counts.kind_of),
      unknown: numberValue(counts.unknown)
    },
    coverage: numberValue(record.coverage),
    splitQuality: numberValue(record.splitQuality),
    deadAttribute: booleanValue(record.deadAttribute)
  };
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value));
  }
  return {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown): boolean {
  return typeof value === "boolean" ? value : false;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function timestampValue(value: unknown): Timestamp {
  return value instanceof Timestamp ? value : Timestamp.now();
}

function answerValue(value: unknown): AnswerValue {
  if (value === "yes" || value === "no" || value === "kind_of" || value === "unknown") {
    return value;
  }
  return "unknown";
}

function nullableAnswer(value: unknown): AnswerValue | null {
  if (value === null || value === undefined) {
    return null;
  }
  return answerValue(value);
}

function confidenceBand(value: unknown): ConfidenceBand {
  if (value === "narrowing" || value === "high_confidence" || value === "final_guess") {
    return value;
  }
  return "early";
}

function gameStatus(value: unknown): Game["status"] {
  if (value === "won" || value === "lost" || value === "abandoned") {
    return value;
  }
  return "in_progress";
}

function entityDomain(value: unknown): Entity["domain"] {
  if (value === "object" || value === "place") {
    return value;
  }
  return "character";
}

function turnType(value: unknown): Turn["type"] {
  if (value === "guess" || value === "clarification" || value === "result") {
    return value;
  }
  return "question";
}

function candidateSnapshot(value: unknown): Turn["candidateSnapshot"] {
  const record = objectRecord(value);
  const topRaw = Array.isArray(record.top) ? record.top : [];
  const top = topRaw.map((item) => {
    const itemRecord = objectRecord(item);
    return {
      entityId: stringValue(itemRecord.entityId),
      score: numberValue(itemRecord.score)
    };
  }).filter((item) => item.entityId.length > 0);
  return {
    top,
    candidateCount: numberValue(record.candidateCount)
  };
}
