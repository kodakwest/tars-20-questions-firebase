import type {
  AnswerValue,
  Attribute,
  AttributeStats,
  Entity,
  EntityAssertion,
  GameReferencePack,
  Turn
} from "./types.js";

export function buildReferencePack(
  gameId: string,
  turns: Turn[],
  entities: Entity[],
  assertions: Map<string, EntityAssertion[]>,
  attributes: Attribute[],
  stats: Map<string, AttributeStats>
): GameReferencePack {
  const knownAnswers = turns
    .filter((turn) => turn.attributeKey !== null && turn.userAnswer !== null)
    .map((turn) => ({
      attributeKey: turn.attributeKey ?? "",
      answer: turn.userAnswer ?? "unknown"
    }))
    .filter((answer) => answer.attributeKey.length > 0);

  const askedAttributes = Array.from(new Set(knownAnswers.map((answer) => answer.attributeKey)));
  const matchingEntities = entities.filter((entity) => entityMatchesKnownAnswers(entity.id, assertions, knownAnswers));
  const candidatePool = matchingEntities.length > 0 ? matchingEntities : entities;
  const unaskedAttributes = attributes.filter((attribute) => !askedAttributes.includes(attribute.key));

  const recommendedAttributes = unaskedAttributes
    .map((attribute) => {
      const stat = stats.get(attribute.key);
      return {
        attributeKey: attribute.key,
        splitQuality: stat?.splitQuality ?? 0,
        reason: stat
          ? `Coverage ${Math.round(stat.coverage * 100)}%, split quality ${stat.splitQuality.toFixed(2)}.`
          : "No precomputed stats available; useful as a fallback discriminator."
      };
    })
    .filter((item) => item.splitQuality > 0)
    .sort((left, right) => right.splitQuality - left.splitQuality)
    .slice(0, 10);

  const avoidAttributes = askedAttributes.map((attributeKey) => ({
    attributeKey,
    reason: "Already asked in this game."
  }));

  return {
    gameId,
    turn: Math.max(0, ...turns.map((turn) => turn.turn)),
    knownAnswers,
    askedAttributes,
    candidateClusters: buildCandidateClusters(candidatePool, unaskedAttributes, assertions),
    topCandidateHints: buildTopCandidateHints(candidatePool, knownAnswers, unaskedAttributes, assertions, attributes),
    recommendedAttributes,
    avoidAttributes,
    contradictions: matchingEntities.length === 0 && knownAnswers.length > 0
      ? ["No active candidates match all known non-ambiguous answers. Ask a broad clarification."]
      : [],
    instruction: "Use this as reference only. Do not treat it as a script."
  };
}

export function filterEntitiesByKnownAnswers(
  entities: Entity[],
  assertions: Map<string, EntityAssertion[]>,
  turns: Turn[]
): Entity[] {
  const knownAnswers = turns
    .filter((turn) => turn.attributeKey !== null && turn.userAnswer !== null)
    .map((turn) => ({ attributeKey: turn.attributeKey ?? "", answer: turn.userAnswer ?? "unknown" }))
    .filter((answer) => answer.attributeKey.length > 0);
  return entities.filter((entity) => entityMatchesKnownAnswers(entity.id, assertions, knownAnswers));
}

function entityMatchesKnownAnswers(
  entityId: string,
  assertions: Map<string, EntityAssertion[]>,
  knownAnswers: { attributeKey: string; answer: string }[]
): boolean {
  const entityAssertions = assertions.get(entityId) ?? [];
  return knownAnswers.every((known) => {
    if (known.answer === "kind_of" || known.answer === "unknown") {
      return true;
    }
    const assertion = entityAssertions.find((item) => item.attributeKey === known.attributeKey);
    if (!assertion || assertion.value === "unknown" || assertion.value === "kind_of") {
      return true;
    }
    return assertion.value === known.answer;
  });
}

function buildCandidateClusters(
  entities: Entity[],
  attributes: Attribute[],
  assertions: Map<string, EntityAssertion[]>
): GameReferencePack["candidateClusters"] {
  const clusterCounts = new Map<string, Entity[]>();
  entities.forEach((entity) => {
    const labels = entity.entityTypes.length > 0 ? entity.entityTypes : ["character"];
    labels.forEach((label) => {
      const existing = clusterCounts.get(label) ?? [];
      existing.push(entity);
      clusterCounts.set(label, existing);
    });
  });

  return Array.from(clusterCounts.entries())
    .map(([label, clusteredEntities]) => ({
      label,
      estimatedCount: clusteredEntities.length,
      usefulAttributes: usefulAttributesForCluster(clusteredEntities, attributes, assertions)
    }))
    .sort((left, right) => right.estimatedCount - left.estimatedCount)
    .slice(0, 5);
}

function usefulAttributesForCluster(
  entities: Entity[],
  attributes: Attribute[],
  assertions: Map<string, EntityAssertion[]>
): string[] {
  return attributes
    .map((attribute) => {
      const values = entities
        .map((entity) => assertions.get(entity.id)?.find((assertion) => assertion.attributeKey === attribute.key)?.value)
        .filter((value): value is AnswerValue => value === "yes" || value === "no" || value === "kind_of");
      const hasYes = values.includes("yes");
      const hasNo = values.includes("no");
      return { key: attribute.key, useful: hasYes && hasNo };
    })
    .filter((item) => item.useful)
    .map((item) => item.key)
    .slice(0, 5);
}

function buildTopCandidateHints(
  entities: Entity[],
  knownAnswers: { attributeKey: string; answer: string }[],
  unaskedAttributes: Attribute[],
  assertions: Map<string, EntityAssertion[]>,
  attributes: Attribute[]
): GameReferencePack["topCandidateHints"] {
  const labels = new Map(attributes.map((attribute) => [attribute.key, attribute.label]));
  return entities
    .slice()
    .sort((left, right) => right.popularityPrior - left.popularityPrior)
    .slice(0, 8)
    .map((entity) => {
      const entityAssertions = assertions.get(entity.id) ?? [];
      const matchedFacts = knownAnswers
        .filter((known) => entityAssertions.some((assertion) => assertion.attributeKey === known.attributeKey && assertion.value === known.answer))
        .map((known) => `${labels.get(known.attributeKey) ?? known.attributeKey}: ${known.answer}`)
        .slice(0, 5);
      const missingUsefulFacts = unaskedAttributes
        .filter((attribute) => entityAssertions.some((assertion) => assertion.attributeKey === attribute.key && assertion.value !== "unknown"))
        .map((attribute) => attribute.key)
        .slice(0, 5);
      return {
        name: entity.canonicalName,
        matchedFacts,
        missingUsefulFacts
      };
    });
}
