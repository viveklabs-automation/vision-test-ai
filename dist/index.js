"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const record_1 = require("./record");
const generate_1 = require("./generate");
const heal_1 = require("./heal");
function printHelp() {
    console.log(`
🤖 VisionTestAI CLI Usage:
  npm start                      Launch interactive recording -> generation -> run flow
  npm start <url> [session-name] Start recording on <url> -> generate -> run flow
  npm run record <url> [session-name] Record a new session starting at <url>
  npm run generate [session-name] Generate specs from existing actions/screenshots
  npm run heal                   Execute tests with active self-healing enabled
  npm run test                   Execute generated Playwright tests

Options:
  -g, --generate-only            Skip recording; run only code generation from existing data
  -r, --run-only                 Skip recording and generation; run the generated Playwright spec
  -h, --help                     Display this help message
`);
}
async function runCli() {
    const args = process.argv.slice(2);
    const helpFlag = args.includes('-h') || args.includes('--help');
    const generateOnly = args.includes('-g') || args.includes('--generate-only');
    const runOnly = args.includes('-r') || args.includes('--run-only');
    const healOnly = args.includes('--heal') || args.includes('-heal');
    if (helpFlag) {
        printHelp();
        return;
    }
    // Filter out flags to check positional arguments
    const positionalArgs = args.filter(arg => !arg.startsWith('-'));
    const targetUrl = positionalArgs[0];
    const sessionName = positionalArgs[1] || 'generated_test';
    try {
        if (runOnly || healOnly) {
            await (0, heal_1.runHealLoop)();
            return;
        }
        if (generateOnly) {
            await (0, generate_1.generateTestScript)(sessionName);
            runPlaywrightTestsPrompt(sessionName);
            return;
        }
        // Default: Full pipeline (Record -> Generate -> Prompt to run)
        const urlToRecord = targetUrl || 'https://example.com';
        console.log('🏁 Step 1: Start Browser Recording Session');
        await (0, record_1.recordSession)(urlToRecord, sessionName);
        console.log('\n🏁 Step 2: Compile Multi-Modal actions & screenshots with Gemini');
        await (0, generate_1.generateTestScript)(sessionName);
        runPlaywrightTestsPrompt(sessionName);
    }
    catch (error) {
        console.error('❌ Error during VisionTestAI execution:', error);
    }
}
function runPlaywrightTestsPrompt(sessionName) {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question('\n❓ Would you like to run the generated Playwright spec now (with self-healing)? (y/n): ', async (answer) => {
        rl.close();
        if (answer.trim().toLowerCase() === 'y') {
            await (0, heal_1.runHealLoop)(`output/specs/${sessionName}.spec.ts`);
        }
        else {
            console.log('👍 Skipping Playwright test execution. You can run it later with "npm run heal".');
        }
    });
}
// Execute CLI
runCli().catch(console.error);
