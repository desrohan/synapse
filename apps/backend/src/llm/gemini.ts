import { GoogleGenAI, Type, Schema } from '@google/genai';

let aiInstance: GoogleGenAI | null = null;
function getAI() {
  if (!aiInstance) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY must be set in environment');
    }
    aiInstance = new GoogleGenAI({ apiKey: key });
  }
  return aiInstance;
}

const graphSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    nodes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, description: "Type of the node, e.g. Person, Ticket, Commit, PullRequest, Message, Project" },
          external_id: { type: Type.STRING, description: "Unique identifier for this entity in the external system" },
          properties: { type: Type.OBJECT, description: "Key-value pairs of attributes like name, status, title, url" }
        },
        required: ["type", "external_id", "properties"]
      }
    },
    edges: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          source_external_id: { type: Type.STRING, description: "The external_id of the source node" },
          target_external_id: { type: Type.STRING, description: "The external_id of the target node" },
          relation_type: { type: Type.STRING, description: "Type of relation, e.g. CREATED, ASSIGNED_TO, BLOCKED_BY, MENTIONS, WORKS_ON" },
          properties: { type: Type.OBJECT, description: "Key-value pairs for edge attributes" }
        },
        required: ["source_external_id", "target_external_id", "relation_type"]
      }
    }
  },
  required: ["nodes", "edges"]
};

export class ContextProcessor {
  async extractEntities(provider: string, payload: any) {
    const prompt = `You are a knowledge graph extraction engine for Synapse, a personalized AI agent.
Analyze the following webhook payload from ${provider.toUpperCase()}.
Extract the core entities (Nodes) and their relationships (Edges).
Be highly accurate and strict. Do not hallucinate keys or data.

Payload:
${JSON.stringify(payload)}
    `;

    try {
      const response = await getAI().models.generateContent({
        model: 'gemini-2.5-pro',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: graphSchema,
        }
      });
      return JSON.parse(response.text || '{"nodes":[],"edges":[]}');
    } catch (err) {
      console.error('Failed to process context with Gemini', err);
      throw err;
    }
  }

  async generateSummary(context: string) {
    const prompt = `Summarize the following work context. Focus on priorities, blockers, and recent updates.\n\nContext: ${context}`;
    const response = await getAI().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    return response.text;
  }
}

export const contextProcessor = new ContextProcessor();
