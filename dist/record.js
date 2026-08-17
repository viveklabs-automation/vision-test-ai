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
exports.recordSession = recordSession;
const playwright_1 = require("playwright");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const readline = __importStar(require("readline"));
const DATA_DIR = path.join(__dirname, '..', 'data');
const SCREENSHOTS_DIR = path.join(DATA_DIR, 'screenshots');
// Ensure output directories exist
if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}
// Keep track of actions
let actions = [];
let stepCounter = 1;
async function recordSession(startUrl, sessionName = 'generated_test') {
    console.log(`🚀 Starting recording session on: ${startUrl} (Session: ${sessionName})`);
    const sessionScreenshotsDir = path.join(SCREENSHOTS_DIR, sessionName);
    if (!fs.existsSync(sessionScreenshotsDir)) {
        fs.mkdirSync(sessionScreenshotsDir, { recursive: true });
    }
    const browser = await playwright_1.chromium.launch({ headless: false });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        locale: 'en-IN',
        geolocation: { latitude: 20.5937, longitude: 78.9629 },
        permissions: ['geolocation']
    });
    const page = await context.newPage();
    // Expose function to page context
    await page.exposeFunction('onUserAction', async (actionData) => {
        try {
            const step = stepCounter++;
            const screenshotFilename = `step_${String(step).padStart(3, '0')}.jpg`;
            const screenshotPath = path.join(sessionScreenshotsDir, screenshotFilename);
            // Take screenshot of the page after the action
            // Give a tiny delay for page changes to settle
            await page.waitForTimeout(200);
            await page.screenshot({ path: screenshotPath, type: 'jpeg', quality: 60 });
            const record = {
                timestamp: Date.now(),
                step,
                action: actionData.action,
                url: page.url(),
                selector: actionData.selector,
                tagName: actionData.tagName,
                role: actionData.role,
                text: actionData.text,
                value: actionData.value,
                placeholder: actionData.placeholder,
                ariaLabel: actionData.ariaLabel,
                label: actionData.label,
                screenshotPath: path.relative(DATA_DIR, screenshotPath).replace(/\\/g, '/')
            };
            actions.push(record);
            console.log(`📸 Recorded Step ${step}: [${record.action.toUpperCase()}] on ${record.tagName} (${record.role}) - Text: "${record.text}"`);
            // Write actions log immediately using sessionName
            fs.writeFileSync(path.join(DATA_DIR, `${sessionName}_actions.json`), JSON.stringify(actions, null, 2));
        }
        catch (err) {
            console.error('Error logging action:', err);
        }
    });
    // Inject event listeners on page load/navigation
    await page.addInitScript(() => {
        window.addEventListener('DOMContentLoaded', () => {
            // Helper to generate a CSS selector for an element
            function getCssSelector(el) {
                if (el.id)
                    return `#${el.id}`;
                if (el.getAttribute('data-testid'))
                    return `[data-testid="${el.getAttribute('data-testid')}"]`;
                let path = [];
                let current = el;
                while (current && current.nodeType === Node.ELEMENT_NODE) {
                    let selector = current.nodeName.toLowerCase();
                    if (current.className) {
                        const classes = current.className.split(/\s+/).filter(c => c).join('.');
                        if (classes) {
                            selector += `.${classes}`;
                        }
                    }
                    // Avoid building infinite paths
                    if (current.id || current.getAttribute('data-testid')) {
                        const prefix = current.id ? `#${current.id}` : `[data-testid="${current.getAttribute('data-testid')}"]`;
                        path.unshift(prefix);
                        break;
                    }
                    let sibling = current;
                    let nth = 1;
                    while (sibling.previousElementSibling) {
                        sibling = sibling.previousElementSibling;
                        if (sibling.nodeName.toLowerCase() === current.nodeName.toLowerCase()) {
                            nth++;
                        }
                    }
                    if (nth > 1) {
                        selector += `:nth-of-type(${nth})`;
                    }
                    path.unshift(selector);
                    current = current.parentElement;
                }
                return path.join(' > ');
            }
            // Helper to guess accessible role
            function getAccessibleRole(el) {
                const explicitRole = el.getAttribute('role');
                if (explicitRole)
                    return explicitRole;
                const tagName = el.tagName.toLowerCase();
                if (tagName === 'button' || (tagName === 'input' && ['submit', 'button', 'reset'].includes(el.getAttribute('type') || ''))) {
                    return 'button';
                }
                if (tagName === 'a')
                    return 'link';
                if (tagName === 'input') {
                    const type = el.getAttribute('type') || 'text';
                    if (['checkbox', 'radio'].includes(type))
                        return type;
                    return 'textbox';
                }
                if (tagName === 'textarea')
                    return 'textbox';
                if (tagName === 'select')
                    return 'combobox';
                return 'generic';
            }
            // Helper to find associated label
            function getLabelText(el) {
                if (el.id) {
                    const label = document.querySelector(`label[for="${el.id}"]`);
                    if (label && label.textContent) {
                        return label.textContent.trim();
                    }
                }
                let parent = el.parentElement;
                while (parent) {
                    if (parent.tagName.toLowerCase() === 'label') {
                        return parent.textContent?.trim() || '';
                    }
                    parent = parent.parentElement;
                }
                return '';
            }
            // Attach click listener
            document.addEventListener('click', (e) => {
                const target = e.target;
                if (!target)
                    return;
                // Ignore clicks on outer html or body if they don't do anything, but log others
                if (['HTML', 'BODY'].includes(target.tagName))
                    return;
                const role = getAccessibleRole(target);
                const selector = getCssSelector(target);
                const text = target.textContent?.trim() || '';
                const ariaLabel = target.getAttribute('aria-label') || '';
                const label = getLabelText(target);
                window.onUserAction({
                    action: 'click',
                    selector,
                    tagName: target.tagName,
                    role,
                    text: text.substring(0, 100),
                    value: '',
                    placeholder: target.getAttribute('placeholder') || '',
                    ariaLabel,
                    label
                });
            }, true);
            // Attach input/change listener for inputs, textareas, selects
            document.addEventListener('change', (e) => {
                const target = e.target;
                if (!target)
                    return;
                const role = getAccessibleRole(target);
                const selector = getCssSelector(target);
                const text = '';
                const ariaLabel = target.getAttribute('aria-label') || '';
                const label = getLabelText(target);
                let value = target.value;
                if (target.type === 'checkbox' || target.type === 'radio') {
                    value = String(target.checked);
                }
                window.onUserAction({
                    action: 'change',
                    selector,
                    tagName: target.tagName,
                    role,
                    text,
                    value,
                    placeholder: target.getAttribute('placeholder') || '',
                    ariaLabel,
                    label
                });
            }, true);
            // Listen for special keypress events (like Enter in input)
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const target = e.target;
                    if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) {
                        const role = getAccessibleRole(target);
                        const selector = getCssSelector(target);
                        const ariaLabel = target.getAttribute('aria-label') || '';
                        const label = getLabelText(target);
                        const value = target.value || '';
                        window.onUserAction({
                            action: 'keypress',
                            selector,
                            tagName: target.tagName,
                            role,
                            text: 'Enter',
                            value,
                            placeholder: target.getAttribute('placeholder') || '',
                            ariaLabel,
                            label
                        });
                    }
                }
            }, true);
        });
    });
    // Load the initial url
    await page.goto(startUrl);
    // Take initial screenshot of the landing page
    const step = stepCounter++;
    const screenshotFilename = `step_${String(step).padStart(3, '0')}.jpg`;
    const screenshotPath = path.join(SCREENSHOTS_DIR, screenshotFilename);
    await page.screenshot({ path: screenshotPath, type: 'jpeg', quality: 60 });
    const record = {
        timestamp: Date.now(),
        step,
        action: 'navigation',
        url: startUrl,
        selector: 'body',
        tagName: 'BODY',
        role: 'document',
        text: 'Navigate to start URL',
        value: '',
        placeholder: '',
        ariaLabel: '',
        label: '',
        screenshotPath: path.relative(DATA_DIR, screenshotPath).replace(/\\/g, '/')
    };
    actions.push(record);
    fs.writeFileSync(path.join(DATA_DIR, 'actions.json'), JSON.stringify(actions, null, 2));
    console.log(`📸 Recorded Step ${step}: Initial Navigation to ${startUrl}`);
    // Setup prompt/listener for manual shutdown
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => {
        const cleanup = async () => {
            rl.close();
            try {
                await browser.close();
            }
            catch (e) { }
            console.log('✅ Recording completed and browser closed.');
            resolve();
            process.exit(0); // Force exit to shut down process.stdin handles in spawned environments
        };
        page.on('close', () => {
            console.log('⚠️ Browser page closed by user.');
            cleanup();
        });
        browser.on('disconnected', () => {
            console.log('⚠️ Browser window closed by user.');
            cleanup();
        });
        process.on('SIGINT', async () => {
            console.log('⚠️ Received SIGINT. Cleaning up...');
            await cleanup();
        });
        process.on('SIGTERM', async () => {
            console.log('⚠️ Received SIGTERM. Cleaning up...');
            await cleanup();
        });
        rl.question('Press Enter or type "q" and Enter to stop recording...\n', () => {
            cleanup();
        });
    });
}
// Run if called directly
if (require.main === module) {
    const urlArg = process.argv[2] || 'https://example.com';
    const nameArg = process.argv[3] || 'generated_test';
    recordSession(urlArg, nameArg).catch(console.error);
}
