import { exec } from 'child_process';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const ROOT_DIR = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
const TEST_RESULTS_DIR = path.join(ROOT_DIR, 'test-results');

interface HealContext {
  errorLog: string;
  screenshotPath: string | null;
  codeContext: string;
}

// Find the most recent screenshot in test-results/
function findLatestScreenshot(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  let latestFile: string | null = null;
  let latestMtime = 0;

  function traverse(currentDir: string) {
    const files = fs.readdirSync(currentDir);
    for (const file of files) {
      const fullPath = path.join(currentDir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        traverse(fullPath);
      } else if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')) {
        if (stat.mtimeMs > latestMtime) {
          latestMtime = stat.mtimeMs;
          latestFile = fullPath;
        }
      }
    }
  }

  traverse(dir);
  return latestFile;
}

// Read all code in the output directory
function getCodeContext(): string {
  let context = '';
  
  function traverse(dir: string) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        traverse(fullPath);
      } else if (file.endsWith('.ts')) {
        const relativePath = path.relative(OUTPUT_DIR, fullPath).replace(/\\/g, '/');
        const content = fs.readFileSync(fullPath, 'utf-8');
        context += `\n--- FILE: ${relativePath} ---\n\`\`\`typescript\n${content}\n\`\`\`\n`;
      }
    }
  }
  
  traverse(OUTPUT_DIR);
  return context;
}

async function queryGeminiToHeal(context: HealContext): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not defined in .env');
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const contents: any[] = [];

  // Add the failure screenshot if it exists
  if (context.screenshotPath && fs.existsSync(context.screenshotPath)) {
    console.log(`📸 Sending failure screenshot as context: ${context.screenshotPath}`);
    const mimeType = context.screenshotPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const base64Data = fs.readFileSync(context.screenshotPath).toString('base64');
    contents.push({
      inlineData: {
        mimeType,
        data: base64Data
      }
    });
  }

  // Define healing prompt
  const prompt = `
You are an expert QA automation engineer specializing in Playwright and TypeScript.
A Playwright test run failed. We need you to heal the failing locator, transition, or logic in the Page Object Model (POM) or test spec.

### Existing Test Suite Code:
${context.codeContext}

### Playwright Failure Error & Output:
\`\`\`text
${context.errorLog}
\`\`\`

The user has attached the screenshot of the browser at the exact moment of failure above.

### Your Goal
Analyze the failure error and the visual state. Modify the appropriate page object class (in \`pages/\`) or spec file to correct the locator, selector, wait state, or logical transition.

### Healing Rules
1. **Prioritize Accessible Locators**: Always prefer accessibility roles/labels over CSS selectors unless absolutely necessary.
2. **Handle Page Load states and delays**: Ensure appropriate \`waitForTimeout\` or expectation options (e.g. \`{ timeout: 10000 }\`) are updated to handle lazy-loading elements.
3. **Keep Code Declarative**: Do not put raw locator interaction logic inside the spec file if a page object exists; keep actions encapsulated in Page Classes.
4. **No Placeholders**: Return complete, functional files. Do not omit code or write comments like "// ... rest of code unchanged".

### Output Format
Demarcate the updated files using the same \`--- FILE: path --- \` marker. Only output the file(s) that changed:

--- FILE: pages/[FailingPage].ts ---
\`\`\`typescript
[Full Updated Code Here]
\`\`\`
`;

  contents.push({ text: prompt });

  console.log(`🤖 Requesting self-healing suggestions from ${modelName}...`);
  const response = await ai.models.generateContent({
    model: modelName,
    contents
  });

  return response.text || '';
}

function parseAndApplyPatches(text: string) {
  const fileRegex = /--- FILE:\s*([a-zA-Z0-9_\-\.\/]+)\s*---[\s\S]*?```typescript([\s\S]*?)```/g;
  let match;
  let applied = false;

  while ((match = fileRegex.exec(text)) !== null) {
    applied = true;
    const filePathRelative = match[1].trim();
    const fileContent = match[2].trim();
    const fullPath = path.join(OUTPUT_DIR, filePathRelative);

    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(fullPath, fileContent, 'utf-8');
    console.log(`🩹 Applied self-healing patch to: ${fullPath}`);
  }

  if (!applied) {
    console.warn('⚠️ Warning: No file changes parsed from Gemini response. Gemini output was:\n', text);
  }
}

function runPlaywrightTests(targetPath?: string, browser: string = 'chrome'): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const extraArgs = process.argv.slice(2).join(' ');
    const testTarget = targetPath || extraArgs;
    const projectFlag = testTarget.includes('--project') ? '' : `--project=${browser}`;
    const cmd = `npx playwright test --headed ${testTarget} ${projectFlag}`.trim();
    console.log(`🚀 Running ${cmd}...`);
    exec(cmd, { cwd: ROOT_DIR }, (error, stdout, stderr) => {
      resolve({
        code: error ? error.code || 1 : 0,
        stdout,
        stderr
      });
    });
  });
}

async function runHealLoop(targetPath?: string, browser: string = 'chrome'): Promise<{ success: boolean; attempts: number; error?: string }> {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    console.log(`\n🩺 --- Run & Heal Cycle: Attempt ${attempt}/${maxRetries} ---`);

    // Clean previous screenshots in test-results
    if (fs.existsSync(TEST_RESULTS_DIR)) {
      try {
        fs.rmSync(TEST_RESULTS_DIR, { recursive: true, force: true });
      } catch (e) {}
    }

    const { code, stdout, stderr } = await runPlaywrightTests(targetPath, browser);

    if (code === 0) {
      console.log('✅ Success! Playwright tests passed completely.');
      return { success: true, attempts: attempt };
    }

    console.warn(`❌ Playwright test run failed on attempt ${attempt}.`);
    
    // Gather error info
    const fullLog = stdout + '\n' + stderr;
    console.log('---------------------------');
    console.log(stdout.substring(0, 1000) + (stdout.length > 1000 ? '\n... [truncated] ...' : ''));
    console.log('---------------------------');

    const screenshotPath = findLatestScreenshot(TEST_RESULTS_DIR);
    const codeContext = getCodeContext();

    try {
      const healingResponse = await queryGeminiToHeal({
        errorLog: fullLog,
        screenshotPath,
        codeContext
      });

      parseAndApplyPatches(healingResponse);
    } catch (err: any) {
      console.error('❌ Self-healing request failed:', err.message || err);
      return { success: false, attempts: attempt, error: err.message || String(err) };
    }
  }

  console.error(`❌ Maximum self-healing attempts (${maxRetries}) reached. Tests are still failing.`);
  return { success: false, attempts: maxRetries, error: 'Maximum self-healing attempts reached' };
}

// Run loop if called directly from CLI
if (require.main === module) {
  runHealLoop().then((result) => {
    process.exit(result.success ? 0 : 1);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { runHealLoop };
