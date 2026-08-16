# Task Plan: VisionTestAI

## 🎯 North Star
An autonomous QA developer tool that dynamically captures user interactions in a browser session and compiles them into valid, semantic Playwright tests using local files and the Gemini 3.5 Flash API.

---

## 🗺️ Phases Checklist

### Phase 1: Blueprint & Initialize (B)
- [x] Initial design and project setup approved
- [ ] Define JSON schemas for Action logs and Gemini payload in `LLM.md`
- [ ] Setup `package.json` and TypeScript configs

### Phase 2: Link Connectivity (L)
- [ ] Verify local dotenv setup
- [ ] Verify connectivity to `@google/genai` using a simple script

### Phase 3: Architect components (A)
- [ ] Implement `src/record.ts` to launch browser, log events, and take screenshots
- [ ] Implement `src/generate.ts` to build and send prompt/images to Gemini 3.5 Flash
- [ ] Implement `src/index.ts` to stitch everything together

### Phase 4: Stylize & Refine (S)
- [ ] Format Playwright test outputs cleanly
- [ ] Implement robust error handling and CLI visual helpers (logs, colors)

### Phase 5: Trigger & Verify (T)
- [ ] Execute generated Playwright test script
- [ ] Verify test runner passes completely
