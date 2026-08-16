import { spawn } from 'child_process';
import * as path from 'path';

function runBrowserBdd(browser: 'chrome' | 'edge'): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`🚀 Starting Cucumber BDD on [${browser.toUpperCase()}]...`);
    
    // Path to the cucumber-js executable
    const cucumberBin = path.join(__dirname, '..', 'node_modules', '@cucumber', 'cucumber', 'bin', 'cucumber.js');
    const args = [
      'output/features/**/*.feature',
      '--require-module', 'ts-node/register',
      '--require', 'output/steps/**/*.ts'
    ];
    
    const child = spawn('node', [cucumberBin, ...args], {
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
      } else {
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
  } catch (err) {
    console.error('❌ One or more BDD browsers failed execution.');
    process.exit(1);
  }
}

main();
