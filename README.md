<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="StoryMe creates illustrated and narrated children's stories matched to a reading level">
</p>

<p align="center">
  <a href="https://ai.studio/apps/bc984f46-9a43-46eb-a557-900dd22901da"><strong>Open in Google AI Studio</strong></a>
</p>

<p align="center"><strong>English</strong> · <a href="./README.zh-CN.md">中文</a></p>

StoryMe is an interactive reading companion for children. It estimates a reader's level, lets them choose characters, places, activities, and values, then generates a five-page story with illustrations, narration, translations, questions, and word help.

## A story made for this reader

- Reading-level check with level-specific word sets
- Guided story choices for character, location, activity, and value
- Five-page AI-generated story structure
- Per-page illustration and text-to-speech narration
- Translation and word-level definitions, examples, and pronunciation
- A story helper for simple follow-up questions
- Import PDF, DOCX, or TXT content up to 500 words
- English, French, Chinese, Korean, and Spanish interface support
- Optional Firebase sign-in, saved books, reading history, and cross-device progress

## Run locally

Prerequisites: Node.js, a Gemini API key, and the Firebase configuration already expected by the project.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Set `GEMINI_API_KEY` in `.env.local`. Validate a change with:

```bash
npm run lint
npm run build
```

## Story flow

```text
reading check → choose story ingredients → generate five pages
             → illustrate + narrate → read, ask, translate, revisit
```

Gemini provides structured story text, page prompts, translations, questions, images, speech, and word support. Firebase Auth, Firestore, and Storage support accounts and saved story assets; signed-out users can still use the local experience where the interface permits it.

## Main modules

| Path | Responsibility |
| --- | --- |
| [`src/App.tsx`](./src/App.tsx) | Reading assessment, creation flow, reader, library, and persistence orchestration |
| [`src/services/gemini.ts`](./src/services/gemini.ts) | Story, image, speech, helper, and vocabulary generation |
| [`src/services/fileParser.ts`](./src/services/fileParser.ts) | PDF and DOCX extraction with input truncation |
| [`src/services/authService.ts`](./src/services/authService.ts) | Email and Google sign-in plus reader profiles |
| [`src/services/storageService.ts`](./src/services/storageService.ts) | Generated image and audio storage |
| [`src/translations.ts`](./src/translations.ts) | Five-language interface copy |

## Safety and product boundary

StoryMe is a prototype, not a supervised literacy curriculum. Generated stories, translations, definitions, images, narration, and reading-level estimates can be wrong or inappropriate. A parent, teacher, or caregiver should review generated material before a child uses it.

Firebase rules and quotas must be reviewed before a public deployment. Do not expose unrestricted generation or storage endpoints, and do not treat the current reading-level interaction as a clinical or educational assessment.
