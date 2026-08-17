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
exports.replaySession = replaySession;
const playwright_1 = require("playwright");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const DATA_DIR = path.join(__dirname, '..', 'data');
const SCREENSHOTS_DIR = path.join(DATA_DIR, 'screenshots');
// Helper to translate Puppeteer/Chrome Recorder nested selectors to the most stable single CSS or XPath selector
function getPlaywrightSelector(selectors) {
    if (!selectors || selectors.length === 0) {
        return '';
    }
    let bestSelector = '';
    let bestScore = -999999;
    for (const group of selectors) {
        if (!group || group.length === 0)
            continue;
        // Join the selector path. Playwright pierces shadow DOMs by default, 
        // so joining with a space works perfectly for CSS.
        let fullSelector = group.join(' ');
        // Translate xpath and aria selectors
        if (fullSelector.startsWith('xpath/')) {
            fullSelector = 'xpath=' + fullSelector.substring(6);
        }
        else if (fullSelector.startsWith('aria/')) {
            const ariaText = fullSelector.substring(5).replace(/\[role=".*"\]/, '');
            fullSelector = `text=${ariaText}`;
        }
        // Scoring system to find the most stable locator
        let score = 0;
        // 1. Prefer QA/testing-specific data attributes
        if (fullSelector.includes('data-testid') || fullSelector.includes('data-cy') || fullSelector.includes('data-qa')) {
            score += 100;
        }
        // 2. Penalize long UUIDs (e.g. #e170715b-dc8e-be2b-f845532414b5)
        const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
        if (uuidRegex.test(fullSelector)) {
            score -= 500;
        }
        // 3. Penalize other dynamic frameworks identifiers (e.g. #id-12345, #ember445)
        const dynamicIdRegex = /#([a-zA-Z_-]+[0-9]+|[0-9]+[a-zA-Z_-]+)/;
        if (dynamicIdRegex.test(fullSelector)) {
            score -= 150;
        }
        // 4. Slightly penalize very long nesting paths
        score -= fullSelector.split(' ').length * 2;
        if (score > bestScore) {
            bestScore = score;
            bestSelector = fullSelector;
        }
    }
    // Fallback to the very first selector if no scoring preference is matched
    if (!bestSelector && selectors.length > 0 && selectors[0].length > 0) {
        const primary = selectors[0][0];
        if (primary.startsWith('xpath/'))
            return 'xpath=' + primary.substring(6);
        if (primary.startsWith('aria/'))
            return `text=${primary.substring(5)}`;
        return primary;
    }
    return bestSelector;
}
// Helper to scrape metadata of the element before interacting
async function getElementMetadata(page, selector) {
    try {
        return await page.$eval(selector, (el) => {
            function getAccessibleRole(element) {
                const explicitRole = element.getAttribute('role');
                if (explicitRole)
                    return explicitRole;
                const tagName = element.tagName.toLowerCase();
                if (tagName === 'button' || (tagName === 'input' && ['submit', 'button', 'reset'].includes(element.getAttribute('type') || ''))) {
                    return 'button';
                }
                if (tagName === 'a')
                    return 'link';
                if (tagName === 'input') {
                    const type = element.getAttribute('type') || 'text';
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
            function getLabelText(element) {
                if (element.id) {
                    const label = document.querySelector(`label[for="${element.id}"]`);
                    if (label && label.textContent) {
                        return label.textContent.trim();
                    }
                }
                let parent = element.parentElement;
                while (parent) {
                    if (parent.tagName.toLowerCase() === 'label') {
                        return parent.textContent?.trim() || '';
                    }
                    parent = parent.parentElement;
                }
                return '';
            }
            return {
                tagName: el.tagName,
                role: getAccessibleRole(el),
                text: el.textContent?.trim().substring(0, 100) || '',
                value: el.value || '',
                placeholder: el.getAttribute('placeholder') || '',
                ariaLabel: el.getAttribute('aria-label') || '',
                label: getLabelText(el)
            };
        });
    }
    catch (e) {
        return {
            tagName: 'UNKNOWN',
            role: 'generic',
            text: '',
            value: '',
            placeholder: '',
            ariaLabel: '',
            label: ''
        };
    }
}
async function replaySession(jsonContent, sessionName = 'generated_test', onProgress) {
    const flow = JSON.parse(jsonContent);
    if (!flow || !Array.isArray(flow.steps)) {
        throw new Error('Invalid Chrome Recorder JSON. Steps array not found.');
    }
    const steps = flow.steps;
    const totalSteps = steps.length;
    console.log(`🎬 Starting headless replay of session "${sessionName}" with ${totalSteps} steps.`);
    const sessionScreenshotsDir = path.join(SCREENSHOTS_DIR, sessionName);
    if (!fs.existsSync(sessionScreenshotsDir)) {
        fs.mkdirSync(sessionScreenshotsDir, { recursive: true });
    }
    const browser = await playwright_1.chromium.launch({ headless: true });
    const viewportWidth = flow.viewport?.width || 1280;
    const viewportHeight = flow.viewport?.height || 720;
    const context = await browser.newContext({
        viewport: { width: viewportWidth, height: viewportHeight },
        locale: 'en-IN'
    });
    const page = await context.newPage();
    const actions = [];
    let stepCounter = 1;
    try {
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const stepIndex = i + 1;
            const progressMessage = `Executing step ${stepIndex}/${totalSteps}: [${step.type.toUpperCase()}]`;
            console.log(`⚡ ${progressMessage}`);
            if (onProgress) {
                onProgress(stepIndex, totalSteps, progressMessage);
            }
            const screenshotFilename = `step_${String(stepCounter).padStart(3, '0')}.jpg`;
            const screenshotPath = path.join(sessionScreenshotsDir, screenshotFilename);
            if (step.type === 'navigate') {
                await page.goto(step.url, { waitUntil: 'load', timeout: 30000 });
                await page.waitForTimeout(1000); // Allow settling
                await page.screenshot({ path: screenshotPath, type: 'jpeg', quality: 60 });
                actions.push({
                    timestamp: Date.now(),
                    step: stepCounter++,
                    action: 'navigation',
                    url: page.url(),
                    selector: 'body',
                    tagName: 'BODY',
                    role: 'document',
                    text: `Navigate to ${step.url}`,
                    value: '',
                    placeholder: '',
                    ariaLabel: '',
                    label: '',
                    screenshotPath: path.relative(DATA_DIR, screenshotPath).replace(/\\/g, '/')
                });
            }
            else if (step.type === 'click') {
                const selector = getPlaywrightSelector(step.selectors);
                if (selector) {
                    await page.waitForSelector(selector, { state: 'visible', timeout: 10000 });
                    const metadata = await getElementMetadata(page, selector);
                    await page.click(selector);
                    await page.waitForTimeout(1000); // Allow interaction transition
                    await page.screenshot({ path: screenshotPath, type: 'jpeg', quality: 60 });
                    actions.push({
                        timestamp: Date.now(),
                        step: stepCounter++,
                        action: 'click',
                        url: page.url(),
                        selector,
                        tagName: metadata.tagName,
                        role: metadata.role,
                        text: metadata.text,
                        value: '',
                        placeholder: metadata.placeholder,
                        ariaLabel: metadata.ariaLabel,
                        label: metadata.label,
                        screenshotPath: path.relative(DATA_DIR, screenshotPath).replace(/\\/g, '/')
                    });
                }
            }
            else if (step.type === 'change') {
                const selector = getPlaywrightSelector(step.selectors);
                if (selector) {
                    await page.waitForSelector(selector, { state: 'visible', timeout: 10000 });
                    const metadata = await getElementMetadata(page, selector);
                    await page.fill(selector, step.value);
                    await page.waitForTimeout(500);
                    await page.screenshot({ path: screenshotPath, type: 'jpeg', quality: 60 });
                    actions.push({
                        timestamp: Date.now(),
                        step: stepCounter++,
                        action: 'change',
                        url: page.url(),
                        selector,
                        tagName: metadata.tagName,
                        role: metadata.role,
                        text: '',
                        value: step.value,
                        placeholder: metadata.placeholder,
                        ariaLabel: metadata.ariaLabel,
                        label: metadata.label,
                        screenshotPath: path.relative(DATA_DIR, screenshotPath).replace(/\\/g, '/')
                    });
                }
            }
            else if (step.type === 'keyDown' || step.type === 'keyUp') {
                // We only explicitly handle KeyDown for Enter/Tab keypresses to trigger form submits or navigations
                if (step.type === 'keyDown' && ['Enter', 'Tab'].includes(step.key)) {
                    const selector = step.selectors ? getPlaywrightSelector(step.selectors) : null;
                    if (selector) {
                        await page.press(selector, step.key);
                    }
                    else {
                        await page.keyboard.press(step.key);
                    }
                    await page.waitForTimeout(1000); // Wait for transition
                    await page.screenshot({ path: screenshotPath, type: 'jpeg', quality: 60 });
                    actions.push({
                        timestamp: Date.now(),
                        step: stepCounter++,
                        action: 'keypress',
                        url: page.url(),
                        selector: selector || 'window',
                        tagName: selector ? 'ELEMENT' : 'WINDOW',
                        role: 'generic',
                        text: step.key,
                        value: '',
                        placeholder: '',
                        ariaLabel: '',
                        label: '',
                        screenshotPath: path.relative(DATA_DIR, screenshotPath).replace(/\\/g, '/')
                    });
                }
            }
            else if (step.type === 'waitForElement') {
                const selector = getPlaywrightSelector(step.selectors);
                if (selector) {
                    await page.waitForSelector(selector, { state: 'visible', timeout: 15000 });
                }
            }
            else {
                console.warn(`⚠️ Warning: Unhandled step type "${step.type}"`);
            }
        }
        // Write actions log scoped by sessionName
        const actionsPath = path.join(DATA_DIR, `${sessionName}_actions.json`);
        fs.writeFileSync(actionsPath, JSON.stringify(actions, null, 2), 'utf-8');
        // Also write a copy to default actions.json for backward compatibility
        fs.writeFileSync(path.join(DATA_DIR, 'actions.json'), JSON.stringify(actions, null, 2), 'utf-8');
        console.log(`...`);
    }
    catch (error) {
        console.error('❌ Error during headless replay:', error);
        throw error;
    }
    finally {
        await browser.close();
    }
}
// Run CLI directly if invoked
if (require.main === module) {
    const jsonFilePath = process.argv[2];
    const nameArg = process.argv[3] || 'generated_test';
    if (!jsonFilePath) {
        console.error('Usage: ts-node src/replay.ts <path-to-chrome-recorder-json> [session-name]');
        process.exit(1);
    }
    const jsonContent = fs.readFileSync(path.resolve(jsonFilePath), 'utf-8');
    replaySession(jsonContent, nameArg)
        .then(() => process.exit(0))
        .catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
