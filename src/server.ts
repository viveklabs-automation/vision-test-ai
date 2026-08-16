import express, { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import httpProxy from 'http-proxy';
import { generateTestScript } from './generate';

// Programmatically start Xvfb and VNC display servers in CI/Cloud Docker container
function startVirtualScreen() {
  if (process.env.CI === 'true') {
    console.log('🖥️ Cloud environment detected. Starting Xvfb virtual display (:99)...');
    try {
      const xvfb = spawn('Xvfb', [':99', '-screen', '0', '1280x720x24', '-ac', '+extension', 'GLX', '+render', '-noreset'], {
        detached: true,
        stdio: 'ignore'
      });
      xvfb.unref();
      process.env.DISPLAY = ':99';

      console.log('🪟 Starting Fluxbox window manager...');
      const fluxbox = spawn('fluxbox', [], {
        detached: true,
        stdio: 'ignore'
      });
      fluxbox.unref();

      console.log('🔒 Starting x11vnc server on port 5900...');
      const x11vnc = spawn('x11vnc', ['-display', ':99', '-rfbport', '5900', '-forever', '-shared'], {
        detached: true,
        stdio: 'ignore'
      });
      x11vnc.unref();

      console.log('🌐 Starting websockify / noVNC on port 6080...');
      const websockify = spawn('websockify', ['--web', '/usr/share/novnc', '6080', '127.0.0.1:5900'], {
        detached: true,
        stdio: 'ignore'
      });
      websockify.unref();
      
      console.log('✅ Virtual display stack successfully initialized.');
    } catch (err: any) {
      console.error('⚠️ Warning: Failed to start virtual display stack:', err.message);
    }
  }
}

startVirtualScreen();

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');

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

// 3. POST /api/record - Start interactive recording session
app.post('/api/record', (req: Request, res: Response) => {
  const { url, sessionName } = req.body;
  if (!url || !sessionName) {
    return res.status(400).json({ error: 'url and sessionName are required' });
  }
  
  console.log(`🎬 Launching headed recorder for ${url} (Session: ${sessionName})...`);
  const child = spawn('npx', ['ts-node', 'src/record.ts', url, sessionName], {
    shell: true,
    cwd: ROOT_DIR,
    env: process.env
  });

  child.on('close', (code) => {
    console.log(`🎬 Recording session finished (Exit code: ${code})`);
    if (code === 0) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: `Recorder exited with code ${code}` });
    }
  });
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
  const browser = req.query.browser as string; // 'chrome', 'edge'

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let cmd = '';
  let args: string[] = [];

  if (type === 'playwright') {
    // Force headed mode since Xvfb virtual display is running in the cloud container
    cmd = 'npx';
    args = ['playwright', 'test', `output/specs/${sessionName}.spec.ts`, `--project=${browser}`, '--headed'];
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

  res.write(`data: ${JSON.stringify({ log: `⚡ Executing (Headed mode): ${cmd} ${args.join(' ')}\n\n` })}\n\n`);

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
