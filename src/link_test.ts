import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

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
  console.log('🤖 Attemping handshake with Gemini API (gemini-3.6-flash)...');

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
      contents: 'Respond with the single word: "CONNECTED"'
    });

    const resultText = response.text?.trim();
    if (resultText && resultText.includes('CONNECTED')) {
      console.log('🎉 Handshake successful! Connection verified.');
    } else {
      console.warn(`⚠️ Received unexpected response during handshake: "${resultText}"`);
    }
  } catch (err: any) {
    console.error('❌ Connection handshake failed:');
    console.error(err.message || err);
    process.exit(1);
  }
}

verifyConnection();
