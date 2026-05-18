import { logger } from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { advanceGame as advanceGameLoop } from "./game.js";
import { createGame, getGame as getGameDoc, getTurns } from "./firestore.js";
import { advanceGameInputSchema, getGameInputSchema, startGameInputSchema } from "./schemas.js";

function requireAnonymousAuth(auth: { uid: string; token: { firebase?: { sign_in_provider?: string } } } | undefined): string {
  if (!auth) {
    throw new HttpsError("unauthenticated", "Anonymous Firebase auth is required.");
  }
  const provider = auth.token.firebase?.sign_in_provider;
  if (provider !== "anonymous") {
    throw new HttpsError("permission-denied", "Only anonymous Firebase auth sessions may call this function.");
  }
  return auth.uid;
}

export const startGame = onCall(async (request) => {
  try {
    requireAnonymousAuth(request.auth);
    const input = startGameInputSchema.parse(request.data ?? {});
    const gameId = await createGame(input.mode, input.domain);
    const firstTurn = await advanceGameLoop({ gameId });
    logger.info("Started game", { gameId, mode: input.mode, domain: input.domain ?? "character" });
    return { ok: true, gameId, turn: firstTurn };
  } catch (error) {
    logger.error("startGame failed", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", error instanceof Error ? error.message : "Unable to start game.");
  }
});

export const advanceGame = onCall(async (request) => {
  try {
    requireAnonymousAuth(request.auth);
    const input = advanceGameInputSchema.parse(request.data);
    const turn = await advanceGameLoop(input);
    logger.info("Advanced game", { gameId: input.gameId, turn: turn.turn, action: turn.action });
    return { ok: true, turn };
  } catch (error) {
    logger.error("advanceGame failed", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", error instanceof Error ? error.message : "Unable to advance game.");
  }
});

export const getGame = onCall(async (request) => {
  try {
    requireAnonymousAuth(request.auth);
    const input = getGameInputSchema.parse(request.data);
    const game = await getGameDoc(input.gameId);
    const turns = await getTurns(input.gameId);
    logger.info("Fetched game", { gameId: input.gameId, turnCount: turns.length });
    return { ok: true, game, turns };
  } catch (error) {
    logger.error("getGame failed", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", error instanceof Error ? error.message : "Unable to fetch game.");
  }
});
