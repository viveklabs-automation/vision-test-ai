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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const http_proxy_1 = __importDefault(require("http-proxy"));
const generate_1 = require("./generate");
// Programmatically start Xvfb and VNC display servers in CI/Cloud Docker container
function startVirtualScreen() {
    if (process.env.CI === 'true') {
        console.log('🖥️ Cloud environment detected. Starting Xvfb virtual display (:99)...');
        try {
            const xvfb = (0, child_process_1.spawn)('Xvfb', [':99', '-screen', '0', '1280x720x24', '-ac', '+extension', 'GLX', '+render', '-noreset'], {
                detached: true,
                stdio: 'ignore'
            });
            xvfb.unref();
            process.env.DISPLAY = ':99';
            console.log('🪟 Starting Fluxbox window manager...');
            const fluxbox = (0, child_process_1.spawn)('fluxbox', [], {
                detached: true,
                stdio: 'ignore'
            });
            fluxbox.unref();
            console.log('🔒 Starting x11vnc server on port 5900...');
            const x11vnc = (0, child_process_1.spawn)('x11vnc', ['-display', ':99', '-rfbport', '5900', '-forever', '-shared'], {
                detached: true,
                stdio: 'ignore'
            });
            x11vnc.unref();
            console.log('🌐 Starting websockify / noVNC on port 6080...');
            const websockify = (0, child_process_1.spawn)('websockify', ['--web', '/usr/share/novnc', '6080', 'localhost:5900'], {
                detached: true,
                stdio: 'ignore'
            });
            websockify.unref();
            console.log('✅ Virtual display stack successfully initialized.');
        }
        catch (err) {
            console.error('⚠️ Warning: Failed to start virtual display stack:', err.message);
        }
    }
}
startVirtualScreen();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
app.use(express_1.default.json());
app.use(express_1.default.static(path.join(ROOT_DIR, 'public')));
// Create VNC proxy instance
const proxy = http_proxy_1.default.createProxyServer({});
proxy.on('error', (err, req, res) => {
    console.error('VNC Proxy Error:', err.message);
    if (res && 'writeHead' in res) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('VNC Display Server is initializing. Please refresh in a few seconds...');
    }
});
// Proxy HTTP requests for /vnc to noVNC web interface
app.use('/vnc', (req, res) => {
    proxy.web(req, res, { target: 'http://localhost:6080' });
});
// Helper to recursively read generated files and content
function getFileTree(dir, relativePath = '') {
    const result = [];
    if (!fs.existsSync(dir))
        return result;
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
        }
        else {
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
app.get('/api/scenarios', (req, res) => {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            return res.json([]);
        }
        const files = fs.readdirSync(DATA_DIR);
        const scenarios = files
            .filter(file => file.endsWith('_actions.json'))
            .map(file => file.replace('_actions.json', ''));
        res.json(scenarios);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 2. GET /api/files - Get generated specs & page classes
app.get('/api/files', (req, res) => {
    try {
        const tree = getFileTree(OUTPUT_DIR);
        res.json(tree);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 3. POST /api/record - Start interactive recording session
app.post('/api/record', (req, res) => {
    const { url, sessionName } = req.body;
    if (!url || !sessionName) {
        return res.status(400).json({ error: 'url and sessionName are required' });
    }
    console.log(`🎬 Launching headed recorder for ${url} (Session: ${sessionName})...`);
    const child = (0, child_process_1.spawn)('npx', ['ts-node', 'src/record.ts', url, sessionName], {
        shell: true,
        cwd: ROOT_DIR,
        env: process.env
    });
    child.on('close', (code) => {
        console.log(`🎬 Recording session finished (Exit code: ${code})`);
        if (code === 0) {
            res.json({ success: true });
        }
        else {
            res.status(500).json({ error: `Recorder exited with code ${code}` });
        }
    });
});
// 4. POST /api/compile - Trigger Gemini compilation
app.post('/api/compile', async (req, res) => {
    const { sessionName } = req.body;
    if (!sessionName) {
        return res.status(400).json({ error: 'sessionName is required' });
    }
    try {
        await (0, generate_1.generateTestScript)(sessionName);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 5. GET /api/run-test - Run tests and stream console output via Server-Sent Events (SSE)
app.get('/api/run-test', (req, res) => {
    const type = req.query.type; // 'playwright', 'heal', 'bdd'
    const sessionName = req.query.sessionName;
    const browser = req.query.browser; // 'chrome', 'edge'
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    let cmd = '';
    let args = [];
    if (type === 'playwright') {
        // Force headed mode since Xvfb virtual display is running in the cloud container
        cmd = 'npx';
        args = ['playwright', 'test', `output/specs/${sessionName}.spec.ts`, `--project=${browser}`, '--headed'];
    }
    else if (type === 'heal') {
        cmd = 'npx';
        args = ['ts-node', 'src/heal.ts', `output/specs/${sessionName}.spec.ts`, `--project=${browser}`];
    }
    else if (type === 'bdd') {
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
    const child = (0, child_process_1.spawn)(cmd, args, { shell: true, cwd: ROOT_DIR, env });
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
        proxy.ws(req, socket, head, { target: 'ws://localhost:6080' });
    }
});
