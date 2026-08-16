import { recordSession } from './record';
import { generateTestScript } from './generate';
import { runHealLoop } from './heal';
import * as path from 'path';
import * as fs from 'fs';

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
      await runHealLoop();
      return;
    }

    if (generateOnly) {
      await generateTestScript(sessionName);
      runPlaywrightTestsPrompt(sessionName);
      return;
    }

    // Default: Full pipeline (Record -> Generate -> Prompt to run)
    const urlToRecord = targetUrl || 'https://example.com';
    console.log('🏁 Step 1: Start Browser Recording Session');
    await recordSession(urlToRecord, sessionName);

    console.log('\n🏁 Step 2: Compile Multi-Modal actions & screenshots with Gemini');
    await generateTestScript(sessionName);

    runPlaywrightTestsPrompt(sessionName);
  } catch (error) {
    console.error('❌ Error during VisionTestAI execution:', error);
  }
}

function runPlaywrightTestsPrompt(sessionName: string) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('\n❓ Would you like to run the generated Playwright spec now (with self-healing)? (y/n): ', async (answer: string) => {
    rl.close();
    if (answer.trim().toLowerCase() === 'y') {
      await runHealLoop(`output/specs/${sessionName}.spec.ts`);
    } else {
      console.log('👍 Skipping Playwright test execution. You can run it later with "npm run heal".');
    }
  });
}

// Execute CLI
runCli().catch(console.error);
