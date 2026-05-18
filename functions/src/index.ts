import { onCall } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import { HttpsError } from "firebase-functions/v2/https";
import { startGameInputSchema, advanceGameInputSchema, getGameInputSchema } from "./schemas.js";

function requireAnonymousAuth(auth: CallableRequest["auth"]): string {
  if (!auth) throw new HttpsError("unauthenticated", "Anonymous Firebase auth is required.");
  const provider = auth.token?.firebase?.sign_in_provider;
  if (provider !== "anonymous") throw new HttpsError("permission-denied", "Only anonymous Firebase auth sessions may call this function.");
  return auth.uid;
}

function ok(data: Record<string, unknown>) {
  return { ...data, ok: true };
}

export const startGame = onCall(async (request: CallableRequest) => {
  try {
    requireAnonymousAuth(request.auth);
    const input = startGameInputSchema.parse(request.data ?? {});
    const { createGame } = await import("./firestore.js");
    const { advanceGame: advanceGameLoop } = await import("./game.js") as { advanceGame: (args: { gameId: string; previousAnswer?: string }) => Promise<unknown> };
    const gameId = await createGame(input.mode, input.domain);
    const firstTurn = await advanceGameLoop({ gameId });
    console.log("Started game", { gameId, mode: input.mode });
    return ok({ gameId, turn: firstTurn });
  } catch (error) {
    console.error("startGame failed", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error instanceof Error ? error.message : "Unable to start game.");
  }
});

export const advanceGameFn = onCall(async (request: CallableRequest) => {
  try {
    requireAnonymousAuth(request.auth);
    const input = advanceGameInputSchema.parse(request.data);
    const { advanceGame: advanceGameLoop } = await import("./game.js") as { advanceGame: (args: { gameId: string; previousAnswer?: string }) => Promise<unknown> };
    const turn = await advanceGameLoop(input);
    console.log("Advanced game", { gameId: input.gameId, turn: (turn as Record<string, unknown>).turn });
    return ok({ turn });
  } catch (error) {
    console.error("advanceGame failed", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error instanceof Error ? error.message : "Unable to advance game.");
  }
});

export const getGame = onCall(async (request: CallableRequest) => {
  try {
    requireAnonymousAuth(request.auth);
    const input = getGameInputSchema.parse(request.data);
    const { getGame: getGameDoc, getTurns } = await import("./firestore.js") as {
      getGame: (id: string) => Promise<unknown>;
      getTurns: (id: string) => Promise<unknown>;
    };
    const game = await getGameDoc(input.gameId);
    const turns = await getTurns(input.gameId);
    console.log("Fetched game", { gameId: input.gameId });
    return ok({ game, turns });
  } catch (error) {
    console.error("getGame failed", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error instanceof Error ? error.message : "Unable to fetch game.");
  }
});
