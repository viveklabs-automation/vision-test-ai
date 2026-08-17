import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { generateTestScript, compileDirectlyFromChromeRecorder } from './generate';
import { runHealLoop } from './heal';

dotenv.config();

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');

export interface PipelineOptions {
  browser?: 'chrome' | 'edge';
  autoHeal?: boolean;
  onLog?: (message: string) => void;
}

export interface PipelineResult {
  sessionName: string;
  compiled: boolean;
  testPassed: boolean;
  healed: boolean;
  healAttempts: number;
  error?: string;
}

/**
 * Runs the end-to-end pipeline from a Chrome Recorder JSON content string.
 */
export async function runFullPipelineFromJson(
  jsonContent: string,
  sessionName: string,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const browser = options.browser || 'chrome';
  const autoHeal = options.autoHeal !== false;
  const log = options.onLog || console.log;

  log(`\n🚀 [Auto-Pilot Pipeline] Starting for session: ${sessionName}...`);
  log(`1️⃣ Phase 1: AI Code Generation & Artifact Compilation...`);

  try {
    await compileDirectlyFromChromeRecorder(jsonContent, sessionName);
    log(`✨ Artifacts successfully compiled (POM, Specs, Features, Steps)!`);
  } catch (err: any) {
    log(`❌ Compilation failed: ${err.message || err}`);
    return {
      sessionName,
      compiled: false,
      testPassed: false,
      healed: false,
      healAttempts: 0,
      error: `Compilation failed: ${err.message || err}`
    };
  }

  log(`\n2️⃣ Phase 2: Autonomous Test Execution & Self-Healing (${browser.toUpperCase()})...`);
  const specPath = `output/specs/${sessionName}.spec.ts`;

  if (autoHeal) {
    const healResult = await runHealLoop(specPath, browser);
    return {
      sessionName,
      compiled: true,
      testPassed: healResult.success,
      healed: healResult.attempts > 1 && healResult.success,
      healAttempts: healResult.attempts,
      error: healResult.error
    };
  } else {
    // Run without healing
    const healResult = await runHealLoop(specPath, browser);
    return {
      sessionName,
      compiled: true,
      testPassed: healResult.success,
      healed: false,
      healAttempts: 1,
      error: healResult.error
    };
  }
}

/**
 * Runs the end-to-end pipeline from a file path or session name.
 */
export async function runFullPipeline(
  inputPathOrSession: string,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const browser = options.browser || 'chrome';
  const log = options.onLog || console.log;

  let sessionName = '';
  let jsonContent = '';

  // Check if input is an existing JSON file
  if (fs.existsSync(inputPathOrSession) && inputPathOrSession.endsWith('.json')) {
    jsonContent = fs.readFileSync(inputPathOrSession, 'utf-8');
    const parsedPath = path.parse(inputPathOrSession);
    sessionName = parsedPath.name.replace(/[^a-zA-Z0-9_]/g, '_');
    return runFullPipelineFromJson(jsonContent, sessionName, options);
  }

  // Check if it matches a session in data/
  sessionName = inputPathOrSession.replace('_actions.json', '').replace(/[^a-zA-Z0-9_]/g, '_');
  const actionFile = path.join(DATA_DIR, `${sessionName}_actions.json`);

  if (!fs.existsSync(actionFile)) {
    throw new Error(`Could not find recorded file or session matching: ${inputPathOrSession}`);
  }

  log(`\n🚀 [Auto-Pilot Pipeline] Starting compilation from recorded actions: ${sessionName}...`);
  log(`1️⃣ Phase 1: AI Code Generation from Session Actions...`);
  
  await generateTestScript(sessionName);
  log(`✨ Artifacts successfully compiled (POM, Specs, Features, Steps)!`);

  log(`\n2️⃣ Phase 2: Autonomous Test Execution & Self-Healing (${browser.toUpperCase()})...`);
  const specPath = `output/specs/${sessionName}.spec.ts`;
  const healResult = await runHealLoop(specPath, browser);

  return {
    sessionName,
    compiled: true,
    testPassed: healResult.success,
    healed: healResult.attempts > 1 && healResult.success,
    healAttempts: healResult.attempts,
    error: healResult.error
  };
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const target = args[0];
  const browserArg = args.find(a => a.startsWith('--browser='))?.split('=')[1] as 'chrome' | 'edge' || 'chrome';

  if (!target) {
    console.error('Usage: npx ts-node src/pipeline.ts <recorder_json_path_or_session_name> [--browser=chrome|edge]');
    process.exit(1);
  }

  runFullPipeline(target, { browser: browserArg })
    .then((result) => {
      console.log('\n========================================');
      console.log(`🏁 Pipeline Complete for [${result.sessionName}]`);
      console.log(`- Compiled: ${result.compiled ? '✅ YES' : '❌ NO'}`);
      console.log(`- Test Passed: ${result.testPassed ? '✅ YES' : '❌ NO'}`);
      console.log(`- Self-Healed: ${result.healed ? `✅ YES (Attempts: ${result.healAttempts})` : 'ℹ️ No heal needed or failed'}`);
      if (result.error) console.log(`- Error: ${result.error}`);
      console.log('========================================\n');
      process.exit(result.testPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error('❌ Pipeline error:', err);
      process.exit(1);
    });
}
