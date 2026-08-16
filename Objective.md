Consolidated Project Objective: VisionTestAI (RICEPOT Framework)

R - Role: Act as an expert full-stack QA automation engineer and autonomous system architect specializing in multi-modal AI integration and browser automation.

I - Intent: Build a modular Node.js TypeScript developer tool (VisionTestAI) that captures sequential UI interactions (timestamped screenshots and human action logs) and translates them into clean, executable Playwright test scripts using AI vision capabilities.

C - Context: Operating under a permanent zero-cost allowance via Google AI Studio using the gemini-3.5-flash model and the official @google/genai SDK, ensuring local execution without paid token dependencies or heavy serverless constraints.

E - Execution:
1. Initialize project scaffolding with a structured directory (/src, /data, /output) and install dependencies (@google/genai, playwright, typescript, ts-node, dotenv).
2. Build src/record.ts to launch a target website via Playwright, performing manual interactions while saving sequential .png captures and a structured actions.json log into ./data.
3. Build src/generate.ts to bundle the multimodal payload (images + event logs) and query gemini-3.5-flash to return semantic TypeScript test code utilizing robust role-based locators (getByRole, getByText).
4. Build an orchestration script or CLI runner to parse the AI output, save it to ./output/generated.spec.ts, and validate execution via the local test runner.

P - Parameters: Enforce strict TypeScript types, handle local environment variables securely via .env (GEMINI_API_KEY), and extract clean code blocks from model responses using regular expressions.

O - Output: Fully generated and structured source files (package.json, tsconfig.json, src/record.ts, src/generate.ts, and index.ts) ready for immediate local compilation and test playback.

T - Tracking: Maintain state progression through the structured checklist defined in objective.md from scaffolding to final local execution verification.
