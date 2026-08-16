import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config();

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('No GEMINI_API_KEY found.');
    return;
  }
  try {
    const ai = new GoogleGenAI({ apiKey });
    console.log('Listing available models...');
    const pager: any = await ai.models.list();
    console.log('Keys of pager:', Object.keys(pager));
    // Let's print the raw response properties
    if (pager.models) {
      console.log('Using pager.models:');
      for (const m of pager.models) {
        console.log(`- ${m.name}`);
      }
    } else {
      console.log('No pager.models found. Trying iteration...');
      // Try async iteration
      try {
        for await (const m of pager) {
          console.log(`- ${m.name}`);
        }
      } catch (err: any) {
        console.error('Async iteration failed:', err.message);
      }
    }
  } catch (err: any) {
    console.error('Error listing models:', err.message || err);
  }
}

listModels();
