import { expect, test } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "https://tars-20-questions.web.app";

function geminiPayload(turn) {
  return {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify(turn)
            }
          ]
        }
      }
    ]
  };
}

test("starts a deployed game, advances without repeated questions, and persists save", async ({ page }) => {
  const consoleProblems = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleProblems.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleProblems.push(error.message));

  const turns = [
    {
      action: "question",
      questionText: "Is your character fictional?",
      spokenText: "Is your character fictional?",
      attributeKey: "is_fictional"
    },
    {
      action: "question",
      questionText: "Did your character originate in a video game?",
      spokenText: "Did your character originate in a video game?",
      attributeKey: "from_video_game"
    }
  ];

  await page.route("https://firebasevertexai.googleapis.com/**", async (route) => {
    const turn = turns.shift() || {
      action: "question",
      questionText: "Is your character human?",
      spokenText: "Is your character human?",
      attributeKey: "is_human"
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(geminiPayload(turn))
    });
  });

  await page.goto(BASE_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.getByRole("heading", { name: "TARS 20 Questions" })).toBeVisible();
  await expect(page.getByRole("button", { name: "AI Thinks" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Tap to Begin" }).click();

  const firstQuestion = page.getByText("Is your character fictional?").first();
  await expect(firstQuestion).toBeVisible();
  await page.getByRole("button", { name: /^Yes/ }).click();

  await expect(page.getByText("Did your character originate in a video game?").first()).toBeVisible();
  await expect(page.getByText("Is your character fictional?")).toHaveCount(1);

  await page.reload();
  await expect(page.getByText(/Resume Game/)).toBeVisible();
  await expect(page.getByText(/Q2\/20/)).toBeVisible();

  expect(consoleProblems).toEqual([]);
});
