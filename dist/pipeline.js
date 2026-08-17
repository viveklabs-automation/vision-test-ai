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
exports.runFullPipelineFromJson = runFullPipelineFromJson;
exports.runFullPipeline = runFullPipeline;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));
const generate_1 = require("./generate");
const heal_1 = require("./heal");
dotenv.config();
const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
/**
 * Runs the end-to-end pipeline from a Chrome Recorder JSON content string.
 */
async function runFullPipelineFromJson(jsonContent, sessionName, options = {}) {
    const browser = options.browser || 'chrome';
    const autoHeal = options.autoHeal !== false;
    const log = options.onLog || console.log;
    log(`\n🚀 [Auto-Pilot Pipeline] Starting for session: ${sessionName}...`);
    log(`1️⃣ Phase 1: AI Code Generation & Artifact Compilation...`);
    try {
        await (0, generate_1.compileDirectlyFromChromeRecorder)(jsonContent, sessionName);
        log(`✨ Artifacts successfully compiled (POM, Specs, Features, Steps)!`);
    }
    catch (err) {
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
        const healResult = await (0, heal_1.runHealLoop)(specPath, browser);
        return {
            sessionName,
            compiled: true,
            testPassed: healResult.success,
            healed: healResult.attempts > 1 && healResult.success,
            healAttempts: healResult.attempts,
            error: healResult.error
        };
    }
    else {
        // Run without healing
        const healResult = await (0, heal_1.runHealLoop)(specPath, browser);
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
async function runFullPipeline(inputPathOrSession, options = {}) {
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
    await (0, generate_1.generateTestScript)(sessionName);
    log(`✨ Artifacts successfully compiled (POM, Specs, Features, Steps)!`);
    log(`\n2️⃣ Phase 2: Autonomous Test Execution & Self-Healing (${browser.toUpperCase()})...`);
    const specPath = `output/specs/${sessionName}.spec.ts`;
    const healResult = await (0, heal_1.runHealLoop)(specPath, browser);
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
    const browserArg = args.find(a => a.startsWith('--browser='))?.split('=')[1] || 'chrome';
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
        if (result.error)
            console.log(`- Error: ${result.error}`);
        console.log('========================================\n');
        process.exit(result.testPassed ? 0 : 1);
    })
        .catch((err) => {
        console.error('❌ Pipeline error:', err);
        process.exit(1);
    });
}
