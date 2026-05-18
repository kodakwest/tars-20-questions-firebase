import type { AnswerValue, Attribute, AttributeStats, Entity, EntityAssertion } from "./types.js";

export const DATASET_VERSION = "phase-1a-seed";

export const seedAttributes: Attribute[] = [
  ["is_fictional", "Is fictional", "Is your character fictional?"],
  ["from_video_game", "From a video game", "Did your character originate in a video game?"],
  ["from_movie", "From a movie", "Is your character strongly associated with movies?"],
  ["is_human", "Is human", "Is your character human?"],
  ["is_superhero", "Is a superhero", "Is your character a superhero?"],
  ["wears_cape", "Wears a cape", "Does your character wear a cape?"],
  ["uses_weapons", "Uses weapons", "Does your character commonly use weapons?"],
  ["associated_with_nintendo", "Associated with Nintendo", "Is your character associated with Nintendo?"],
  ["is_animated", "Is animated", "Is your character usually animated or drawn?"],
  ["has_superpowers", "Has superpowers", "Does your character have superpowers?"],
  ["is_mascot_character", "Mascot character", "Is your character a mascot character?"],
  ["is_antagonist", "Is an antagonist", "Is your character usually an antagonist?"],
  ["wears_red", "Wears red", "Is red a major part of your character's look?"],
  ["wears_armor", "Wears armor", "Does your character wear armor?"],
  ["is_fast", "Is fast", "Is your character known for being fast?"]
].map(([key, label, template]) => ({
  key,
  label,
  appliesToDomains: ["character"],
  questionTemplates: [template],
  askStage: ["early", "narrowing", "high_confidence"],
  active: true
}));

export const seedEntities: Entity[] = [
  entity("mario", "Mario", ["video_game", "nintendo", "mascot"], ["Jumpman"], "Nintendo's red-clad platforming hero.", 1),
  entity("sonic", "Sonic", ["video_game", "mascot"], ["Sonic the Hedgehog"], "A blue hedgehog famous for speed.", 0.98),
  entity("kratos", "Kratos", ["video_game", "warrior"], ["Ghost of Sparta"], "The weapon-wielding protagonist of God of War.", 0.86),
  entity("batman", "Batman", ["comic", "superhero", "detective"], ["Bruce Wayne"], "A caped DC vigilante detective.", 0.99),
  entity("superman", "Superman", ["comic", "superhero", "alien"], ["Clark Kent", "Kal-El"], "A caped DC superhero with immense powers.", 0.99),
  entity("spider-man", "Spider-Man", ["comic", "superhero"], ["Peter Parker", "Spiderman"], "A web-slinging Marvel superhero.", 0.98),
  entity("glados", "GLaDOS", ["video_game", "ai", "antagonist"], ["Genetic Lifeform and Disk Operating System"], "The sarcastic AI antagonist from Portal.", 0.78),
  entity("master-chief", "Master Chief", ["video_game", "soldier"], ["John-117"], "The armored Spartan protagonist of Halo.", 0.92),
  entity("link", "Link", ["video_game", "nintendo", "hero"], ["Hero of Hyrule"], "Nintendo's sword-wielding hero of Hyrule.", 0.97),
  entity("samus", "Samus", ["video_game", "nintendo", "bounty_hunter"], ["Samus Aran"], "The armored bounty hunter from Metroid.", 0.88),
  entity("pikachu", "Pikachu", ["video_game", "nintendo", "mascot"], ["Pika"], "The electric Pokemon mascot.", 0.99),
  entity("cloud-strife", "Cloud Strife", ["video_game", "swordsman"], ["Cloud"], "The oversized-sword protagonist from Final Fantasy VII.", 0.88),
  entity("geralt-of-rivia", "Geralt of Rivia", ["video_game", "fantasy", "hunter"], ["Geralt", "The White Wolf"], "A monster hunter from The Witcher.", 0.9),
  entity("aloy", "Aloy", ["video_game", "hunter"], ["Aloy of the Nora"], "The bow-wielding hero of Horizon.", 0.82),
  entity("ellie", "Ellie", ["video_game", "survivor"], ["Ellie Williams"], "A survivor from The Last of Us.", 0.84),
  entity("lara-croft", "Lara Croft", ["video_game", "adventurer"], ["Tomb Raider"], "An adventuring archaeologist and treasure hunter.", 0.91),
  entity("nathan-drake", "Nathan Drake", ["video_game", "adventurer"], ["Nate Drake"], "A wisecracking treasure hunter from Uncharted.", 0.84),
  entity("darth-vader", "Darth Vader", ["movie", "villain", "sci_fi"], ["Anakin Skywalker"], "The armored Sith Lord from Star Wars.", 0.99),
  entity("indiana-jones", "Indiana Jones", ["movie", "adventurer"], ["Indy"], "A whip-carrying archaeologist adventurer.", 0.95),
  entity("hermione-granger", "Hermione Granger", ["book", "movie", "wizard"], ["Hermione"], "A brilliant witch from Harry Potter.", 0.93),
  entity("sherlock-holmes", "Sherlock Holmes", ["book", "detective"], ["Holmes"], "A legendary consulting detective.", 0.92),
  entity("jack-sparrow", "Jack Sparrow", ["movie", "pirate"], ["Captain Jack Sparrow"], "A chaotic pirate captain.", 0.92),
  entity("gandalf", "Gandalf", ["book", "movie", "wizard"], ["Mithrandir", "Gandalf the Grey"], "A wizard from Middle-earth.", 0.96),
  entity("frodo", "Frodo", ["book", "movie", "hobbit"], ["Frodo Baggins"], "The ring-bearer hobbit from Middle-earth.", 0.9),
  entity("tony-stark", "Tony Stark", ["comic", "superhero", "inventor"], ["Iron Man"], "A genius inventor inside a powered armor suit.", 0.98)
];

const attributeKeys = seedAttributes.map((attribute) => attribute.key);

const valuesByEntity: Record<string, AnswerValue[]> = {
  "mario": ["yes", "yes", "no", "yes", "no", "no", "no", "yes", "yes", "no", "yes", "no", "yes", "no", "kind_of"],
  "sonic": ["yes", "yes", "no", "no", "no", "no", "no", "no", "yes", "kind_of", "yes", "no", "no", "no", "yes"],
  "kratos": ["yes", "yes", "no", "yes", "no", "no", "yes", "no", "yes", "kind_of", "no", "no", "yes", "kind_of", "no"],
  "batman": ["yes", "no", "kind_of", "yes", "yes", "yes", "yes", "no", "yes", "no", "no", "no", "no", "kind_of", "no"],
  "superman": ["yes", "no", "kind_of", "kind_of", "yes", "yes", "no", "no", "yes", "yes", "no", "no", "kind_of", "no", "yes"],
  "spider-man": ["yes", "no", "kind_of", "yes", "yes", "no", "kind_of", "no", "yes", "yes", "no", "no", "yes", "no", "yes"],
  "glados": ["yes", "yes", "no", "no", "no", "no", "no", "no", "yes", "no", "no", "yes", "no", "no", "no"],
  "master-chief": ["yes", "yes", "no", "yes", "no", "no", "yes", "no", "yes", "kind_of", "no", "no", "no", "yes", "no"],
  "link": ["yes", "yes", "no", "kind_of", "no", "no", "yes", "yes", "yes", "kind_of", "no", "no", "no", "kind_of", "no"],
  "samus": ["yes", "yes", "no", "yes", "no", "no", "yes", "yes", "yes", "no", "no", "no", "no", "yes", "no"],
  "pikachu": ["yes", "yes", "kind_of", "no", "no", "no", "no", "yes", "yes", "yes", "yes", "no", "no", "no", "yes"],
  "cloud-strife": ["yes", "yes", "no", "yes", "no", "no", "yes", "no", "yes", "kind_of", "no", "no", "no", "kind_of", "no"],
  "geralt-of-rivia": ["yes", "yes", "kind_of", "yes", "no", "no", "yes", "no", "yes", "kind_of", "no", "no", "no", "kind_of", "no"],
  "aloy": ["yes", "yes", "no", "yes", "no", "no", "yes", "no", "yes", "no", "no", "no", "no", "kind_of", "no"],
  "ellie": ["yes", "yes", "kind_of", "yes", "no", "no", "yes", "no", "yes", "no", "no", "no", "no", "no", "no"],
  "lara-croft": ["yes", "yes", "yes", "yes", "no", "no", "yes", "no", "yes", "no", "no", "no", "no", "no", "no"],
  "nathan-drake": ["yes", "yes", "no", "yes", "no", "no", "yes", "no", "yes", "no", "no", "no", "no", "no", "no"],
  "darth-vader": ["yes", "no", "yes", "yes", "no", "yes", "yes", "no", "yes", "yes", "no", "yes", "no", "yes", "no"],
  "indiana-jones": ["yes", "no", "yes", "yes", "no", "no", "yes", "no", "no", "no", "no", "no", "no", "no", "no"],
  "hermione-granger": ["yes", "no", "yes", "yes", "no", "no", "yes", "no", "no", "yes", "no", "no", "no", "no", "no"],
  "sherlock-holmes": ["yes", "no", "kind_of", "yes", "no", "no", "kind_of", "no", "no", "no", "no", "no", "no", "no", "no"],
  "jack-sparrow": ["yes", "no", "yes", "yes", "no", "no", "yes", "no", "no", "no", "no", "no", "kind_of", "no", "no"],
  "gandalf": ["yes", "no", "yes", "kind_of", "no", "no", "yes", "no", "no", "yes", "no", "no", "no", "no", "no"],
  "frodo": ["yes", "no", "yes", "kind_of", "no", "no", "yes", "no", "no", "no", "no", "no", "no", "no", "no"],
  "tony-stark": ["yes", "no", "yes", "yes", "yes", "no", "yes", "no", "yes", "no", "no", "no", "yes", "yes", "yes"]
};

export const seedAssertions: EntityAssertion[] = seedEntities.flatMap((entityItem) => {
  const values = valuesByEntity[entityItem.id] ?? [];
  return attributeKeys.map((attributeKey, index) => {
    const value = values[index] ?? "unknown";
    return {
      entityId: entityItem.id,
      attributeKey,
      value,
      numericValue: numericAnswer(value),
      confidence: value === "unknown" ? 0.2 : 0.95
    };
  });
});

export const seedAttributeStats: AttributeStats[] = seedAttributes.map((attribute) => {
  const matching = seedAssertions.filter((assertion) => assertion.attributeKey === attribute.key);
  const counts = {
    yes: matching.filter((assertion) => assertion.value === "yes").length,
    no: matching.filter((assertion) => assertion.value === "no").length,
    kind_of: matching.filter((assertion) => assertion.value === "kind_of").length,
    unknown: matching.filter((assertion) => assertion.value === "unknown").length
  };
  const known = counts.yes + counts.no + counts.kind_of;
  const splitQuality = known === 0 ? 0 : 1 - Math.abs(counts.yes - counts.no) / known;
  return {
    attributeKey: attribute.key,
    domain: "character",
    counts,
    coverage: known / seedEntities.length,
    splitQuality,
    deadAttribute: known === 0 || counts.yes === 0 || counts.no === 0
  };
});

function entity(
  id: string,
  canonicalName: string,
  entityTypes: string[],
  aliases: string[],
  description: string,
  popularityPrior: number
): Entity {
  return {
    id,
    canonicalName,
    domain: "character",
    entityTypes,
    aliases,
    description,
    popularityPrior,
    status: "active",
    datasetVersion: DATASET_VERSION
  };
}

export function numericAnswer(answer: AnswerValue): number {
  if (answer === "yes") {
    return 1;
  }
  if (answer === "kind_of") {
    return 0.5;
  }
  return 0;
}
