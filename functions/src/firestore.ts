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

let _initialized = false;

async function init() {
  if (_initialized) return;
  _initialized = true;
  const { initializeApp, getApps } = await import("firebase-admin/app");
  if (getApps().length === 0) {
    initializeApp();
  }
}

async function db() {
  await init();
  const { getFirestore } = await import("firebase-admin/firestore");
  return getFirestore();
}

async function now() {
  await init();
  const { Timestamp } = await import("firebase-admin/firestore");
  return Timestamp.now();
}

async function serverTimestamp() {
  await init();
  const { FieldValue } = await import("firebase-admin/firestore");
  return FieldValue.serverTimestamp();
}

export async function createGame(mode: GameMode, domain?: string): Promise<string> {
  const firestore = await db();
  const timestamp = await now();
  const gameRef = firestore.collection("games").doc();
  const game: Game = {
    id: gameRef.id,
    mode,
    status: "in_progress",
    datasetVersion: DATASET_VERSION,
    turn: 0,
    maxTurns: 20,
    inferredDomain: domain ?? "character",
    confidenceBand: "early",
    createdAt: timestamp,
    updatedAt: timestamp
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
    createdAt: timestamp
  };
  const batch = firestore.batch();
  batch.set(gameRef, game as unknown as Record<string, unknown>);
  batch.set(gameRef.collection("turns").doc(turnDocId(0)), initialTurn as unknown as Record<string, unknown>);
  await batch.commit();
  return gameRef.id;
}

export async function getGame(gameId: string): Promise<Game> {
  const firestore = await db();
  const snapshot = await firestore.collection("games").doc(gameId).get();
  if (!snapshot.exists) {
    throw new Error(`Game ${gameId} not found`);
  }
  return toGame(snapshot.id, snapshot.data());
}

export async function getTurns(gameId: string): Promise<Turn[]> {
  const firestore = await db();
  const snapshot = await firestore.collection("games").doc(gameId).collection("turns").orderBy("turn", "asc").get();
  return snapshot.docs.map((doc) => toTurn(doc.data()));
}

export async function addTurn(gameId: string, turn: Turn): Promise<void> {
  const firestore = await db();
  await firestore.collection("games").doc(gameId).collection("turns").doc(turnDocId(turn.turn)).set(turn as unknown as Record<string, unknown>);
}

export async function recordTurnAnswer(gameId: string, turnNum: number, answer: AnswerValue): Promise<void> {
  const firestore = await db();
  await firestore.collection("games").doc(gameId).collection("turns").doc(turnDocId(turnNum)).update({
    userAnswer: answer,
    numericAnswer: numericAnswer(answer)
  });
}

export async function updateGame(gameId: string, updates: Record<string, unknown>): Promise<void> {
  const firestore = await db();
  await firestore.collection("games").doc(gameId).update({
    ...updates,
    updatedAt: await serverTimestamp()
  });
}

export async function getAllEntities(): Promise<Entity[]> {
  const firestore = await db();
  const snapshot = await firestore.collection("entities").where("status", "==", "active").get();
  if (snapshot.empty) {
    return seedEntities;
  }
  return snapshot.docs.map((doc) => toEntity(doc.id, doc.data()));
}

export async function getAssertionsForEntities(entityIds: string[]): Promise<Map<string, EntityAssertion[]>> {
  const result = new Map<string, EntityAssertion[]>();
  entityIds.forEach((entityId) => result.set(entityId, []));
  if (entityIds.length === 0) return result;

  const firestore = await db();
  const chunks = chunk(entityIds, 30);
  for (const idChunk of chunks) {
    const snapshot = await firestore.collection("entityAssertions").where("entityId", "in", idChunk).get();
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
  if (attributeKeys.length === 0) return result;

  const firestore = await db();
  for (const keyChunk of chunk(attributeKeys, 30)) {
    const snapshot = await firestore.collection("attributeStats")
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
  const firestore = await db();
  const snapshot = await firestore.collection("attributes")
    .where("active", "==", true)
    .where("appliesToDomains", "array-contains", domain)
    .get();
  if (snapshot.empty) {
    return seedAttributes.filter((a) => a.active && a.appliesToDomains.includes(domain));
  }
  return snapshot.docs.map((doc) => toAttribute(doc.id, doc.data()));
}

export async function saveOutcome(outcome: Outcome): Promise<void> {
  const firestore = await db();
  await firestore.collection("outcomes").doc(outcome.gameId).set({
    ...outcome,
    createdAt: await serverTimestamp()
  } as Record<string, unknown>);
}

// --- helpers ---

function turnDocId(turn: number): string { return turn.toString().padStart(3, "0"); }
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function toGame(id: string, data: Record<string, unknown> | undefined): Game {
  const r = obj(data);
  return {
    id, mode: str(r.mode) === "ai_thinks" ? "ai_thinks" : "user_thinks",
    status: gs(r.status), datasetVersion: str(r.datasetVersion) || DATASET_VERSION,
    turn: num(r.turn), maxTurns: num(r.maxTurns) || 20,
    inferredDomain: nstr(r.inferredDomain), confidenceBand: cb(r.confidenceBand),
    createdAt: ts(r.createdAt), updatedAt: ts(r.updatedAt)
  };
}
function toTurn(data: Record<string, unknown> | undefined): Turn {
  const r = obj(data);
  return {
    turn: num(r.turn), type: tt(r.type), questionText: str(r.questionText),
    spokenText: str(r.spokenText), attributeKey: nstr(r.attributeKey),
    userAnswer: nans(r.userAnswer), numericAnswer: nnum(r.numericAnswer),
    candidateSnapshot: cs(r.candidateSnapshot), geminiRationaleSummary: str(r.geminiRationaleSummary),
    createdAt: ts(r.createdAt)
  };
}
function toEntity(id: string, data: Record<string, unknown> | undefined): Entity {
  const r = obj(data);
  return {
    id, canonicalName: str(r.canonicalName), domain: ed(r.domain),
    entityTypes: sa(r.entityTypes), aliases: sa(r.aliases),
    description: str(r.description), popularityPrior: num(r.popularityPrior),
    status: str(r.status) === "deprecated" ? "deprecated" : "active",
    datasetVersion: str(r.datasetVersion) || DATASET_VERSION
  };
}
function toEntityAssertion(data: Record<string, unknown> | undefined): EntityAssertion {
  const r = obj(data);
  return { entityId: str(r.entityId), attributeKey: str(r.attributeKey), value: av(r.value), numericValue: num(r.numericValue), confidence: num(r.confidence) };
}
function toAttribute(id: string, data: Record<string, unknown> | undefined): Attribute {
  const r = obj(data);
  return { key: str(r.key) || id, label: str(r.label), appliesToDomains: sa(r.appliesToDomains), questionTemplates: sa(r.questionTemplates), askStage: sa(r.askStage), active: bool(r.active) };
}
function toAttributeStats(data: Record<string, unknown> | undefined): AttributeStats {
  const r = obj(data);
  const c = obj(r.counts);
  return { attributeKey: str(r.attributeKey), domain: str(r.domain), counts: { yes: num(c.yes), no: num(c.no), kind_of: num(c.kind_of), unknown: num(c.unknown) }, coverage: num(r.coverage), splitQuality: num(r.splitQuality), deadAttribute: bool(r.deadAttribute) };
}

function obj(v: unknown): Record<string, unknown> { return typeof v === "object" && v !== null ? Object.fromEntries(Object.entries(v)) : {}; }
function str(v: unknown): string { return typeof v === "string" ? v : ""; }
function nstr(v: unknown): string | null { return typeof v === "string" ? v : null; }
function num(v: unknown): number { return typeof v === "number" && Number.isFinite(v) ? v : 0; }
function nnum(v: unknown): number | null { return typeof v === "number" && Number.isFinite(v) ? v : null; }
function bool(v: unknown): boolean { return typeof v === "boolean" ? v : false; }
function sa(v: unknown): string[] { return Array.isArray(v) ? v.filter((i): i is string => typeof i === "string") : []; }
function ts(v: unknown): import("firebase-admin/firestore").Timestamp { return v as import("firebase-admin/firestore").Timestamp; }

function av(v: unknown): AnswerValue { return v === "yes" || v === "no" || v === "kind_of" || v === "unknown" ? v : "unknown"; }
function nans(v: unknown): AnswerValue | null { return v === null || v === undefined ? null : av(v); }
function cb(v: unknown): ConfidenceBand { return v === "narrowing" || v === "high_confidence" || v === "final_guess" ? v : "early"; }
function gs(v: unknown): Game["status"] { return v === "won" || v === "lost" || v === "abandoned" ? v : "in_progress"; }
function ed(v: unknown): Entity["domain"] { return v === "object" || v === "place" ? v : "character"; }
function tt(v: unknown): Turn["type"] { return v === "guess" || v === "clarification" || v === "result" ? v : "question"; }
function cs(v: unknown): Turn["candidateSnapshot"] {
  const r = obj(v);
  const topRaw = Array.isArray(r.top) ? r.top : [];
  return {
    top: topRaw.map((item) => { const ir = obj(item); return { entityId: str(ir.entityId), score: num(ir.score) }; }).filter((item) => item.entityId.length > 0),
    candidateCount: num(r.candidateCount)
  };
}
