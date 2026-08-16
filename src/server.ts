import express, { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { generateTestScript } from './generate';

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');

app.use(express.json());
app.use(express.static(path.join(ROOT_DIR, 'public')));

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
      // Avoid loading binary files or logs
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

// 4. GET /api/run-test - Run tests and stream console output via Server-Sent Events (SSE)
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
    // For cloud environment run headless, otherwise run headed
    const headlessFlag = process.env.CI ? '' : '--headed';
    cmd = 'npx';
    args = ['playwright', 'test', `output/specs/${sessionName}.spec.ts`, `--project=${browser}`, headlessFlag].filter(Boolean);
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

  res.write(`data: ${JSON.stringify({ log: `⚡ Executing: ${cmd} ${args.join(' ')}\n\n` })}\n\n`);

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

app.listen(PORT, () => {
  console.log(`🚀 Web Dashboard server running at http://localhost:${PORT}`);
});
