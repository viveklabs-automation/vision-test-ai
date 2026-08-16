# Findings: VisionTestAI

## 🔍 Research & Context
- **AI Model**: Google AI Studio `gemini-3.5-flash` using `@google/genai` SDK.
- **Automation Framework**: Playwright (Node.js/TypeScript).
- **Environment**: Environment variables stored in `.env` (principally `GEMINI_API_KEY`).

## 🛠️ Constraints & Guidelines
- API key must be read securely from `process.env.GEMINI_API_KEY`.
- Target files stored in `./data/screenshots/` and `./data/actions.json`.
- Output specs stored in `./output/generated.spec.ts`.
- AI responses must have the markdown code block extracted safely using regular expressions.
