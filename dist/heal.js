"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runHealLoop = runHealLoop;
const child_process_1 = require("child_process");
const genai_1 = require("@google/genai");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const ROOT_DIR = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
const TEST_RESULTS_DIR = path.join(ROOT_DIR, 'test-results');
// Find the most recent screenshot in test-results/
function findLatestScreenshot(dir) {
    if (!fs.existsSync(dir))
        return null;
    let latestFile = null;
    let latestMtime = 0;
    function traverse(currentDir) {
        const files = fs.readdirSync(currentDir);
        for (const file of files) {
            const fullPath = path.join(currentDir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                traverse(fullPath);
            }
            else if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')) {
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
function getCodeContext() {
    let context = '';
    function traverse(dir) {
        if (!fs.existsSync(dir))
            return;
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                traverse(fullPath);
            }
            else if (file.endsWith('.ts')) {
                const relativePath = path.relative(OUTPUT_DIR, fullPath).replace(/\\/g, '/');
                const content = fs.readFileSync(fullPath, 'utf-8');
                context += `\n--- FILE: ${relativePath} ---\n\`\`\`typescript\n${content}\n\`\`\`\n`;
            }
        }
    }
    traverse(OUTPUT_DIR);
    return context;
}
async function queryGeminiToHeal(context) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is not defined in .env');
    }
    const ai = new genai_1.GoogleGenAI({ apiKey });
    const modelName = 'gemini-3.5-flash';
    const contents = [];
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
function parseAndApplyPatches(text) {
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
function runPlaywrightTests(targetPath) {
    return new Promise((resolve) => {
        const extraArgs = process.argv.slice(2).join(' ');
        const cmd = `npx playwright test --headed ${targetPath || extraArgs}`.trim();
        console.log(`🚀 Running ${cmd}...`);
        (0, child_process_1.exec)(cmd, { cwd: ROOT_DIR }, (error, stdout, stderr) => {
            resolve({
                code: error ? error.code || 1 : 0,
                stdout,
                stderr
            });
        });
    });
}
async function runHealLoop(targetPath) {
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
        attempt++;
        console.log(`\n🩺 --- Run & Heal Cycle: Attempt ${attempt}/${maxRetries} ---`);
        // Clean previous screenshots in test-results
        if (fs.existsSync(TEST_RESULTS_DIR)) {
            try {
                fs.rmSync(TEST_RESULTS_DIR, { recursive: true, force: true });
            }
            catch (e) { }
        }
        const { code, stdout, stderr } = await runPlaywrightTests(targetPath);
        if (code === 0) {
            console.log('✅ Success! Playwright tests passed completely.');
            process.exit(0);
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
        }
        catch (err) {
            console.error('❌ Self-healing request failed:', err.message || err);
            process.exit(1);
        }
    }
    console.error(`❌ Maximum self-healing attempts (${maxRetries}) reached. Tests are still failing.`);
    process.exit(1);
}
// Run loop
if (require.main === module) {
    runHealLoop().catch(console.error);
}
