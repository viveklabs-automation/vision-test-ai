import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_DIR = path.join(__dirname, '..', 'output');

function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

// Ensure baseline Cucumber step files exist (world.ts, hooks.ts, common_steps.ts)
function ensureCommonStepFiles() {
  ensureDirectories();
  const stepsDir = path.join(OUTPUT_DIR, 'steps');
  if (!fs.existsSync(stepsDir)) {
    fs.mkdirSync(stepsDir, { recursive: true });
  }

  // 1. Write world.ts
  const worldPath = path.join(stepsDir, 'world.ts');
  if (!fs.existsSync(worldPath)) {
    fs.writeFileSync(worldPath, `import { setWorldConstructor, World } from '@cucumber/cucumber';
import { Page, Browser, BrowserContext } from '@playwright/test';

export class CustomWorld extends World {
  browser!: Browser;
  context!: BrowserContext;
  page!: Page;
}

setWorldConstructor(CustomWorld);
`, 'utf-8');
    console.log(`✨ Generated: ${worldPath}`);
  }

  // 2. Write hooks.ts
  const hooksPath = path.join(stepsDir, 'hooks.ts');
  if (!fs.existsSync(hooksPath)) {
    fs.writeFileSync(hooksPath, `import { Before, After, setDefaultTimeout } from '@cucumber/cucumber';
import { chromium } from '@playwright/test';
import { CustomWorld } from './world';

setDefaultTimeout(60000);

Before({ timeout: 60000 }, async function (this: CustomWorld) {
  const channel = process.env.BROWSER === 'edge' ? 'msedge' : 'chrome';
  const args = channel === 'msedge' ? ['--inprivate'] : ['--incognito'];
  
  this.browser = await chromium.launch({ headless: false, channel, args });
  this.context = await this.browser.newContext();
  this.page = await this.context.newPage();
});

After(async function (this: CustomWorld) {
  if (this.browser) {
    await this.browser.close();
  }
});
`, 'utf-8');
    console.log(`✨ Generated: ${hooksPath}`);
  }

  // 3. Write common_steps.ts for universal reusable steps (preventing ambiguous step errors)
  const commonStepsPath = path.join(stepsDir, 'common_steps.ts');
  if (!fs.existsSync(commonStepsPath)) {
    fs.writeFileSync(commonStepsPath, `import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { CustomWorld } from './world';

// Universal Navigation Step
Given('the user navigates to {string}', async function (this: CustomWorld, url: string) {
  await this.page.goto(url);
  await this.page.waitForTimeout(2000);
});

// Universal Wait Step
When('the user waits for {int} milliseconds', async function (this: CustomWorld, ms: number) {
  await this.page.waitForTimeout(ms);
});

// Universal Click by text
When('the user clicks on element with text {string}', async function (this: CustomWorld, text: string) {
  await this.page.getByText(text, { exact: false }).first().click();
  await this.page.waitForTimeout(1000);
});

// Universal Fill by placeholder
When('the user fills placeholder {string} with {string}', async function (this: CustomWorld, placeholder: string, value: string) {
  await this.page.getByPlaceholder(placeholder).fill(value);
  await this.page.waitForTimeout(1000);
});

// Universal Title Assertion
Then('the page title should contain {string}', async function (this: CustomWorld, expectedTitle: string) {
  await expect(this.page).toHaveTitle(new RegExp(expectedTitle, 'i'));
});

// Universal URL Assertion
Then('the URL should contain {string}', async function (this: CustomWorld, urlPart: string) {
  await expect(this.page).toHaveURL(new RegExp(urlPart, 'i'));
});
`, 'utf-8');
    console.log(`✨ Generated: ${commonStepsPath}`);
  }
}

function getExistingStepDefinitionsContext(): string {
  const stepsDir = path.join(OUTPUT_DIR, 'steps');
  if (!fs.existsSync(stepsDir)) return 'No existing steps found.';

  let context = '';
  const files = fs.readdirSync(stepsDir);
  for (const file of files) {
    if (file.endsWith('.ts') && file !== 'world.ts' && file !== 'hooks.ts') {
      const fullPath = path.join(stepsDir, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      context += `\n--- EXISTING STEP FILE: steps/${file} ---\n\`\`\`typescript\n${content}\n\`\`\`\n`;
    }
  }
  return context || 'No existing step files found.';
}

function getExistingPagesContext(): string {
  const pagesDir = path.join(OUTPUT_DIR, 'pages');
  if (!fs.existsSync(pagesDir)) return 'No existing page classes found.';

  let context = '';
  const files = fs.readdirSync(pagesDir);
  for (const file of files) {
    if (file.endsWith('.ts')) {
      const fullPath = path.join(pagesDir, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      context += `\n--- EXISTING PAGE OBJECT: pages/${file} ---\n\`\`\`typescript\n${content}\n\`\`\`\n`;
    }
  }
  return context || 'No existing page classes found.';
}

async function generateTestScript(sessionName: string = 'generated_test') {
  console.log(`🔮 Compiling recording session and generating Playwright spec (Session: ${sessionName})...`);

  ensureCommonStepFiles();
  const existingStepsContext = getExistingStepDefinitionsContext();
  const existingPagesContext = getExistingPagesContext();

  // Load action log scoped by sessionName
  const actionsPath = path.join(DATA_DIR, `${sessionName}_actions.json`);
  if (!fs.existsSync(actionsPath)) {
    throw new Error(`Actions log not found at ${actionsPath}. Please record a session first.`);
  }

  const actions = JSON.parse(fs.readFileSync(actionsPath, 'utf-8'));
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new Error('Actions log is empty.');
  }

  // Construct request payload
  const contents: any[] = [];

  // Load each screenshot in sequence if available
  for (const action of actions) {
    if (action && typeof action.screenshotPath === 'string') {
      const screenshotPath = path.join(DATA_DIR, action.screenshotPath);
      if (fs.existsSync(screenshotPath)) {
        const base64Data = fs.readFileSync(screenshotPath).toString('base64');
        contents.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64Data
          }
        });
      }
    }
  }

  // Add the prompt instruction
  const prompt = `
You are an expert QA automation engineer specializing in Playwright, Cucumber BDD, and TypeScript.
We have captured a manual browser interaction session and recorded the following actions log:

\`\`\`json
${JSON.stringify(actions, null, 2)}
\`\`\`

The user uploaded ${contents.length} screenshots corresponding to each interaction step in sequence.

### Existing Page Object Classes in Workspace (Shared POM Registry):
${existingPagesContext}

### Existing Step Definitions in Workspace (Cucumber Global Registry):
${existingStepsContext}

### RULES & GUIDELINES FOR SHARED PAGE OBJECTS (POM DEDUPLICATION & REUSE):
1. **Shared Pages Across Scenarios**:
   - If this scenario interacts with a page/component that already exists in \`pages/\` (e.g. \`HomePage.ts\`, \`LoginPage.ts\`, \`CartPage.ts\`), **REUSE the existing page class**.
   - **DO NOT create duplicate page classes** (never create \`HomePage2.ts\` or scenario-prefixed duplicate page classes).
2. **Extend Existing Pages**:
   - If this scenario performs new actions or touches new locators on an existing page, output the complete, updated \`pages/[ExistingPage].ts\` with the new methods and locators added, while preserving all existing methods so other scenarios remain unbroken.
3. **Create New Pages Only for New Screens**:
   - Only create a new \`pages/[NewPage].ts\` when visiting a page/view that does not yet exist.

### RULES & GUIDELINES FOR BDD CUCUMBER INTEGRATION (AVOIDING AMBIGUOUS STEPS):
1. **Reuse Existing Common Steps**:
   - When common steps are used in features (such as \`Given the user navigates to {string}\`, \`When the user waits for {int} milliseconds\`, \`Then the page title should contain {string}\`), use those exact step sentences in \`features/\${sessionName}.feature\`.
   - **DO NOT duplicate or re-define any existing step** in \`steps/\${sessionName}_steps.ts\`. Only ONE step definition must exist across the entire project for each step pattern.
2. **Feature File (\`features/\${sessionName}.feature\`)**:
   - Write standard Gherkin syntax (\`Feature\`, \`Scenario\`, \`Given\`, \`When\`, \`Then\`, \`And\`).
3. **Step Definitions (\`steps/\${sessionName}_steps.ts\`)**:
   - Only define NEW, scenario-specific steps that do NOT already exist in \`common_steps.ts\` or other step files.
   - Import bindings from \`@cucumber/cucumber\` (\`Given\`, \`When\`, \`Then\`).
   - Import page objects from \`../pages/... \`.
   - Use regular \`function\` syntax (not arrow functions) with \`this: CustomWorld\`, accessing \`this.page\`.
4. **Main Spec File (\`specs/\${sessionName}.spec.ts\`)**:
   - Write the Playwright spec executing the POM flow with \`test.setTimeout(60000)\`.

### Output Format
Demarcate each file using \`--- FILE: path/filename ---\`:

--- FILE: features/\${sessionName}.feature ---
\`\`\`gherkin
Feature: ...
  Scenario: ...
    Given the user navigates to "..."
    When ...
\`\`\`

--- FILE: steps/\${sessionName}_steps.ts ---
\`\`\`typescript
import { Given, When, Then } from '@cucumber/cucumber';
import { CustomWorld } from './world';
// Only new custom steps here. Do not duplicate steps from common_steps.ts!
\`\`\`

--- FILE: pages/[PageClass].ts ---
\`\`\`typescript
...
\`\`\`

--- FILE: specs/\${sessionName}.spec.ts ---
\`\`\`typescript
...
\`\`\`
`;

  contents.push({ text: prompt });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not defined in .env');
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

  console.log(`🤖 Sending payload (${contents.length - 1} images) to ${modelName}...`);
  const response = await ai.models.generateContent({
    model: modelName,
    contents: contents
  });

  const text = response.text;
  if (!text) {
    throw new Error('Received empty response from Gemini API.');
  }

  // Parse response files
  const fileRegex = /--- FILE:\s*([a-zA-Z0-9_\-\.\/]+)\s*---[\s\S]*?```[a-zA-Z]*([\s\S]*?)```/g;
  let matchesFound = false;
  let match;

  while ((match = fileRegex.exec(text)) !== null) {
    matchesFound = true;
    const filePathRelative = match[1].trim();
    const fileContent = match[2].trim();
    const fullPath = path.join(OUTPUT_DIR, filePathRelative);

    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(fullPath, fileContent, 'utf-8');
    console.log(`✨ Successfully generated: ${fullPath}`);
  }

  if (!matchesFound) {
    console.warn('⚠️ Warning: Could not parse POM structure markers. Falling back to single-file output...');
    const tsCodeMatch = text.match(/```typescript([\s\S]*?)```/);
    const code = tsCodeMatch ? tsCodeMatch[1].trim() : text.trim();
    const outputPath = path.join(OUTPUT_DIR, 'specs', `${sessionName}.spec.ts`);
    const parentDir = path.dirname(outputPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, code, 'utf-8');
    console.log(`✨ Successfully generated single-file spec at: ${outputPath}`);
  }
}

async function compileDirectlyFromChromeRecorder(jsonContent: string, sessionName: string) {
  console.log(`🔮 Compiling directly from Chrome Recorder JSON for Session: ${sessionName}...`);

  ensureCommonStepFiles();
  const existingStepsContext = getExistingStepDefinitionsContext();
  const existingPagesContext = getExistingPagesContext();

  const prompt = `
You are an expert QA automation engineer specializing in Playwright, Cucumber BDD, and TypeScript.
We have recorded a browser interaction session in Chrome DevTools Recorder and exported its JSON:

\`\`\`json
${jsonContent}
\`\`\`

### Existing Page Object Classes in Workspace (Shared POM Registry):
${existingPagesContext}

### Existing Step Definitions in Workspace (Cucumber Global Registry):
${existingStepsContext}

Based on these recorded steps, please generate the Page Object Model (POM) files, a Playwright spec, a Cucumber BDD feature file, and Cucumber step definitions.

### RULES & GUIDELINES FOR SHARED PAGE OBJECTS (POM DEDUPLICATION & REUSE):
1. **Shared Pages Across Scenarios**:
   - If this scenario interacts with a page/component that already exists in \`pages/\` (e.g. \`HomePage.ts\`, \`LoginPage.ts\`, \`CartPage.ts\`), **REUSE the existing page class**.
   - **DO NOT create duplicate page classes** (never create \`HomePage2.ts\` or scenario-prefixed duplicate page classes).
2. **Extend Existing Pages**:
   - If this scenario performs new actions or touches new locators on an existing page, output the complete, updated \`pages/[ExistingPage].ts\` with the new methods and locators added, while preserving all existing methods so other scenarios remain unbroken.
3. **Create New Pages Only for New Screens**:
   - Only create a new \`pages/[NewPage].ts\` when visiting a page/view that does not yet exist.

### RULES & GUIDELINES FOR BDD CUCUMBER INTEGRATION (AVOIDING AMBIGUOUS STEPS):
1. **Reuse Existing Common Steps**:
   - When common steps are used in features (such as \`Given the user navigates to {string}\`, \`When the user waits for {int} milliseconds\`, \`Then the page title should contain {string}\`), use those exact step sentences in \`features/\${sessionName}.feature\`.
   - **DO NOT duplicate or re-define any existing step** in \`steps/\${sessionName}_steps.ts\`. Only ONE step definition must exist across the entire project for each step pattern.
2. **Feature File (\`features/\${sessionName}.feature\`)**:
   - Write standard Gherkin syntax (\`Feature\`, \`Scenario\`, \`Given\`, \`When\`, \`Then\`, \`And\`).
3. **Step Definitions (\`steps/\${sessionName}_steps.ts\`)**:
   - Only define NEW, scenario-specific steps that do NOT already exist in \`common_steps.ts\` or other step files.
   - Import bindings from \`@cucumber/cucumber\` (\`Given\`, \`When\`, \`Then\`).
   - Use regular \`function\` syntax (not arrow functions) with \`this: CustomWorld\`, accessing \`this.page\`.
4. **Main Spec File (\`specs/\${sessionName}.spec.ts\`)**:
   - Write a single \`specs/\${sessionName}.spec.ts\` file that runs the POM sequence with \`test.setTimeout(60000)\`.

### Output Format
Format your output exactly as shown below, using the \`--- FILE: path/filename ---\` markers to demarcate each file:

--- FILE: features/\${sessionName}.feature ---
\`\`\`gherkin
Feature: ...
  Scenario: ...
    Given the user navigates to "..."
    When ...
\`\`\`

--- FILE: steps/\${sessionName}_steps.ts ---
\`\`\`typescript
import { Given, When, Then } from '@cucumber/cucumber';
import { CustomWorld } from './world';
// Only new custom steps here. Do not duplicate steps from common_steps.ts!
\`\`\`

--- FILE: pages/[PageClass].ts ---
\`\`\`typescript
...
\`\`\`

--- FILE: specs/\${sessionName}.spec.ts ---
\`\`\`typescript
...
\`\`\`
`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not defined in .env');
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

  console.log(`🤖 Requesting direct test generation from ${modelName}...`);
  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt
  });

  const text = response.text;
  if (!text) {
    throw new Error('Received empty response from Gemini API.');
  }

  // Parse response files
  const fileRegex = /--- FILE:\s*([a-zA-Z0-9_\-\.\/]+)\s*---[\s\S]*?```[a-zA-Z]*([\s\S]*?)```/g;
  let matchesFound = false;
  let match;

  while ((match = fileRegex.exec(text)) !== null) {
    matchesFound = true;
    const filePathRelative = match[1].trim();
    const fileContent = match[2].trim();
    const fullPath = path.join(OUTPUT_DIR, filePathRelative);

    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(fullPath, fileContent, 'utf-8');
    console.log(`✨ Successfully generated: ${fullPath}`);
  }

  // Create a placeholder actions file in the data folder so that the scenario is visible in the select scenarios list
  const flow = JSON.parse(jsonContent);
  const dummyActions = (flow.steps || []).map((step: any, index: number) => ({
    timestamp: Date.now(),
    step: index + 1,
    action: step.type,
    url: step.url || '',
    selector: step.selectors ? step.selectors[0]?.[0] || '' : ''
  }));
  ensureDirectories();
  const dummyActionsPath = path.join(DATA_DIR, `${sessionName}_actions.json`);
  fs.writeFileSync(dummyActionsPath, JSON.stringify(dummyActions, null, 2), 'utf-8');

  if (!matchesFound) {
    throw new Error('Could not parse POM structure markers from Gemini response.');
  }
}

// Run if called directly
if (require.main === module) {
  const nameArg = process.argv[2] || 'generated_test';
  generateTestScript(nameArg).catch(console.error);
}

export { generateTestScript, compileDirectlyFromChromeRecorder, ensureCommonStepFiles };
