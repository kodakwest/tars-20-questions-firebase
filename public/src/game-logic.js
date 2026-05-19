export const MAX_QUESTIONS = 20;

function excludedIdSet(excludedCharacterIds) {
  if (excludedCharacterIds instanceof Set) return excludedCharacterIds;
  if (Array.isArray(excludedCharacterIds)) return new Set(excludedCharacterIds);
  return new Set();
}

export function filterCandidates(knownAnswers = [], options = {}) {
  const {
    characters = [],
    assertions = {},
    excludedCharacterIds = new Set(),
    allowHardMismatches = false
  } = options;
  const excluded = excludedIdSet(excludedCharacterIds);

  return characters
    .filter((character) => !excluded.has(character.id))
    .map((character) => {
      const score = knownAnswers.reduce((total, answer) => {
        const expected = assertions[character.id]?.[answer.attributeKey];
        if (expected === answer.answer) return total + 2;
        if (expected === "kind_of" || answer.answer === "kind_of") return total + 0.75;
        return total - 2;
      }, character.popularityPrior || 0);
      const hardMismatch = knownAnswers.some((answer) => {
        const expected = assertions[character.id]?.[answer.attributeKey];
        return expected && expected !== "kind_of" && answer.answer !== "kind_of" && expected !== answer.answer;
      });
      return { ...character, score, hardMismatch };
    })
    .filter((candidate) => allowHardMismatches || !candidate.hardMismatch || knownAnswers.length > 8)
    .sort((a, b) => b.score - a.score || b.popularityPrior - a.popularityPrior);
}

export function bestAttributeFor(candidates = [], knownAnswers = [], options = {}) {
  const {
    attributes = [],
    assertions = {}
  } = options;
  const used = new Set(knownAnswers.map((answer) => answer.attributeKey));

  return attributes
    .filter((attribute) => !used.has(attribute.key))
    .map((attribute) => {
      const counts = candidates.reduce((acc, candidate) => {
        const value = assertions[candidate.id]?.[attribute.key] || "unknown";
        acc[value] = (acc[value] || 0) + 1;
        return acc;
      }, { yes: 0, no: 0, kind_of: 0, unknown: 0 });
      const known = counts.yes + counts.no + counts.kind_of;
      const split = known ? 1 - Math.abs(counts.yes - counts.no) / known : 0;
      return { attribute, split, known };
    })
    .sort((a, b) => b.split - a.split || b.known - a.known)[0]?.attribute;
}

export function canGuess(gameState, candidates = [], options = {}) {
  const {
    maxQuestions = MAX_QUESTIONS,
    minKnownAnswers = 9,
    minScore = 8,
    minMargin = 6
  } = options;
  const top = candidates[0];
  const second = candidates[1];
  const knownCount = Array.isArray(gameState.knownAnswers) ? gameState.knownAnswers.length : 0;
  const forcedFinal = Boolean(top) && gameState.turn >= maxQuestions;
  const attributesExhausted = Boolean(top) && Boolean(gameState.attributesExhausted);
  const margin = top ? top.score - (second?.score ?? -Infinity) : -Infinity;
  const closeCandidates = candidates.filter((candidate) => top && top.score - candidate.score <= 2.25).length;
  const confidentEnough =
    Boolean(top) &&
    knownCount >= minKnownAnswers &&
    top.score >= minScore &&
    margin >= minMargin &&
    closeCandidates <= 1;

  return forcedFinal || attributesExhausted || confidentEnough;
}

export function generateFallbackQuestion(gameState, options = {}) {
  const {
    attributes = [],
    characters = [],
    assertions = {},
    maxQuestions = MAX_QUESTIONS
  } = options;
  const knownAnswers = Array.isArray(gameState.knownAnswers) ? gameState.knownAnswers : [];
  const unusedAttributes = Array.isArray(gameState.unusedAttributes) ? gameState.unusedAttributes : [];
  const candidates = Array.isArray(gameState.candidates) ? gameState.candidates : characters;
  const questionCandidates = candidates.length
    ? candidates
    : filterCandidates(knownAnswers, { characters, assertions, allowHardMismatches: true });
  const top = candidates[0];
  const shouldGuess = canGuess(gameState, candidates, { maxQuestions });

  if (shouldGuess && top) {
    return {
      action: "guess",
      status: "in_progress",
      turn: gameState.turn,
      questionText: `Is it ${top.canonicalName}?`,
      spokenText: `Is it ${top.canonicalName}?`,
      confidenceBand: gameState.turn >= maxQuestions ? "final_guess" : "high_confidence",
      guess: {
        id: top.id,
        entityName: top.canonicalName,
        confidence: gameState.turn >= maxQuestions ? "medium" : "high"
      }
    };
  }

  if (gameState.turn >= maxQuestions && questionCandidates[0]) {
    const finalTop = questionCandidates[0];
    return {
      action: "guess",
      status: "in_progress",
      turn: gameState.turn,
      questionText: `Is it ${finalTop.canonicalName}?`,
      spokenText: `Is it ${finalTop.canonicalName}?`,
      confidenceBand: "final_guess",
      guess: {
        id: finalTop.id,
        entityName: finalTop.canonicalName,
        confidence: "medium"
      }
    };
  }

  const attribute = bestAttributeFor(questionCandidates, knownAnswers, { attributes: unusedAttributes, assertions }) || unusedAttributes[0];
  if (!attribute) {
    const finalTop = top || questionCandidates[0];
    if (finalTop) {
      return {
        action: "guess",
        status: "in_progress",
        turn: gameState.turn,
        questionText: `Is it ${finalTop.canonicalName}?`,
        spokenText: `Is it ${finalTop.canonicalName}?`,
        confidenceBand: "final_guess",
        guess: {
          id: finalTop.id,
          entityName: finalTop.canonicalName,
          confidence: "medium"
        }
      };
    }
    return {
      action: "game_over",
      status: "lost",
      turn: gameState.turn,
      questionText: "I'm out of usable questions.",
      spokenText: "I'm out of usable questions.",
      confidenceBand: "final_guess",
      guess: null
    };
  }

  return {
    action: "question",
    status: "in_progress",
    turn: gameState.turn,
    questionText: attribute.question,
    spokenText: attribute.question,
    confidenceBand: gameState.turn < 5 ? "early" : gameState.turn < 12 ? "narrowing" : "high_confidence",
    attributeKey: attribute.key
  };
}
