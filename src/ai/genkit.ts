/**
 * @fileoverview This file initializes the Genkit AI instance with necessary plugins.
 * It should be the single source of truth for the `ai` object used throughout the app.
 */
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

// Initialize Genkit with the Google AI plugin.
// This `ai` object will be used to define flows, prompts, and models.
export const ai = genkit({
  plugins: [googleAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY })],
});
