import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_DIR = path.join(__dirname, '..', 'output');

async function generateTestScript(sessionName: string = 'generated_test') {
  console.log(`🔮 Compiling recording session and generating Playwright spec (Session: ${sessionName})...`);

  // Ensure output and steps directories exist
  const stepsDir = path.join(OUTPUT_DIR, 'steps');
  if (!fs.existsSync(stepsDir)) {
    fs.mkdirSync(stepsDir, { recursive: true });
  }

  // Write world.ts if it doesn't exist
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

  // Write hooks.ts if it doesn't exist
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

  // Load each screenshot in sequence
  for (const action of actions) {
    const screenshotPath = path.join(DATA_DIR, action.screenshotPath);
    if (fs.existsSync(screenshotPath)) {
      const base64Data = fs.readFileSync(screenshotPath).toString('base64');
      contents.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Data
        }
      });
    } else {
      console.warn(`⚠️ Warning: Screenshot not found at ${screenshotPath}`);
    }
  }

  // Add the prompt instruction
  const prompt = `
You are an expert QA automation engineer specializing in Playwright and TypeScript.
We have captured a manual browser interaction session and recorded the following actions log:

\`\`\`json
${JSON.stringify(actions, null, 2)}
\`\`\`

The user uploaded ${contents.length} screenshots corresponding to each interaction step in sequence.
Step 1 corresponds to the first image, Step 2 to the second, and so on.

### Rules & Guidelines for BDD Cucumber Integration
1. **Feature File**:
   - Write a Gherkin feature file under \`features/\${sessionName}.feature\` describing the steps clearly using standard syntax (\`Feature\`, \`Scenario\`, \`Given\`, \`When\`, \`Then\`, \`And\`).
2. **Step Definitions**:
   - Write step definitions under \`steps/\${sessionName}_steps.ts\` importing bindings from \`@cucumber/cucumber\` (e.g. \`Given\`, \`When\`, \`Then\`).
   - Import the page objects from \`../pages/... \`.
   - Do NOT define individual \`Before\` and \`After\` hooks inside individual step definitions! They are managed globally.
   - Use the shared world context by importing \`CustomWorld\` from \`../steps/world\` (or \`./world\` depending on location relative to steps).
   - Step definitions must access Playwright's page via \`this.page\`. Use regular \`function\` syntax (not arrow functions) so Cucumber binds \`this\` to \`CustomWorld\`:
     \`Given('[sessionName] ...', async function (this: CustomWorld) { const homePage = new HomePage(this.page); ... })\`
3. **Avoid Ambiguous Step Errors (Global Namespace)**:
   - Because Cucumber step definitions are loaded globally, registering the exact same pattern (e.g., \`Given('the user navigates to the homepage')\`) in multiple files will fail.
   - To prevent this, you **must prefix every Gherkin step string** in both the feature file and the step definitions with the session name bracketed: \`[\${sessionName}]\`.
   - *Example*: \`Given [\${sessionName}] the user navigates to the homepage\` / \`Given('[\${sessionName}] the user navigates to the homepage', async () => { ... })\`.

### Rules & Guidelines for Page Objects
1. **Identify Pages Logically**:
   Group consecutive steps that belong to the same page or screen into distinct page object classes (e.g. \`HomePage\`, \`SearchResultsPage\`, \`ProductDetailPage\`, \`CartPage\`).
2. **Encapsulate Locators & Actions**:
   - Each page class should reside in a separate file (e.g., \`pages/HomePage.ts\`).
   - The class constructor must accept Playwright's \`Page\` object: \`constructor(private page: Page) { ... }\`.
   - Locators must be initialized as class properties or getters, prioritizing accessible role-based locators (\`page.getByRole\`, \`page.getByText\`, etc.).
   - Actions should be structured as clean, async class methods (e.g., \`async searchFor(query: string)\`, \`async selectFirstResult()\`, \`async addToCart()\`).
3. **Smart Assertions & Delays**:
   - Set a generous test timeout at the top of the test function: \`test.setTimeout(60000);\`
   - Include a logical delay (e.g. \`await this.page.waitForTimeout(1500);\` or \`await this.page.waitForTimeout(3000);\` for initial landing pages) after every navigation, click, and input fill action inside page methods. This makes test runs visible and readable to human eyes and helps prevent race conditions during slow network transitions.
   - Use custom expectation timeouts where needed (e.g., \`await expect(locator).toBeVisible({ timeout: 10000 })\`).
4. **Main Spec File**:
   - Write a single \`specs/\${sessionName}.spec.ts\` file that imports and instantiates the page objects, and describes the high-level test sequence.
5. **No Placeholders**: Do not leave any TODOs or placeholders. The code must compile and run as-is.

### Output Format
Format your output exactly as shown below, using the \`--- FILE: path/filename ---\` markers to demarcate each file. Return all files in your response:

--- FILE: features/\${sessionName}.feature ---
\`\`\`gherkin
Feature: Search and Buy
  Scenario: Search and Add product to cart
    Given [\${sessionName}] the user navigates to the homepage
    When [\${sessionName}] the user searches for "Mobiles"
\`\`\`

--- FILE: steps/\${sessionName}_steps.ts ---
\`\`\`typescript
import { Given, When, Then } from '@cucumber/cucumber';
import { HomePage } from '../pages/HomePage';
import { CustomWorld } from './world';

Given('[\${sessionName}] the user navigates to the homepage', async function (this: CustomWorld) {
  const homePage = new HomePage(this.page);
  await homePage.navigate();
});

When('[\${sessionName}] the user searches for {string}', async function (this: CustomWorld, query: string) {
  const homePage = new HomePage(this.page);
  await homePage.searchFor(query);
});
\`\`\`

--- FILE: pages/HomePage.ts ---
\`\`\`typescript
import { Page, Locator, expect } from '@playwright/test';

export class HomePage {
  readonly searchInput: Locator;
  constructor(private page: Page) {
    this.searchInput = page.getByPlaceholder('Search Amazon');
  }

  async navigate() {
    await this.page.goto('https://www.amazon.com');
    await this.page.waitForTimeout(3000);
  }

  async searchFor(query: string) {
    await this.searchInput.click();
    await this.page.waitForTimeout(1000);
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(1000);
    await this.page.press('Enter');
    await this.page.waitForTimeout(2000);
  }
}
\`\`\`

--- FILE: specs/\${sessionName}.spec.ts ---
\`\`\`typescript
import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage';

test('vision generated test', async ({ page }) => {
  test.setTimeout(60000);
  const homePage = new HomePage(page);
  await homePage.navigate();
  await homePage.searchFor('Mobiles');
});
\`\`\`
`;

  contents.push({ text: prompt });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not defined in .env');
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = 'gemini-3.5-flash';

  console.log(`🤖 Sending payload (${contents.length - 1} images) to ${modelName}...`);
  const response = await ai.models.generateContent({
    model: modelName,
    contents: contents
  });

  const text = response.text;
  if (!text) {
    throw new Error('Received empty response from Gemini API.');
  }

  // Parse response files (supporting any code block identifier e.g. gherkin, typescript, feature)
  const fileRegex = /--- FILE:\s*([a-zA-Z0-9_\-\.\/]+)\s*---[\s\S]*?```[a-zA-Z]*([\s\S]*?)```/g;
  let matchesFound = false;
  let match;

  while ((match = fileRegex.exec(text)) !== null) {
    matchesFound = true;
    const filePathRelative = match[1].trim();
    const fileContent = match[2].trim();
    const fullPath = path.join(OUTPUT_DIR, filePathRelative);

    // Ensure parent directories exist
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

// Run if called directly
if (require.main === module) {
  const nameArg = process.argv[2] || 'generated_test';
  generateTestScript(nameArg).catch(console.error);
}

export { generateTestScript };
