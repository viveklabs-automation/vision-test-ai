# LLM: Project Constitution

## 📊 Data Schemas

### 1. Action Log (`actions.json` / `ActionRecord`)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ActionLog",
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "timestamp": { "type": "integer" },
      "action": { "type": "string", "enum": ["navigation", "click", "input", "change", "keypress"] },
      "url": { "type": "string" },
      "selector": { "type": "string" },
      "tagName": { "type": "string" },
      "role": { "type": "string" },
      "text": { "type": "string" },
      "value": { "type": "string" },
      "screenshotPath": { "type": "string" }
    },
    "required": ["timestamp", "action"]
  }
}
```

---

## 📜 Behavioral Rules

1. **Role-Based Locators**: Generated Playwright tests MUST prioritize semantic, accessible role-based locators (`page.getByRole`, `page.getByText`, `page.getByPlaceholder`, `page.getByLabel`) over brittle CSS/XPath selectors.
2. **Safe Code Block Extraction**: The script parsing the Gemini response must use regex to extract typescript blocks (` ```typescript ... ``` `) and handle failures gracefully.
3. **Environment Security**: No API key or secret must be hardcoded. Only read from `process.env.GEMINI_API_KEY`.
4. **Data Isolation & Naming**: All temporary recording files must live under session-scoped paths inside `./data/` (e.g. `./data/[session-name]_actions.json` and screenshots inside `./data/screenshots/[session-name]/`).
5. **Page Object Model (POM)**:
   - Elements and actions must be encapsulated in Page Class files located inside `./output/pages/`.
   - The test script `./output/specs/[session-name].spec.ts` must import and use these page objects.
6. **BDD Cucumber Integration**:
   - Gherkin feature files must reside under `./output/features/` with `.feature` extension.
   - Cucumber step definition files must reside under `./output/steps/` with `_steps.ts` extension.
   - Step definitions must import Page Objects to perform their execution steps.
7. **Self-Healing Run Loop**:
   - Playwright test runs must output screenshots on failure.
   - The healer must check failure screenshots and console errors, query the AI model, and overwrite the failing page class or spec script.

---

## 🏛️ Architectural Invariants

- **`architecture/locator_strategy.md`**: Technical SOP documenting the locator capture mechanics and code generation strategy.
- **`src/record.ts`**: Responsible solely for launching the browser, monitoring events, capturing screenshots, and recording actions to file.
- **`src/generate.ts`**: Responsible solely for reading `./data`, loading files/images, building the multimodal prompt, interacting with Gemini to generate POM page files, test spec, and BDD Cucumber features & steps, and saving them.
- **`src/heal.ts`**: Runs Playwright, intercepts errors, grabs failure screenshots, queries Gemini with failure context to patch target code, and retries.
- **`src/index.ts`**: CLI Entrypoint orchestrating the entire lifecycle (record -> generate -> run & heal).
