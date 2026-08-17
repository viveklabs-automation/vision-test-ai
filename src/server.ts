import * as dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import httpProxy from 'http-proxy';
import { generateTestScript, compileDirectlyFromChromeRecorder, ensureCommonStepFiles } from './generate';
import { replaySession } from './replay';
import { cleanWorkspace } from './clean';

// Programmatically start Xvfb and VNC display servers in CI/Cloud Docker container
async function startVirtualScreen() {
  if (process.env.CI === 'true') {
    console.log('🖥️ Cloud environment detected. Starting Xvfb virtual display (:99)...');
    try {
      const logsDir = path.join(ROOT_DIR, 'logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      const xvfbLog = fs.openSync(path.join(logsDir, 'xvfb.log'), 'a');
      const xvfb = spawn('Xvfb', [':99', '-screen', '0', '1280x720x24', '-ac', '+extension', 'GLX', '+render', '-noreset'], {
        detached: true,
        stdio: ['ignore', xvfbLog, xvfbLog]
      });
      xvfb.unref();
      process.env.DISPLAY = ':99';

      // Wait for Xvfb to start (up to 5 seconds)
      const socketPath = '/tmp/.X11-unix/X99';
      let ready = false;
      for (let i = 0; i < 50; i++) {
        if (fs.existsSync(socketPath)) {
          ready = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (!ready) {
        throw new Error('Xvfb did not start within 5 seconds.');
      }
      console.log('🖥️ Xvfb is ready.');

      console.log('🪟 Starting Fluxbox window manager...');
      const fluxboxLog = fs.openSync(path.join(logsDir, 'fluxbox.log'), 'a');
      const fluxbox = spawn('fluxbox', [], {
        detached: true,
        stdio: ['ignore', fluxboxLog, fluxboxLog]
      });
      fluxbox.unref();

      console.log('🔒 Starting x11vnc server on port 5900...');
      const x11vncLog = fs.openSync(path.join(logsDir, 'x11vnc.log'), 'a');
      const x11vnc = spawn('x11vnc', ['-display', ':99', '-rfbport', '5900', '-forever', '-shared', '-nopw'], {
        detached: true,
        stdio: ['ignore', x11vncLog, x11vncLog]
      });
      x11vnc.unref();

      console.log('🌐 Starting websockify / noVNC on port 6080...');
      const websockifyLog = fs.openSync(path.join(logsDir, 'websockify.log'), 'a');
      const websockify = spawn('websockify', ['--web', '/usr/share/novnc', '6080', '127.0.0.1:5900'], {
        detached: true,
        stdio: ['ignore', websockifyLog, websockifyLog]
      });
      websockify.unref();
      
      console.log('✅ Virtual display stack successfully initialized.');
    } catch (err: any) {
      console.error('⚠️ Warning: Failed to start virtual display stack:', err.message);
    }
  }
}

startVirtualScreen().catch(console.error);

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');

// Guarantee runtime directories and baseline BDD files exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
try {
  ensureCommonStepFiles();
} catch (e) {
  console.warn('Could not initialize common step files on startup:', e);
}

app.use(express.json());
app.use(express.static(path.join(ROOT_DIR, 'public')));

// Create VNC proxy instance
const proxy = httpProxy.createProxyServer({});
proxy.on('error', (err, req, res) => {
  console.error('VNC Proxy Error:', err.message);
  if (res && 'writeHead' in res) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('VNC Display Server is initializing. Please refresh in a few seconds...');
  }
});

// Proxy HTTP requests for /vnc to noVNC web interface
app.use('/vnc', (req: Request, res: Response) => {
  proxy.web(req, res, { target: 'http://127.0.0.1:6080' });
});

// Helper to recursively read generated files and content
function getFileTree(dir: string, relativePath = ''): any[] {
  const result: any[] = [];
  if (!fs.existsSync(dir)) return result;
  
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const itemPath = path.join(dir, item);
    const relPath = path.join(relativePath, item).replace(/\\/g, '/');
    const isDirectory = fs.statSync(itemPath).isDirectory();
    
    if (isDirectory) {
      result.push({
        name: item,
        path: relPath,
        isDirectory: true,
        children: getFileTree(itemPath, relPath)
      });
    } else {
      if (item.endsWith('.ts') || item.endsWith('.feature') || item.endsWith('.spec.ts')) {
        result.push({
          name: item,
          path: relPath,
          isDirectory: false,
          content: fs.readFileSync(itemPath, 'utf-8')
        });
      }
    }
  }
  return result;
}

// 1. GET /api/scenarios - List recorded sessions
app.get('/api/scenarios', (req: Request, res: Response) => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      return res.json([]);
    }
    const files = fs.readdirSync(DATA_DIR);
    const scenarios = files
      .filter(file => file.endsWith('_actions.json'))
      .map(file => file.replace('_actions.json', ''));
    res.json(scenarios);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. GET /api/files - Get generated specs & page classes
app.get('/api/files', (req: Request, res: Response) => {
  try {
    const tree = getFileTree(OUTPUT_DIR);
    res.json(tree);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Active recording process state
let activeRecordProcess: ChildProcess | null = null;
let activeRecordSessionName: string | null = null;
let activeRecordStatus: 'idle' | 'recording' | 'success' | 'failed' = 'idle';
let activeRecordError: string | null = null;

// Active replay status state
let activeReplayStatus: 'idle' | 'replaying' | 'success' | 'failed' = 'idle';
let activeReplayMessage = '';
let activeReplayStep = 0;
let activeReplayTotalSteps = 0;
let activeReplayError: string | null = null;
let activeReplaySessionName: string | null = null;

// 3. POST /api/record - Start interactive recording session asynchronously
app.post('/api/record', (req: Request, res: Response) => {
  const { url, sessionName } = req.body;
  if (!url || !sessionName) {
    return res.status(400).json({ error: 'url and sessionName are required' });
  }

  if (activeRecordStatus === 'recording') {
    return res.status(400).json({ error: 'A recording session is already active.' });
  }
  
  console.log(`🎬 Launching headed recorder for ${url} (Session: ${sessionName})...`);
  activeRecordStatus = 'recording';
  activeRecordSessionName = sessionName;
  activeRecordError = null;

  activeRecordProcess = spawn('npx', ['ts-node', 'src/record.ts', url, sessionName], {
    shell: true,
    cwd: ROOT_DIR,
    env: process.env
  });

  activeRecordProcess.on('close', (code) => {
    console.log(`🎬 Recording session finished (Exit code: ${code})`);
    if (code === 0) {
      activeRecordStatus = 'success';
    } else {
      activeRecordStatus = 'failed';
      activeRecordError = `Recorder exited with code ${code}`;
    }
    activeRecordProcess = null;
  });

  activeRecordProcess.on('error', (err) => {
    console.error(`🎬 Recording session failed to start:`, err);
    activeRecordStatus = 'failed';
    activeRecordError = err.message;
    activeRecordProcess = null;
  });

  res.json({ success: true, status: 'recording' });
});

// 3a. GET /api/record/status - Get the status of the active recording session
app.get('/api/record/status', (req: Request, res: Response) => {
  res.json({
    status: activeRecordStatus,
    sessionName: activeRecordSessionName,
    error: activeRecordError
  });
});

// 3b. POST /api/record/stop - Force stop the active recording session
app.post('/api/record/stop', (req: Request, res: Response) => {
  if (activeRecordProcess) {
    console.log('🎬 Manually stopping recording session...');
    try {
      activeRecordProcess.kill('SIGINT');
    } catch (e) {
      console.error('Failed to kill record process:', e);
    }
    res.json({ success: true, message: 'Stop signal sent' });
  } else {
    res.status(400).json({ error: 'No active recording session to stop' });
  }
});

// 3c. POST /api/upload-recorder - Upload and compile a Chrome DevTools Recorder JSON file directly
app.post('/api/upload-recorder', async (req: Request, res: Response) => {
  const { jsonContent, sessionName } = req.body;
  if (!jsonContent || !sessionName) {
    return res.status(400).json({ error: 'jsonContent and sessionName are required' });
  }

  console.log(`🔮 Compiling Chrome Recorder JSON directly for session: ${sessionName}...`);
  try {
    await compileDirectlyFromChromeRecorder(jsonContent, sessionName);
    res.json({ success: true, compiled: true });
  } catch (error: any) {
    console.error('❌ Direct compilation failed:', error);
    res.status(500).json({ error: error.message || String(error) });
  }
});

// 3d. GET /api/upload-status - Get the status of the upload (kept for backward compatibility)
app.get('/api/upload-status', (req: Request, res: Response) => {
  res.json({ status: 'success', message: 'Compilation complete' });
});

// 4. POST /api/compile - Trigger Gemini compilation
app.post('/api/compile', async (req: Request, res: Response) => {
  const { sessionName } = req.body;
  if (!sessionName) {
    return res.status(400).json({ error: 'sessionName is required' });
  }
  try {
    await generateTestScript(sessionName);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. GET /api/run-test - Run tests and stream console output via Server-Sent Events (SSE)
app.get('/api/run-test', (req: Request, res: Response) => {
  const type = req.query.type as string; // 'playwright', 'heal', 'bdd'
  const sessionName = req.query.sessionName as string;
  const browser = req.query.browser as string || 'chrome';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let cmd = '';
  let args: string[] = [];

  const isCloudEnv = process.env.CI === 'true' || process.env.RENDER === 'true' || (process.platform === 'linux' && !process.env.DISPLAY);
  const headedArgs = isCloudEnv ? [] : ['--headed'];

  if (type === 'playwright') {
    cmd = 'npx';
    args = ['playwright', 'test', `output/specs/${sessionName}.spec.ts`, `--project=${browser}`, ...headedArgs];
  } else if (type === 'heal') {
    cmd = 'npx';
    args = ['ts-node', 'src/heal.ts', `output/specs/${sessionName}.spec.ts`, `--project=${browser}`];
  } else if (type === 'bdd') {
    cmd = 'npx';
    args = [
      'cucumber-js',
      `output/features/${sessionName}.feature`,
      '--require-module', 'ts-node/register',
      '--require', 'output/steps/**/*.ts'
    ];
  }

  const modeLabel = isCloudEnv ? 'Headless Cloud mode' : 'Headed mode';
  res.write(`data: ${JSON.stringify({ log: `⚡ Executing (${modeLabel}): ${cmd} ${args.join(' ')}\n\n` })}\n\n`);

  const env = { ...process.env, BROWSER: browser };
  const child = spawn(cmd, args, { shell: true, cwd: ROOT_DIR, env });

  child.stdout.on('data', (data) => {
    res.write(`data: ${JSON.stringify({ log: data.toString() })}\n\n`);
  });

  child.stderr.on('data', (data) => {
    res.write(`data: ${JSON.stringify({ log: data.toString() })}\n\n`);
  });

  child.on('close', (code) => {
    res.write(`data: ${JSON.stringify({ status: 'done', code })}\n\n`);
    res.end();
  });
});

// 6. GET /api/autopilot-stream - Stream full Auto-Pilot Pipeline (Compile -> Playwright -> Self-Heal)
app.get('/api/autopilot-stream', async (req: Request, res: Response) => {
  const sessionName = req.query.sessionName as string;
  const browser = (req.query.browser as string) || 'chrome';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendLog = (msg: string) => {
    res.write(`data: ${JSON.stringify({ log: msg })}\n\n`);
  };

  sendLog(`\n🚀 [Auto-Pilot Pipeline] Commencing for session: ${sessionName}\n`);
  sendLog(`🎯 Target Browser: ${browser.toUpperCase()}\n`);
  sendLog(`1️⃣ Phase 1: Validating compiled artifacts...\n`);

  const specPath = path.join(OUTPUT_DIR, 'specs', `${sessionName}.spec.ts`);
  if (!fs.existsSync(specPath)) {
    sendLog(`⚠️ Spec file not found at ${specPath}. Triggering Gemini compilation...\n`);
    try {
      await generateTestScript(sessionName);
      sendLog(`✨ Artifacts successfully compiled!\n`);
    } catch (err: any) {
      sendLog(`❌ Compilation failed: ${err.message}\n`);
      res.write(`data: ${JSON.stringify({ status: 'done', code: 1, error: err.message })}\n\n`);
      return res.end();
    }
  } else {
    sendLog(`✅ Existing artifacts verified (${specPath}).\n`);
  }

  sendLog(`\n2️⃣ Phase 2: Launching Autonomous Test Runner with Self-Healing...\n\n`);

  const cmd = 'npx';
  const args = ['ts-node', 'src/heal.ts', `output/specs/${sessionName}.spec.ts`, `--project=${browser}`];
  const env = { ...process.env, BROWSER: browser };
  const child = spawn(cmd, args, { shell: true, cwd: ROOT_DIR, env });

  child.stdout.on('data', (data) => {
    res.write(`data: ${JSON.stringify({ log: data.toString() })}\n\n`);
  });

  child.stderr.on('data', (data) => {
    res.write(`data: ${JSON.stringify({ log: data.toString() })}\n\n`);
  });

  child.on('close', (code) => {
    res.write(`data: ${JSON.stringify({ status: 'done', code })}\n\n`);
    res.end();
  });
});

// 7. POST /api/clear - Clear all generated workspace artifacts and reset state
app.post('/api/clear', (req: Request, res: Response) => {
  try {
    cleanWorkspace();
    ensureCommonStepFiles();
    res.json({ success: true, message: 'Workspace cleared successfully' });
  } catch (error: any) {
    console.error('Failed to clear workspace:', error);
    res.status(500).json({ error: error.message || String(error) });
  }
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Web Dashboard server running at http://localhost:${PORT}`);
});

// Upgrade WebSocket connections for websockify (VNC binary traffic)
server.on('upgrade', (req, socket, head) => {
  if (req.url?.includes('websockify')) {
    req.url = '/'; // websockify expects the websocket connection at root
    proxy.ws(req, socket, head, { target: 'ws://127.0.0.1:6080' });
  }
});
