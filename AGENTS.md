# AGENTS.md — TARS 20 Questions Firebase

## Project Context
Single-page HTML app for a 20 Questions game where an AI (Gemini) guesses what character the user is thinking of. Deployed to Firebase Hosting at https://tars-20-questions.web.app. No build step, no backend, no Cloud Functions.

## Key Files
- `public/index.html` — entire application (CSS + HTML + JS in one file)
- No other source files matter for UAT

## Architecture
- **Game state** managed client-side (25 characters, 15 attributes, assertion map)
- **Gemini API** called via direct REST `fetch()` to `firebasevertexai.googleapis.com`
- **Fallback** deterministic entropy engine if Gemini fails
- **No dependencies** other than the browser's `fetch()` API

## UAT Checklist

### Visual / Rendering
1. Page loads at https://tars-20-questions.web.app
2. Start screen shows: TARS logo, mode toggle (AI Thinks / You Think), Tap to Begin button
3. Game screen shows: TARS avatar, status indicator, question counter, chat log, answer buttons (Yes/Kind Of/No)
4. Win screen shows after game ends with correct message and Play Again button
5. Mobile responsive at 375px width

### Gameplay — AI Thinks Mode
6. Tapping "Tap to Begin" starts a game
7. TARS asks a yes/no question
8. Answering "Yes" advances the game
9. TARS asks a DIFFERENT question next (no repeats)
10. After ~5-10 questions, TARS makes a guess
11. Confirming "Yes" on a guess ends the game as a win
12. Saying "No" on a guess continues the game
13. After 20 questions, game ends

### Gameplay — You Think Mode
14. Select "You Think" mode, pick a category (Character/Object/Place)
15. TARS asks questions to guess what you're thinking of
16. Same flow as AI Thinks from the AI side

### Tech / Errors
17. Open browser console — no errors on page load
18. No "Gemini call failed" warnings during gameplay
19. No 403/429 errors in Network tab
20. Save game persists across refresh

## Known Fixed Issues
- Previously: blank page (fixed by replacing Firebase SDK with direct REST)
- Previously: 403 API error (fixed by routing through firebasevertexai.googleapis.com)
- Previously: JSON parse errors (fixed by enforcing valid attributeKey values in prompt)
- Previously: app repeating itself (should be fixed by attributeKey constraint)

## If UAT Finds Issues
Report what specifically failed (exact text, console output, screenshots in network tab) and file a GitHub issue or open a PR with the fix.
