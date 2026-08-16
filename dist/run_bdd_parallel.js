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
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
function runBrowserBdd(browser) {
    return new Promise((resolve, reject) => {
        console.log(`🚀 Starting Cucumber BDD on [${browser.toUpperCase()}]...`);
        // Path to the cucumber-js executable
        const cucumberBin = path.join(__dirname, '..', 'node_modules', '@cucumber', 'cucumber', 'bin', 'cucumber.js');
        const args = [
            'output/features/**/*.feature',
            '--require-module', 'ts-node/register',
            '--require', 'output/steps/**/*.ts'
        ];
        const child = (0, child_process_1.spawn)('node', [cucumberBin, ...args], {
            cwd: path.join(__dirname, '..'),
            env: { ...process.env, BROWSER: browser },
            stdio: 'pipe'
        });
        child.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                if (line.trim()) {
                    process.stdout.write(`[${browser.toUpperCase()}] ${line}\n`);
                }
            }
        });
        child.stderr.on('data', (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                if (line.trim()) {
                    process.stderr.write(`[${browser.toUpperCase()}] ERR: ${line}\n`);
                }
            }
        });
        child.on('close', (code) => {
            if (code === 0) {
                console.log(`✅ BDD on [${browser.toUpperCase()}] passed successfully!`);
                resolve();
            }
            else {
                console.error(`❌ BDD on [${browser.toUpperCase()}] failed with exit code ${code}.`);
                reject(new Error(`Browser BDD execution failed for ${browser}`));
            }
        });
    });
}
async function main() {
    console.log('⚡ Starting Parallel Cross-Browser BDD Testing (Chrome + Edge)...');
    try {
        await Promise.all([
            runBrowserBdd('chrome'),
            runBrowserBdd('edge')
        ]);
        console.log('🎉 Parallel Cross-Browser BDD execution finished successfully!');
    }
    catch (err) {
        console.error('❌ One or more BDD browsers failed execution.');
        process.exit(1);
    }
}
main();
