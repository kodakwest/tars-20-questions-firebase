import { addTurn,
  getAllEntities,
  getAssertionsForEntities,
  getAttributeStats,
  getAttributesForDomain,
  getGame,
  getTurns,
  recordTurnAnswer,
  saveOutcome,
  updateGame
} from "./firestore.js";
import { queryAnswerInterpreter, queryStrategist, validateResponse } from "./gemini.js";
import { ORCHESTRATOR_PROMPT, STRATEGIST_PROMPT } from "./prompts.js";
import { buildReferencePack, filterEntitiesByKnownAnswers } from "./reference-pack.js";
import { numericAnswer } from "./seed-data.js";
import type {
  AdvanceGameInput,
  Attribute,
  ClientTurnResponse,
  ConfidenceBand,
  Entity,
  EntityAssertion,
  GameReferencePack,
  GeminiTurnResponse,
  Turn
} from "./types.js";

export async function advanceGame(data: AdvanceGameInput): Promise<ClientTurnResponse> {
  const game = await getGame(data.gameId);
  if (game.status !== "in_progress") {
    const turns = await getTurns(game.id);
    const lastTurn = lastPlayableTurn(turns);
    return clientResponse(game.id, game.status, game.turn, "game_over", lastTurn?.questionText ?? "Game over.", lastTurn?.spokenText ?? "Game over.", null, null, game.confidenceBand);
  }

  let turns = await getTurns(game.id);
  if (data.previousAnswer) {
    const interpretedAnswer = await queryAnswerInterpreter(data.previousAnswer);
    const pendingTurn = lastPendingTurn(turns);
    if (pendingTurn) {
      await recordTurnAnswer(game.id, pendingTurn.turn, interpretedAnswer);
      pendingTurn.userAnswer = interpretedAnswer;
      pendingTurn.numericAnswer = numericAnswer(interpretedAnswer);

      if (pendingTurn.type === "guess") {
        const completed = await finishGuessConfirmation(game.id, game.datasetVersion, pendingTurn, interpretedAnswer, game.maxTurns);
        if (completed) {
          return completed;
        }
      }
    }
  }

  turns = await getTurns(game.id);
  const domain = game.inferredDomain ?? "character";
  const rejectedGuesses = rejectedGuessNames(turns);
  const allEntities = (await getAllEntities())
    .filter((entity) => entity.domain === domain)
    .filter((entity) => !rejectedGuesses.has(entity.canonicalName.toLowerCase()));
  const allAssertions = await getAssertionsForEntities(allEntities.map((entity) => entity.id));
  const filteredCandidates = filterEntitiesByKnownAnswers(allEntities, allAssertions, turns);
  const candidates = filteredCandidates.length > 0 ? filteredCandidates : allEntities;
  const attributes = await getAttributesForDomain(domain);
  const attributeStats = await getAttributeStats(attributes.map((attribute) => attribute.key), domain);
  const referencePack = buildReferencePack(game.id, turns, candidates, allAssertions, attributes, attributeStats);
  const nextTurnNumber = game.turn + 1;

  let strategistResponse: GeminiTurnResponse;
  if (nextTurnNumber >= game.maxTurns) {
    strategistResponse = forceGuess(candidates, referencePack);
  } else {
    strategistResponse = await nextStrategistResponse(referencePack, turns, attributes);
  }

  const sanitizedResponse = sanitizeStrategistResponse(strategistResponse, referencePack, attributes, candidates);
  const turn = await makeTurn(nextTurnNumber, sanitizedResponse, candidates, allAssertions);
  await addTurn(game.id, turn);
  await updateGame(game.id, {
    turn: nextTurnNumber,
    confidenceBand: sanitizedResponse.confidenceBand
  });

  return clientResponse(
    game.id,
    "in_progress",
    nextTurnNumber,
    sanitizedResponse.action,
    turn.questionText,
    turn.spokenText,
    turn.attributeKey,
    sanitizedResponse.guess ?? null,
    sanitizedResponse.confidenceBand
  );
}

async function finishGuessConfirmation(
  gameId: string,
  datasetVersion: string,
  guessTurn: Turn,
  answer: "yes" | "no" | "kind_of" | "unknown",
  maxTurns: number
): Promise<ClientTurnResponse | null> {
  if (answer === "yes") {
    const finalGuess = guessTurn.questionText.replace(/^Is it\s+/i, "").replace(/\?$/u, "");
    await updateGame(gameId, { status: "won" });
    await saveOutcome({
      gameId,
      datasetVersion,
      result: "win",
      targetEntityName: finalGuess,
      finalGuess,
      turnsUsed: guessTurn.turn,
      failureReasons: [],
      userProvidedFact: null
    });
    return clientResponse(gameId, "won", guessTurn.turn, "game_over", "I win. Obviously.", "I win. Obviously.", null, null, "final_guess");
  }

  if (guessTurn.turn >= maxTurns) {
    await updateGame(gameId, { status: "lost" });
    await saveOutcome({
      gameId,
      datasetVersion,
      result: "loss",
      targetEntityName: "",
      finalGuess: guessTurn.questionText,
      turnsUsed: guessTurn.turn,
      failureReasons: ["Final guess was rejected."],
      userProvidedFact: null
    });
    return clientResponse(gameId, "lost", guessTurn.turn, "game_over", "You win. Statistically annoying.", "You win. Statistically annoying.", null, null, "final_guess");
  }

  return null;
}

async function nextStrategistResponse(
  referencePack: GameReferencePack,
  turns: Turn[],
  attributes: Attribute[]
): Promise<GeminiTurnResponse> {
  if (!process.env.GEMINI_API_KEY) {
    return localStrategist(referencePack, attributes);
  }
  const conversationHistory = turns
    .filter((turn) => turn.turn > 0)
    .map((turn) => `Turn ${turn.turn}: ${turn.questionText} Answer: ${turn.userAnswer ?? "pending"}`)
    .join("\n");
  const response = await queryStrategist(`${ORCHESTRATOR_PROMPT}\n\n${STRATEGIST_PROMPT}`, referencePack, conversationHistory);
  const validation = validateResponse(response);
  if (!validation.valid) {
    return localStrategist(referencePack, attributes);
  }
  return response;
}

function sanitizeStrategistResponse(
  response: GeminiTurnResponse,
  referencePack: GameReferencePack,
  attributes: Attribute[],
  candidates: Entity[]
): GeminiTurnResponse {
  if (response.action === "guess") {
    return response.guess ? response : forceGuess(candidates, referencePack);
  }
  const validAttribute = response.attributeKey && attributes.some((attribute) => attribute.key === response.attributeKey);
  const repeated = response.attributeKey ? referencePack.askedAttributes.includes(response.attributeKey) : false;
  if (!validAttribute || repeated) {
    return localStrategist(referencePack, attributes);
  }
  return {
    ...response,
    questionText: response.questionText ?? questionForAttribute(response.attributeKey, attributes),
    spokenText: response.spokenText ?? response.questionText ?? questionForAttribute(response.attributeKey, attributes)
  };
}

function localStrategist(referencePack: GameReferencePack, attributes: Attribute[]): GeminiTurnResponse {
  if (referencePack.contradictions.length > 0) {
    const fallbackAttribute = firstUnaskedAttribute(referencePack, attributes);
    return {
      action: "clarification",
      questionText: questionForAttribute(fallbackAttribute, attributes),
      spokenText: "Your answers are fighting each other. Let's isolate the problem.",
      attributeKey: fallbackAttribute,
      confidenceBand: "narrowing",
      rationaleSummary: "Contradiction recovery question."
    };
  }

  if (referencePack.topCandidateHints.length === 1 && referencePack.turn >= 4) {
    return {
      action: "guess",
      questionText: `Is it ${referencePack.topCandidateHints[0]?.name}?`,
      spokenText: `I have a suspect. Is it ${referencePack.topCandidateHints[0]?.name}?`,
      guess: { entityName: referencePack.topCandidateHints[0]?.name ?? "the character", confidence: "high" },
      confidenceBand: "high_confidence",
      rationaleSummary: "Single leading candidate remains."
    };
  }

  const recommended = referencePack.recommendedAttributes[0]?.attributeKey ?? firstUnaskedAttribute(referencePack, attributes);
  return {
    action: "question",
    questionText: questionForAttribute(recommended, attributes),
    spokenText: questionForAttribute(recommended, attributes),
    attributeKey: recommended,
    confidenceBand: confidenceForTurn(referencePack.turn),
    rationaleSummary: "Selected highest split-quality unasked attribute."
  };
}

function forceGuess(candidates: Entity[], referencePack: GameReferencePack): GeminiTurnResponse {
  const candidate = candidates.slice().sort((left, right) => right.popularityPrior - left.popularityPrior)[0];
  const name = candidate?.canonicalName ?? referencePack.topCandidateHints[0]?.name ?? "your character";
  return {
    action: "guess",
    questionText: `Is it ${name}?`,
    spokenText: `Final guess. Is it ${name}?`,
    guess: { entityName: name, confidence: "medium" },
    confidenceBand: "final_guess",
    rationaleSummary: "Turn limit reached or a final guess was required."
  };
}

async function makeTurn(
  turnNumber: number,
  response: GeminiTurnResponse,
  candidates: Entity[],
  assertions: Map<string, EntityAssertion[]>
): Promise<Turn> {
  const type = response.action === "guess" ? "guess" : response.action === "clarification" ? "clarification" : "question";
  return {
    turn: turnNumber,
    type,
    questionText: response.questionText ?? (response.guess ? `Is it ${response.guess.entityName}?` : "Can you clarify that?"),
    spokenText: response.spokenText ?? response.questionText ?? "Proceeding with minimal confidence. Familiar.",
    attributeKey: response.attributeKey ?? null,
    userAnswer: null,
    numericAnswer: null,
    candidateSnapshot: {
      top: scoreCandidates(candidates, assertions).slice(0, 8),
      candidateCount: candidates.length
    },
    geminiRationaleSummary: response.rationaleSummary,
    createdAt: (await import("firebase-admin/firestore")).Timestamp.now()
  };
}

function scoreCandidates(candidates: Entity[], assertions: Map<string, EntityAssertion[]>): { entityId: string; score: number }[] {
  return candidates
    .map((entity) => {
      const assertionConfidence = (assertions.get(entity.id) ?? []).reduce((sum, assertion) => sum + assertion.confidence, 0);
      return { entityId: entity.id, score: Number((entity.popularityPrior + assertionConfidence / 100).toFixed(3)) };
    })
    .sort((left, right) => right.score - left.score);
}

function lastPendingTurn(turns: Turn[]): Turn | null {
  const playable = turns
    .filter((turn) => (turn.type === "question" || turn.type === "guess" || turn.type === "clarification") && turn.userAnswer === null)
    .sort((left, right) => right.turn - left.turn);
  return playable[0] ?? null;
}

function lastPlayableTurn(turns: Turn[]): Turn | null {
  const playable = turns
    .filter((turn) => turn.type === "question" || turn.type === "guess" || turn.type === "clarification")
    .sort((left, right) => right.turn - left.turn);
  return playable[0] ?? null;
}

function rejectedGuessNames(turns: Turn[]): Set<string> {
  return new Set(turns
    .filter((turn) => turn.type === "guess" && turn.userAnswer === "no")
    .map((turn) => turn.questionText.replace(/^Is it\s+/i, "").replace(/\?$/u, "").trim().toLowerCase())
    .filter((name) => name.length > 0));
}

function questionForAttribute(attributeKey: string | undefined, attributes: Attribute[]): string {
  const attribute = attributes.find((item) => item.key === attributeKey);
  return attribute?.questionTemplates[0] ?? "Is your character commonly known in pop culture?";
}

function firstUnaskedAttribute(referencePack: GameReferencePack, attributes: Attribute[]): string {
  return attributes.find((attribute) => !referencePack.askedAttributes.includes(attribute.key))?.key ?? attributes[0]?.key ?? "is_fictional";
}

function confidenceForTurn(turn: number): ConfidenceBand {
  if (turn >= 16) {
    return "final_guess";
  }
  if (turn >= 10) {
    return "high_confidence";
  }
  if (turn >= 5) {
    return "narrowing";
  }
  return "early";
}

function clientResponse(
  gameId: string,
  status: ClientTurnResponse["status"],
  turn: number,
  action: ClientTurnResponse["action"],
  questionText: string,
  spokenText: string,
  attributeKey: string | null,
  guess: ClientTurnResponse["guess"],
  confidenceBand: ConfidenceBand
): ClientTurnResponse {
  return {
    gameId,
    status,
    turn,
    action,
    questionText,
    spokenText,
    attributeKey,
    guess,
    confidenceBand
  };
}
