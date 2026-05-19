# AGENTS.md — TARS 20 Questions Firebase

## Project Context
Single-page HTML app for a 20 Questions game where an AI (Gemini) guesses what character the user is thinking of. Deployed to Firebase Hosting at https://tars-20-questions.web.app. No build step, no backend, no Cloud Functions (except deployed functions/ dir which is unwired).

## Key Files
- `public/index.html` — entire application (CSS + HTML + JS in one file, ~96KB)
- `public/src/game-logic.js` — shared game logic (no longer imported, functions inlined into index.html)
- `tests/game-logic.test.js` — 11 unit tests (vitest)
- `tests/e2e/game-flow.spec.js` — Playwright E2E tests

## Architecture
- **Game state** managed client-side (25 characters, 15 attributes, assertion map, rejectedGuesses[], wrongGuessNames)
- **Gemini API** called via direct REST `fetch()` to `firebasevertexai.googleapis.com` (model: gemini-3.1-flash-lite)
- **Fallback** deterministic engine if Gemini fails — uses `confidenceProfile()` with dynamic thresholds
- **No dependencies** other than the browser's `fetch()` API and Firebase App SDK (for auth/config)

## UAT Checklist

### Visual / Rendering
1. Page loads at https://tars-20-questions.web.app
2. Start screen shows: TARS logo, mode toggle (AI Thinks / You Think), Tap to Begin button
3. Game screen shows: TARS avatar, status indicator, question counter, chat log, answer buttons (Yes/Kind Of/No)
4. Win screen shows after game ends with correct message and Play Again button
5. Mobile responsive at 375px width

### Gameplay — AI Thinks Mode
6. Tapping "Tap to Begin" starts a game
7. TARS asks a yes/no question with questionType: generic, contextual, disambiguating, creative, or fallback
8. Answering "Yes" advances the game
9. TARS asks a DIFFERENT question each time (no repeats by attributeKey or normalized text)
10. Generic questions have budgets per turn range (3/turns 1-5, 2/turns 6-12, 1/turns 13-20)
11. Guesses only happen when confidence gate permits (min 9 known answers, score margin 6+, top score 8+)
12. Confirming "Yes" on a guess ends the game as a win
13. Saying "No" on a guess records it with supporting attribute evidence — next prompt includes wrong guess context
14. Wrong guesses penalize characters sharing entityTypes (archetype break)
15. If all 25 candidates are eliminated, re-runs with relaxed filtering — game NEVER ends with "out of candidates"
16. After 20 questions, game ends

### Gameplay — You Think Mode
17. Select "You Think" mode, pick a category (Character/Object/Place)
18. TARS asks questions to guess what you're thinking of
19. Same flow as AI Thinks from the AI side

### Tech / Errors
20. Open browser console — no errors on page load
21. Gemini 429 errors fall back gracefully to deterministic engine
22. Save game persists across refresh (includes rejectedGuesses, questionType history)
23. On game end, console logs questionType distribution (genericAfterTurn6%, duplicate%, contextualCreative count)

## Question Variety v1 (May 19)
- `questionType` field in Gemini JSON schema and turn records: generic | contextual | disambiguating | creative | fallback
- Creative question guidance in system prompt: appearance, role, origin, abilities, setting, iconic traits, media/franchise clues
- Generic question budgets per turn range, with enforcement text when budget exceeded
- `likelyArchetypes` / `recommendedQuestionDimensions` injected into user prompt
- Creative attributeKey normalization: snake_case, max 36 chars, max 5 parts, no "and"/"or", no conflict with fixed keys
- `questionTypeStats()` with distribution, duplicate rate, invalid creative rate — logged to console on game end
- Fallback questions tagged as `"fallback"` type
- `isFixedAttributeKey()` to separate fixed attribute answers from creative ones for scoring

## Fixed Issues (May 19)
- **Creative questions blocked:** `normalizeTurnResponse()` had `!turn.attributeKey || isDuplicateQuestion()` — caught ALL creative questions and forced fallback. Fixed: removed `!turn.attributeKey`.
- **Prompt forced fixed attributes:** Codex added `MUST be exactly one of` constraint. Fixed: `Creative questions may omit attributeKey.`
- **System prompt contradiction:** System prompt said "include attributeKey" with valid keys list. Fixed to allow creative questions.
- **"I'm out of candidates" crash:** Game ended at turn 9 when filter eliminated all 25 chars. Fixed: `allowHardMismatches` fallback.
- **Early guessing:** `canGuess()` used minGuessTurn=8. Fixed: `confidenceProfile()` requires min 9 answers, margin 6+, score 8+.
- **Wrong guess tracking:** Guesses outside CHARACTERS list were invisible. Fixed: `state.rejectedGuesses` tracks ALL wrong guesses.
- **Model 429 quota:** Switched from `gemini-3-flash-preview` (20/day) to `gemini-3.1-flash-lite` (1500/day).

## Remaining Issues
- 429 billing error still occurs on some IPs (free tier quota exceeded on tars-20-questions AI Studio project)
- Question variety improvements need Gemini to be responding (not fallback) to see effect

## If UAT Finds Issues
Report what specifically failed (exact text, console output, screenshots in network tab) and file a GitHub issue or open a PR with the fix.
