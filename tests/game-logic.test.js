import { describe, expect, it } from "vitest";
import { bestAttributeFor, canGuess, filterCandidates, generateFallbackQuestion } from "../src/game-logic.js";

const attributes = [
  { key: "is_human", question: "Is your character human?" },
  { key: "wears_cape", question: "Does your character wear a cape?" },
  { key: "is_fast", question: "Is your character known for being fast?" }
];

const characters = [
  { id: "batman", canonicalName: "Batman", aliases: ["Bruce Wayne"], popularityPrior: 0.99 },
  { id: "sonic", canonicalName: "Sonic", aliases: ["Sonic the Hedgehog"], popularityPrior: 0.98 },
  { id: "mario", canonicalName: "Mario", aliases: ["Jumpman"], popularityPrior: 1 }
];

const assertions = {
  batman: { is_human: "yes", wears_cape: "yes", is_fast: "no" },
  sonic: { is_human: "no", wears_cape: "no", is_fast: "yes" },
  mario: { is_human: "yes", wears_cape: "no", is_fast: "kind_of" }
};

describe("filterCandidates", () => {
  it("scores matching candidates above mismatches", () => {
    const candidates = filterCandidates([{ attributeKey: "is_human", answer: "yes" }], { characters, assertions });

    expect(candidates.map((candidate) => candidate.id)).toEqual(["mario", "batman"]);
    expect(candidates[0].score).toBeGreaterThan(candidates[1].score);
  });

  it("removes rejected character ids before scoring", () => {
    const candidates = filterCandidates([], {
      characters,
      assertions,
      excludedCharacterIds: new Set(["mario"])
    });

    expect(candidates.map((candidate) => candidate.id)).not.toContain("mario");
  });
});

describe("bestAttributeFor", () => {
  it("chooses the highest-split unused attribute", () => {
    const candidates = filterCandidates([], { characters, assertions });
    const attribute = bestAttributeFor(candidates, [{ attributeKey: "is_human", answer: "yes" }], { attributes, assertions });

    expect(attribute.key).toBe("is_fast");
  });
});

describe("generateFallbackQuestion", () => {
  it("does not guess before the minimum guess turn even with one candidate", () => {
    const gameState = {
      turn: 7,
      knownAnswers: [],
      candidates: [{ ...characters[0], score: 10 }],
      unusedAttributes: attributes
    };

    const turn = generateFallbackQuestion(gameState, { attributes, characters, assertions });

    expect(turn.action).toBe("question");
  });

  it("keeps asking questions before the high-confidence guess window", () => {
    const gameState = {
      turn: 10,
      knownAnswers: [],
      candidates: [
        { ...characters[0], score: 10 },
        { ...characters[1], score: 1 }
      ],
      unusedAttributes: attributes
    };

    const turn = generateFallbackQuestion(gameState, { attributes, characters, assertions });

    expect(turn.action).toBe("question");
    expect(turn.attributeKey).toBeTruthy();
  });

  it("makes a high-confidence guess at turn 12 when the lead is large", () => {
    const gameState = {
      turn: 12,
      knownAnswers: [
        { attributeKey: "is_human", answer: "yes" },
        { attributeKey: "wears_cape", answer: "yes" },
        { attributeKey: "is_fast", answer: "no" },
        { attributeKey: "is_human", answer: "yes" },
        { attributeKey: "wears_cape", answer: "yes" },
        { attributeKey: "is_fast", answer: "no" },
        { attributeKey: "is_human", answer: "yes" },
        { attributeKey: "wears_cape", answer: "yes" },
        { attributeKey: "is_fast", answer: "no" }
      ],
      candidates: [
        { ...characters[0], score: 10 },
        { ...characters[1], score: 1 }
      ],
      unusedAttributes: attributes
    };

    const turn = generateFallbackQuestion(gameState, { attributes, characters, assertions });

    expect(turn.action).toBe("guess");
    expect(turn.guess.entityName).toBe("Batman");
  });

  it("marks the turn-20 guess as final", () => {
    const gameState = {
      turn: 20,
      knownAnswers: [],
      candidates: [{ ...characters[1], score: 2 }],
      unusedAttributes: attributes
    };

    const turn = generateFallbackQuestion(gameState, { attributes, characters, assertions });

    expect(turn.action).toBe("guess");
    expect(turn.confidenceBand).toBe("final_guess");
  });

  it("can ask from gameState data when no options are passed", () => {
    const gameState = {
      turn: 1,
      candidates: characters,
      unusedAttributes: attributes
    };

    const turn = generateFallbackQuestion(gameState);

    expect(turn.action).toBe("question");
    expect(turn.questionText).toBe("Is your character human?");
    expect(turn.attributeKey).toBe("is_human");
  });

  it("keeps asking from unused attributes when no candidates remain", () => {
    const gameState = {
      turn: 1,
      candidates: [],
      unusedAttributes: attributes
    };

    const turn = generateFallbackQuestion(gameState);

    expect(turn.action).toBe("question");
    expect(turn.attributeKey).toBe("is_human");
  });

  it("makes a final soft-scored guess at turn 20 when strict candidates are empty", () => {
    const gameState = {
      turn: 20,
      knownAnswers: [{ attributeKey: "is_human", answer: "no" }],
      candidates: [],
      unusedAttributes: attributes.slice(1)
    };

    const turn = generateFallbackQuestion(gameState, { attributes, characters, assertions });

    expect(turn.action).toBe("guess");
    expect(turn.confidenceBand).toBe("final_guess");
  });

  it("switches to guess-only mode when attributes are exhausted", () => {
    const gameState = {
      turn: 6,
      knownAnswers: attributes.map((attribute) => ({ attributeKey: attribute.key, answer: "yes" })),
      candidates: [{ ...characters[0], score: 10 }],
      unusedAttributes: [],
      attributesExhausted: true
    };

    expect(canGuess(gameState, gameState.candidates)).toBe(true);
    expect(generateFallbackQuestion(gameState, { attributes, characters, assertions }).action).toBe("guess");
  });
});
