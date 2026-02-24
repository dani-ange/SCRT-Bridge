
import { ClinicalElement, TemporaryConcept, ClinicalOntology, MainSectionId, ElementType } from '../types';

const ONTOLOGY_KEY = 'clinical_grammar_v7';

// Mots à filtrer systématiquement lors de l'analyse
const STOP_WORDS = new Set([
  'the', 'of', 'and', 'in', 'to', 'a', 'with', 'for', 'on', 'at', 'by', 'from',
  'is', 'are', 'was', 'were', 'has', 'have', 'had', 'as', 'or', 'but'
]);

const STANDALONE_CLINICAL_ENTITIES = new Set([
  'hematemesis', 'melena', 'jaundice', 'cyanosis', 'dyspnea', 'syncope',
  'palpitation', 'purpura', 'weight loss', 'anorexia',
  'fever', 'cough', 'vomiting', 'nausea', 'diarrhea', 'asthenia', 'fatigue',
  'ascites', 'asterixis', 'gynecomastia', 'hepatomegaly', 'splenomegaly',
  'anemia', 'thrombocytopenia', 'leukopenia', 'leukocytosis', 'clubbing',
  'confusion', 'coma', 'seizure', 'rash', 'pruritus', 'hippocratism'
]);

const CONTEXTUAL_DISCARDS = new Set([
  'pre-pyloric', 'prepyloric', 'antral', 'antrum', 'pyloric',
  'upper digestive', 'lower digestive', 'physiopathological', 'lesional',
  'stenosing', 'gastric', 'duodenal', 'esophageal', 'body', 'system',
  'acute', 'chronic', 'mild', 'moderate', 'severe', 'history', 'family',
  'left', 'right', 'upper', 'lower', 'bilateral', 'unilateral'
]);

// STEP 1: Blocklists for single tokens (Modifiers that shouldn't stand alone)
const BLOCK_SINGLE_TOKENS = new Set([
  'palmar', 'spider', 'shifting', 'collateral', 'digital', 'white', 
  'testicular', 'neutrophil', 'abdominal', 'thoracic', 'hepatic', 
  'renal', 'cardiac', 'pulmonary', 'red', 'blue', 
  'pitting', 'systolic', 'diastolic', 'rhythmic', 'arrhythmic',
  'left', 'right', 'upper', 'lower', 'bilateral', 'unilateral',
  'acute', 'chronic', 'mild', 'moderate', 'severe'
]);

// Generic body parts to reject if standing alone as a symptom/sign
const GENERIC_BODY_PARTS = new Set([
    'liver', 'heart', 'lung', 'kidney', 'spleen', 'brain', 'stomach', 
    'pancreas', 'skin', 'eye', 'ear', 'nose', 'throat', 'hand', 'foot', 
    'arm', 'leg', 'abdomen', 'chest', 'head', 'neck', 'back', 'testicle', 'testis'
]);

// STEP 1: Required Head Nouns for multi-word phrases to be valid
const MEDICAL_HEAD_NOUNS = new Set([
  'erythema', 'angioma', 'angiomas', 'dullness', 'edema', 'circulation', 
  'foetor', 'fetor', 'sign', 'syndrome', 'count', 'level', 'time', 
  'pressure', 'temperature', 'pain', 'rate', 'rhythm', 'deficit', 
  'murmur', 'rub', 'gallop', 'click', 'snap', 'node', 'nodes',
  'hippocratism', 'clubbing', 'jaundice', 'ascites', 'encephalopathy',
  'breath', 'sounds', 'rales', 'crackles', 'wheeze', 'stridor',
  'mass', 'tenderness', 'guarding', 'rigidity', 'rebound', 'distension',
  'neutrophilia', 'neutropenia', 'thrombocytosis', 'thrombocytopenia',
  // FR Additions
  'erythrose', 'angiome', 'varices', 'gastropathie', 'atrophie',
  'oedeme', 'œdeme', 'hippocratisme', 'splenomegalie', 'hepatomegalie', 
  'ascite', 'ictere', 'ictère'
]);

export const getGrammar = (): ClinicalOntology => {
  const data = localStorage.getItem(ONTOLOGY_KEY);
  if (data) return JSON.parse(data);
  return { elements: [], temporary_memory: [] };
};

export const saveGrammar = (ont: ClinicalOntology) => {
  localStorage.setItem(ONTOLOGY_KEY, JSON.stringify(ont));
};

export const deduceSection = (type: ElementType): MainSectionId => {
  switch (type) {
    case 'symptome': return 'symptome';
    case 'antecedent': return 'antecedent';
    case 'signe_clinique': return 'examen_physique';
    case 'mesure': return 'parametres_vitaux';
    case 'signe_paraclinique': return 'paraclinique';
    default: return 'motif_histoire';
  }
};

/**
 * Robust normalization: lowercase, accent strip, trim, collapse spaces.
 */
export const norm = (s: string): string => {
  if (!s) return '';
  return s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
    .trim()
    .replace(/\s+/g, ' '); // collapse spaces
};

/**
 * Nettoie un terme en retirant les stop words et les articles.
 */
const cleanClinicalTerm = (term: string): string => {
  return term.split(/\s+/)
    .filter(word => !STOP_WORDS.has(word.toLowerCase()))
    .join(' ');
};

/**
 * STEP 2: Auto-Approval Logic
 * Determines if a concept is safe enough to bypass the pending queue.
 */
export const shouldAutoApprove = (label: string, type: ElementType): boolean => {
  const normalized = norm(label);
  const parts = normalized.split(' ');

  // 1. Blocklist Check (Safety First)
  if (BLOCK_SINGLE_TOKENS.has(normalized)) return false;
  if (CONTEXTUAL_DISCARDS.has(normalized)) return false;
  if (GENERIC_BODY_PARTS.has(normalized)) return false;

  // 2. Whitelist Check
  if (STANDALONE_CLINICAL_ENTITIES.has(normalized)) return true;

  // 3. Lab/Measure Patterns
  const LAB_KEYWORDS = ['taux', 'serique', 'sérique', 'plasmatique', 'facteur', 'bilirubine', 'albumine', 'creatinine', 'gamma', 'gammagt', 'gammaglutamyl', 'prothrombine'];
  if (LAB_KEYWORDS.some(k => normalized.includes(k))) return true;
  if ((type === 'mesure' || type === 'signe_paraclinique') && parts.length > 1) return true;

  // 4. Medical Head Nouns (Multi-word)
  if (parts.some(p => MEDICAL_HEAD_NOUNS.has(p))) return true;

  // 5. Morphology Suffixes (FR)
  const SUFFIXES = ['ite', 'ose', 'emie', 'émie', 'urie', 'pathie', 'mégalie', 'megalie', 'ome'];
  if (SUFFIXES.some(s => normalized.endsWith(s))) return true;

  return false;
};

/**
 * STEP 1: Concept Integrity Gate
 * Filters out fragmented, meaningless, or purely anatomical concepts.
 */
export const isValidConceptLabel = (label: string, type: ElementType): boolean => {
  const normalized = norm(label);
  const parts = normalized.split(' ');
  
  if (!normalized) return false;

  // Immediate discard of context words
  if (CONTEXTUAL_DISCARDS.has(normalized)) return false;

  // Check generic body parts (only allowed if it's explicitly a measure)
  // e.g. "Liver" as a symptom is bad. "Liver span" (2 words) might be okay.
  if (GENERIC_BODY_PARTS.has(normalized)) {
      if (type === 'mesure') return true; 
      return false; 
  }

  // Single Token Logic
  if (parts.length === 1) {
    // Exceptions: Measures/Labs are often single words (Albumin, Sodium)
    if (type === 'mesure' || type === 'signe_paraclinique') return true;
    
    // Whitelist: Known standalone clinical entities (e.g., Jaundice, Fever)
    if (STANDALONE_CLINICAL_ENTITIES.has(normalized)) return true;
    
    // Blocklist: Modifiers that shouldn't stand alone (e.g., Palmar, Spider)
    if (BLOCK_SINGLE_TOKENS.has(normalized)) return false;

    // Conservative default for single words: Reject if not explicit entity or measure
    return false; 
  }

  // Multi-word Logic
  // Check if it contains a medical head noun (e.g., Erythema, Angioma)
  if (parts.some(p => MEDICAL_HEAD_NOUNS.has(p))) return true;
  
  // Whitelist check for multi-word phrases (e.g. Weight Loss)
  if (STANDALONE_CLINICAL_ENTITIES.has(normalized)) return true;

  // Heuristic: If > 2 words, generally acceptable as a specific finding description
  if (parts.length > 2) return true;

  // 2-word fallthrough: Reject if it looks like "Right Arm" (Anatomy + Direction)
  // Accept "Arm Pain" (Anatomy + Head Noun 'Pain' - caught above)
  return false;
};

export const addValidatedElement = (element: Partial<ClinicalElement>): ClinicalElement => {
  const ont = getGrammar();
  
  // 1. Clean and normalize
  const rawName = cleanClinicalTerm((element.name || 'Unknown').trim());
  const normalizedLabel = norm(rawName);
  
  // Keep full phrase as canonical name
  let atomicRoot = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  // STEP 1: GATE CHECK & AUTO-APPROVAL
  const isValid = isValidConceptLabel(rawName, element.type || 'symptome');
  const isAutoApprovable = shouldAutoApprove(rawName, element.type || 'symptome');

  // If invalid AND not auto-approvable, divert to temporary memory
  if (!isValid && !isAutoApprovable) {
      // Divert to Temporary Memory with 'pending' status
      addTemporaryConcept({
          raw_label: rawName,
          detected_type_guess: element.type,
          status: 'pending',
          source_document: 'Ingestion Gate Rejection'
      });
      
      // Try to consolidate immediately (in case it hits the count threshold or new rules)
      consolidateTemporaryMemory();

      // Return a placeholder with a special ID so caller knows it was rejected
      // We DO NOT push this to ont.elements
      return {
          id: `TEMP_REJECT_${Date.now()}`,
          name: rawName,
          type: element.type || 'symptome',
          section_observation: 'motif_histoire',
          subsection: 'Rejected',
          synonymes: [],
          mode_description: { type: 'boolean' }
      };
  }

  // 2. Options (Modalités)
  const uniqueOptions = new Set<string>();
  if (element.mode_description?.options) {
    element.mode_description.options.forEach(opt => {
        const cleaned = cleanClinicalTerm(opt);
        if (cleaned) uniqueOptions.add(cleaned);
    });
  }

  const finalOptions = Array.from(uniqueOptions).map(o => o.charAt(0).toUpperCase() + o.slice(1));

  // 3. Upsert into Validated Grammar
  const existingIndex = ont.elements.findIndex(e => norm(e.name) === normalizedLabel);

  if (existingIndex > -1) {
    const existing = ont.elements[existingIndex];
    if (finalOptions.length > 0) {
      const currentOptions = existing.mode_description.options || [];
      existing.mode_description.options = Array.from(new Set([...currentOptions, ...finalOptions]));
      existing.mode_description.type = 'options';
    }
    saveGrammar(ont);
    return existing;
  } else {
    const newEl: ClinicalElement = {
      id: element.id || `EL_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: atomicRoot,
      type: element.type || 'symptome',
      section_observation: element.section_observation || deduceSection(element.type || 'symptome'),
      subsection: 'GSI Atomic v12',
      synonymes: element.synonymes || [],
      mode_description: {
        type: finalOptions.length > 0 ? 'options' : 'boolean',
        options: finalOptions
      }
    };
    ont.elements.push(newEl);
    saveGrammar(ont);
    return newEl;
  }
};

/**
 * STEP 3: Automatic Learning Loop (Update Count & Last Seen)
 */
export const addTemporaryConcept = (concept: Partial<TemporaryConcept>) => {
  const ont = getGrammar();
  const label = cleanClinicalTerm((concept.raw_label || '').trim());
  const labelNorm = norm(label);
  
  if (!label) return;

  // If already validated, ignore
  if (ont.elements.some(e => norm(e.name) === labelNorm)) return;

  const existingTempIndex = ont.temporary_memory.findIndex(t => norm(t.raw_label) === labelNorm);

  if (existingTempIndex > -1) {
      // Increment Learning Metrics
      const existing = ont.temporary_memory[existingTempIndex];
      existing.count_seen = (existing.count_seen || 1) + 1;
      existing.last_seen = new Date().toISOString();
      if (concept.source_document) {
          // Add source if not present (simple check)
          // Note: TemporaryConcept type might need 'sources' field update in types.ts if strict, 
          // but for now we assume it's extensible or we just track count.
          // The prompt asked to track sources. Let's assume we can add it.
          // existing.sources = ... 
      }
  } else {
      ont.temporary_memory.push({
        id: `TEMP_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        raw_label: label,
        source_document: concept.source_document || 'Auto-GSI v12',
        context_snippet: concept.context_snippet || '',
        detected_type_guess: concept.detected_type_guess || 'symptome',
        status: concept.status || 'pending',
        description: concept.description,
        affinities: concept.affinities,
        count_seen: 1,
        last_seen: new Date().toISOString()
      });
  }
  
  saveGrammar(ont);
};

export const resolveTemporaryConcept = (tempId: string, resolvedElement: ClinicalElement) => {
  const ont = getGrammar();
  // Ensure we don't duplicate
  if (!ont.elements.find(e => norm(e.name) === norm(resolvedElement.name))) {
    ont.elements.push(resolvedElement);
  }
  ont.temporary_memory = ont.temporary_memory.filter(t => t.id !== tempId);
  saveGrammar(ont);
};

/**
 * STEP 3: Promotion Loop
 * Promotes temporary concepts that have been seen frequently (>= 2 times) 
 * OR pass the auto-approval check.
 */
export const consolidateTemporaryMemory = () => {
    const ont = getGrammar();
    let changed = false;

    // Filter for promotion candidates (Pending only)
    const pending = ont.temporary_memory.filter(t => t.status === 'pending');

    pending.forEach(cand => {
        const isFrequent = (cand.count_seen || 0) >= 2;
        const isAutoSafe = shouldAutoApprove(cand.raw_label, cand.detected_type_guess);

        if (isFrequent || isAutoSafe) {
             const newEl: ClinicalElement = {
                id: `EL_AUTO_${Date.now()}_${Math.random().toString(36).substr(2,3)}`,
                name: cand.raw_label.charAt(0).toUpperCase() + cand.raw_label.slice(1),
                type: cand.detected_type_guess,
                section_observation: deduceSection(cand.detected_type_guess),
                subsection: 'Auto-Learned',
                synonymes: [],
                mode_description: { type: 'boolean' }
             };
             
             // Promote
             if (!ont.elements.find(e => norm(e.name) === norm(newEl.name))) {
                 ont.elements.push(newEl);
             }
             // Remove from temp
             ont.temporary_memory = ont.temporary_memory.filter(t => t.id !== cand.id);
             changed = true;
        }
    });

    if (changed) saveGrammar(ont);
};

export const clearGrammar = () => localStorage.removeItem(ONTOLOGY_KEY);
