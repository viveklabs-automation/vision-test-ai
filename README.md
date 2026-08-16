# 🚀 VisionTestAI

An autonomous, multi-modal AI-driven QA developer tool that translates manual browser interactions into executable Playwright test scripts.

---

## 📌 Problem Statement

Writing end-to-end integration and QA tests (such as Playwright spec files) is often time-consuming, repetitive, and error-prone. 
* Developers and QA engineers must manually look up element selectors, tags, placeholders, and accessibilities.
* Brittle CSS selectors or XPath paths are often used, which break easily when the UI undergoes minor structural changes.
* Creating assertions that verify if page states actually changed after an interaction requires writing a lot of boilerplate code.

---

## 💡 Solution

**VisionTestAI** simplifies test generation by combining browser automation with multi-modal AI vision:
1. **Interactive Session Recording**: Launches a target website in a Chromium browser. As you interact with the page, the tool logs accessibility metadata (roles, labels, text values) and records sequential step-by-step screenshots.
2. **AI-Powered Page Object Model (POM) Generation**: Feeds the event timeline and visual screenshots to **Gemini 3.5 Flash**. Gemini groups steps into logical pages and generates structured page object classes in `output/pages/` containing clean interaction methods.
3. **Declarative Test Spec Generation**: Generates a clean, highly readable spec file in `output/specs/generated_test.spec.ts` that instantiates and calls these page objects sequentially.
4. **Cucumber BDD Feature & Step Definition Generation**: Automatically compiles the user journey into a Gherkin feature file (`output/features/generated_test.feature`) and maps each step to page object calls in TypeScript step definitions (`output/steps/generated_test_steps.ts`).
5. **Automated Self-Healing**: Introduces a wrapper test runner. If a test fails, it captures the error log and failure screenshot, feeds them to Gemini, patches the broken locator/logic in the class files, and automatically retries the execution.

---

## 🛠️ Tech Stack

* **Runtime**: Node.js & TypeScript
* **Browser Automation**: [Playwright](https://playwright.dev/)
* **AI Model**: [Google Gemini 3.5 Flash](https://ai.google.dev/) via the official `@google/genai` SDK
* **Configuration**: `dotenv` for secure environment variable management

---

## 🚀 How to Run

### 1. Prerequisites
Ensure you have Node.js (version 20+) installed.

### 2. Install Dependencies
Clone the repository and install the project dependencies:
```bash
npm install
```

### 3. Configure the Environment
Create a `.env` file in the root directory (or rename `.env.example` to `.env`):
```env
GEMINI_API_KEY=your-gemini-api-key-here
```
> [!IMPORTANT]
> Replace the placeholder value with your actual Gemini API key from [Google AI Studio](https://aistudio.google.com/).

### 4. Verify Connection
Run the connection check script to ensure the API handshake with Gemini is successful:
```bash
npx ts-node src/link_test.ts
```

### 5. Record and Generate POM Tests
To start a new browser session, generate the page objects, and create the test spec, run:
```bash
npm start <url>
```
*For example:*
```bash
npm start https://example.com
```

> [!TIP]
> **Aborting a Session:** If you make a mistake during the recording, press **Ctrl + C** in your terminal window. This will immediately close the browser and cancel the session without calling the Gemini API. You can then re-run `npm start <url>` to start fresh.


### 6. Running the Spec Tests (Playwright)
All Playwright tests are launched inside isolated/incognito browser sessions by default.

* **Execute in Parallel (Chrome + Edge)**:
  ```bash
  npx playwright test --headed
  ```
* **Execute on a Single Browser**:
  - Chrome: `npx playwright test --project=chrome --headed`
  - Edge: `npx playwright test --project=msedge --headed`
* **Execute a Single Spec File**:
  - `npx playwright test --project=chrome --headed output/specs/[session-name].spec.ts`
* **Execute with Active Self-Healing**:
  - Parallel: `npm run heal`
  - Single Browser: `npm run heal -- --project=chrome` or `npm run heal -- --project=msedge`

---

### 7. Running BDD Tests (Cucumber)
* **Execute on Google Chrome** (Default):
  ```bash
  npm run bdd
  ```
* **Execute a Single Feature File**:
  ```bash
  npx cucumber-js output/features/[session-name].feature --require-module ts-node/register --require output/steps/**/*.ts
  ```
* **Execute on Microsoft Edge**:
  - *PowerShell*: `$env:BROWSER="edge"; npm run bdd; Remove-Item Env:\BROWSER`
  - *cmd*: `set BROWSER=edge && npm run bdd && set BROWSER=`
  - *Bash*: `BROWSER=edge npm run bdd`
* **Execute in Parallel (Chrome + Edge)**:
  ```bash
  npm run bdd:parallel
  ```

---

### 8. Creating New Scenarios & Building a Suite
* **Overwrite Current Test**:
  Run `npm start <url>` with the new address. The output files will be replaced.
* **Build a Permanent Suite**:
  Before starting a new recording, rename the generated files to preserve them:
  - Rename `output/features/generated_test.feature` ➡️ `output/features/custom_name.feature`
  - Rename `output/steps/generated_test_steps.ts` ➡️ `output/steps/custom_name_steps.ts`
  - Rename `output/specs/generated_test.spec.ts` ➡️ `output/specs/custom_name.spec.ts`
  Playwright and Cucumber will automatically pick up and execute all files inside the `specs/` and `features/` folders as a unified suite!
* **Clean Session Assets**:
  To discard all recorded logs, screenshots, and compiled spec/BDD output files before committing/pushing code to a repository, run:
  ```bash
  npm run clean
  ```

