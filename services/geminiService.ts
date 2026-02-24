import {
  ExtractionResult,
  SCRTNode,
  ClinicalElement,
  SCRTInferenceResult,
} from "../types";

// ===============================
// OLLAMA CONFIGURATION
// ===============================
const OLLAMA_BASE_URL = (import.meta as any)?.env?.VITE_OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = (import.meta as any)?.env?.VITE_OLLAMA_MODEL || "MedAIBase/MedGemma1.5:4b";

const DEFAULT_OPTIONS = {
  temperature: 0.1, // Low for extraction precision
  num_predict: 2048,
  top_k: 20,
  seed: 101,
};

// ===============================
// UTILS: ROBUST PARSING & RETRY
// ===============================

/**
 * Handles JSON extraction from LLM text. 
 * Small models often add conversational text; this stack-based parser 
 * finds the first valid object or array.
 */
function extractFirstJson(text: string): any {
  const cleaned = (text || "").trim();
  
  // Try regex for markdown fences first
  const fenced = cleaned.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return JSON.parse(fenced[1].trim());

  const startObj = cleaned.indexOf("{");
  const startArr = cleaned.indexOf("[");
  const start = startObj === -1 ? startArr : startArr === -1 ? startObj : Math.min(startObj, startArr);

  if (start === -1) throw new Error("No JSON found in model output.");

  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{" || ch === "[") stack.push(ch);
    if (ch === "}" || ch === "]") stack.pop();
    if (stack.length === 0) {
      return JSON.parse(cleaned.slice(start, i + 1));
    }
  }
  throw new Error("Unbalanced JSON in model output.");
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1500): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const msg = error?.message?.toLowerCase() || "";
    // Fatal logic errors
    if (msg.includes("json") || msg.includes("syntax") || msg.includes("400")) throw error;
    
    if (retries > 0) {
      console.warn(`Ollama retry: ${msg}. Retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

async function ollamaRequest(prompt: string, options = {}): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      options: { ...DEFAULT_OPTIONS, ...options },
    }),
  });

  if (!res.ok) throw new Error(`Ollama Error (${res.status}): ${res.statusText}`);
  const data = await res.json();
  return data?.message?.content || "";
}

// ===============================
// EXPORTED SERVICES
// ===============================

/**
 * AGSI vNext - Structural & Contextual Ingestion
 */
export const medgemma_autonomous_ingestion = async (input: { text: string; file?: any }): Promise<ExtractionResult> => {
  if (input.file) {
    console.warn("Ollama ingestion: Local vision models not triggered. Converting file to text metadata first.");
  }

  return withRetry(async () => {
    const prompt = `
You are the SCRT vNext Architect AI (Medical Ontology Expert).
MISSION: Structure medical knowledge from the input into strict JSON.

CRITICAL RULES:
1. NEVER extract lone adjectives (e.g., "Palmar"). Use compound concepts (e.g., "Palmar erythema").
2. CONTEXT: Anatomical adjectives ("antral", "lobar") go to 'contexte.lesionnel', not symptoms.
3. MEASURES: Separate number and unit (e.g., "Hb" value "12", unit "g/dL").
4. Return ONLY valid JSON matching this schema:
{
  "pathology": "string",
  "node_kind": "pathology" | "syndrome" | "protocol",
  "taxonomy": { "discipline": "string", "specialty": "string" },
  "contexte": {
    "definition": "string",
    "lesionnel": { "typical_sites": [], "anatomical_context": "string" },
    "examens_preuves": [{ "label": "string", "role": "gold_standard"|"orientation", "notes": "string" }]
  },
  "clinical_elements": [{ "root_term": "string", "type": "symptome"|"signe_clinique"|"mesure", "characteristics": [], "values": [], "unit": "string" }]
}

INPUT TEXT:
"""
${input.text}
"""
    `.trim();

    const raw = await ollamaRequest(prompt);
    return extractFirstJson(raw) as ExtractionResult;
  });
};

/**
 * Concept Extraction for Chat UI
 */
export const medgemma_chat_concept_extractor = async (userInput: string, knownGrammarSample: string[]): Promise<{ name: string; value: any }[]> => {
  return withRetry(async () => {
    const prompt = `
Extract atomic clinical concepts from the text. Return a JSON array only.
GRAMMAR SAMPLE: ${knownGrammarSample.slice(0, 50).join(", ")}
TEXT: "${userInput}"
OUTPUT SCHEMA: [{"name": "string", "value": "string"}]
    `.trim();

    const raw = await ollamaRequest(prompt, { temperature: 0 });
    const parsed = extractFirstJson(raw);
    return Array.isArray(parsed) ? parsed : [];
  });
};

/**
 * Expert Reasoning over SCRT Inference Results
 */
export const medgemma_clinical_reasoning = async (inferenceResults: SCRTInferenceResult[], originalText: string): Promise<string> => {
  return withRetry(async () => {
    const diagnosisContext = inferenceResults.map(r => 
      `- ${r.node.pathology} (Confidence: ${r.score.toFixed(1)}) | Reasoning: ${r.reasoningPath.join(', ')}`
    ).join('\n');

    const prompt = `
Act as a senior clinical expert. Analyze this case using the SCRT engine suggestions.
CLINICAL CASE: "${originalText}"
SCRT SUGGESTIONS:
${diagnosisContext}

Format your response with:
# Synthesis
# Relevance Analysis
# Diagnostic Conclusion
# Management / Next Steps
    `.trim();

    return await ollamaRequest(prompt, { temperature: 0.3 });
  });
};

/**
 * Direct medical reasoning without SCRT context
 */
export const medgemma_direct_reasoning = async (userInput: string): Promise<string> => {
  return withRetry(async () => {
    const prompt = `
Act as a senior medical expert. Directly analyze this case.
CLINICAL CASE: "${userInput}"

Provide structured synthesis, hypotheses, and management steps.
    `.trim();

    return await ollamaRequest(prompt, { temperature: 0.3 });
  });
};

/**
 * Medical Knowledge Base Enrichment
 */
export const medgemma_pathology_enrichment = async (text: string): Promise<{ updatedNodes: Partial<SCRTNode>[]; explanation: string }> => {
  return withRetry(async () => {
    const prompt = `
Assistant for medical knowledge enrichment.
User Request: "${text}"
Return JSON: { "explanation": "string", "updatedNodes": [{"pathology": "string", "description": "string", "specialty": "string"}] }
    `.trim();

    const raw = await ollamaRequest(prompt);
    const result = extractFirstJson(raw);
    return {
      updatedNodes: result.updatedNodes || [],
      explanation: result.explanation || "Processing complete.",
    };
  });
};

/**
 * Simple healthcheck for UI status
 */
export async function ollama_healthcheck(): Promise<{ ok: boolean; model: string }> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    return { ok: res.ok, model: OLLAMA_MODEL };
  } catch {
    return { ok: false, model: OLLAMA_MODEL };
  }
}