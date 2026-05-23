import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export class ContextProcessor {
  async extractEntities(payload: any) {
    const prompt = `Extract entities, relationships, priority, and state from the following event payload. Output strictly as JSON.
    Payload: ${JSON.stringify(payload)}
    `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        }
      });
      return JSON.parse(response.text || '{}');
    } catch (err) {
      console.error('Failed to process context with Gemini', err);
      throw err;
    }
  }

  async generateSummary(context: string) {
    const prompt = `Summarize the following work context. Focus on priorities, blockers, and recent updates.\n\nContext: ${context}`;
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    return response.text;
  }
}

export const contextProcessor = new ContextProcessor();
