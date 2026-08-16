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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ROOT_DIR = path.join(__dirname, '..');
const pathsToClean = [
    path.join(ROOT_DIR, 'data'),
    path.join(ROOT_DIR, 'output'),
    path.join(ROOT_DIR, 'test-results')
];
console.log('🧹 Cleaning up generated test session assets...');
for (const dir of pathsToClean) {
    if (fs.existsSync(dir)) {
        try {
            // Delete children to keep the directory structures intact but empty
            const children = fs.readdirSync(dir);
            for (const child of children) {
                const childPath = path.join(dir, child);
                fs.rmSync(childPath, { recursive: true, force: true });
            }
            console.log(`✅ Cleaned: ${dir}`);
        }
        catch (error) {
            console.warn(`⚠️ Warning: Failed to clean ${dir}:`, error);
        }
    }
}
console.log('✨ Workspace cleaned successfully!');
