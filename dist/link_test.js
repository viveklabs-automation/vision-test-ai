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
const genai_1 = require("@google/genai");
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
dotenv.config();
async function verifyConnection() {
    console.log('🔗 Running Phase 2: Link (Connectivity Check)...');
    // Check if .env exists
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) {
        console.error('❌ Error: .env file does not exist. Please create one with your GEMINI_API_KEY.');
        process.exit(1);
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('❌ Error: GEMINI_API_KEY is not defined in .env.');
        process.exit(1);
    }
    if (apiKey === 'your-gemini-api-key-here') {
        console.error('❌ Error: GEMINI_API_KEY is still set to the placeholder value. Please update it with your actual key.');
        process.exit(1);
    }
    console.log('✅ Found GEMINI_API_KEY in .env.');
    console.log('🤖 Attemping handshake with Gemini API (gemini-3.5-flash)...');
    try {
        const ai = new genai_1.GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: 'Respond with the single word: "CONNECTED"'
        });
        const resultText = response.text?.trim();
        if (resultText && resultText.includes('CONNECTED')) {
            console.log('🎉 Handshake successful! Connection verified.');
        }
        else {
            console.warn(`⚠️ Received unexpected response during handshake: "${resultText}"`);
        }
    }
    catch (err) {
        console.error('❌ Connection handshake failed:');
        console.error(err.message || err);
        process.exit(1);
    }
}
verifyConnection();
