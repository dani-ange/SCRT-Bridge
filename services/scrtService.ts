
import { SCRTNode, SCRTStore, ClinicalObservationData, SCRTModality, SCRTSyndrome, SCRTInferenceResult, ExtractionResult, SCRTConceptTree, ConceptStore, MedicalIndex, MedicalIndexNode, SCRTConcept, LogicalOperator, ElementType, MainSectionId, NodeKind, SCRTNodeLink, SCRTEdge } from '../types';
import { getGrammar, addValidatedElement, consolidateTemporaryMemory, norm as grammarNorm } from './grammarService';
import { norm, resolveLabelSemantics, resolveToConceptId } from './conceptResolver';
import { saveSemanticLink } from './semanticLinkService';

const SCRT_KEY = 'scrt_memory_v10_next_gen';
const DRAFT_KEY = 'scrt_draft_extraction';
const EDGES_KEY = 'scrt_edges_v1';
const MIGRATION_KEY = 'scrt_migration_v2_links';

// Robust Normalization
const normalizeString = (s: string): string => {
  if (!s) return '';
  return s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, ' ');
};

export const scrt_get_edges = (): SCRTEdge[] => {
    const data = localStorage.getItem(EDGES_KEY);
    return data ? JSON.parse(data) : [];
};

export const scrt_upsert_edge = (edge: SCRTEdge) => {
    const edges = scrt_get_edges();
    const key = (e: SCRTEdge) => `${normalizeString(e.source_id)}|${normalizeString(e.relation)}|${normalizeString(e.target_id)}`;
    const newKey = key(edge);
    
    const idx = edges.findIndex(e => key(e) === newKey);
    if (idx > -1) {
        edges[idx].count_seen = (edges[idx].count_seen || 1) + 1;
        edges[idx].strength = (edges[idx].strength || 1) + (edge.strength || 1);
        edges[idx].last_seen = new Date().toISOString();
        if (edge.sources) {
             edges[idx].sources = Array.from(new Set([...(edges[idx].sources || []), ...edge.sources]));
        }
    } else {
        edges.push({
            ...edge,
            count_seen: 1,
            strength: edge.strength || 1,
            last_seen: new Date().toISOString(),
            sources: edge.sources || ['ingestion']
        });
    }
    localStorage.setItem(EDGES_KEY, JSON.stringify(edges));
};

const INITIAL_STORE: SCRTStore = {
  nodes: [],
  syndromes: [
    {
      id: 'SYND_CONDENSATION',
      label: 'Pulmonary Condensation Syndrome',
      description: 'Physical signs of densified parenchyma.',
      concept_ids: ['SIG_MATITE', 'SYM_TOUX']
    }
  ],
  concept_store: { concepts: [] },
  index: {
    root: { id: 'MEDICINE', label: 'Medicine', children: [], linked_pathologies: [] }
  }
};

// --- Persistence ---

const scrt_link_existing_nodes = (store: SCRTStore) => {
    if (localStorage.getItem(MIGRATION_KEY)) return;
    
    console.log("Running SCRT Migration: Linking Existing Nodes...");
    let changed = false;

    store.nodes.forEach(node => {
        if (node.node_kind === 'guideline' || node.node_kind === 'protocol' || node.node_kind === 'syndrome') {
            // Check if already linked
            if (node.links && node.links.some(l => l.relation === 'applies_to')) return;

            // Try to infer target from title or pathology name
            // Heuristic: "Management of Anaphylaxis" -> "Anaphylaxis"
            const label = node.title || node.pathology;
            const match = label.match(/(Management|Protocol|Guideline) (of|for) (.+)/i);
            
            if (match) {
                const targetName = match[3].trim();
                const resolvedTargetName = resolveLabelSemantics(targetName);
                // Find target
                const targetNode = store.nodes.find(n => 
                    normalizeString(n.pathology) === normalizeString(targetName) ||
                    (n.title && normalizeString(n.title) === normalizeString(targetName)) ||
                    (normalizeString(n.pathology) === normalizeString(resolvedTargetName))
                );

                if (targetNode) {
                    console.log(`Auto-linking ${node.pathology} -> ${targetNode.pathology}`);
                    
                    // Link Source -> Target
                    if (!node.links) node.links = [];
                    node.links.push({ relation: 'applies_to', target_node_id: targetNode.node_id });
                    
                    // Link Target -> Source
                    if (!targetNode.links) targetNode.links = [];
                    const reverseRel = node.node_kind === 'syndrome' ? 'has_syndrome' : 'has_protocol';
                    if (!targetNode.links.find(l => l.target_node_id === node.node_id && l.relation === reverseRel)) {
                        targetNode.links.push({ relation: reverseRel, target_node_id: node.node_id });
                    }

                    // Edges
                    scrt_upsert_edge({ source_id: node.node_id, relation: 'applies_to', target_id: targetNode.node_id, strength: 1, sources: ['migration'] });
                    scrt_upsert_edge({ source_id: targetNode.node_id, relation: reverseRel, target_id: node.node_id, strength: 1, sources: ['migration'] });
                    
                    changed = true;
                }
            }
        }
    });

    if (changed) {
        scrt_save_store(store);
    }
    localStorage.setItem(MIGRATION_KEY, 'true');
};

export const scrt_get_store = (): SCRTStore => {
  const data = localStorage.getItem(SCRT_KEY);
  if (!data) return INITIAL_STORE;
  
  const parsed = JSON.parse(data);
  // Migration protection
  if (!parsed.concept_store) parsed.concept_store = { concepts: [] };
  if (!parsed.index) parsed.index = { root: { id: 'MEDICINE', label: 'Medicine', children: [], linked_pathologies: [] } };
  
  scrt_link_existing_nodes(parsed);
  
  return parsed;
};

const scrt_save_store = (store: SCRTStore) => {
  localStorage.setItem(SCRT_KEY, JSON.stringify(store));
};

export const scrt_clear = () => {
  localStorage.removeItem(SCRT_KEY);
};

export const scrt_get_draft = (): ExtractionResult | null => {
  const data = localStorage.getItem(DRAFT_KEY);
  return data ? JSON.parse(data) : null;
};

export const scrt_set_draft = (result: ExtractionResult | null) => {
  if (result) localStorage.setItem(DRAFT_KEY, JSON.stringify(result));
  else localStorage.removeItem(DRAFT_KEY);
};

// --- Concept Store Logic (Canonical) ---

const normalizeLabel = (s: string) => s.trim().toLowerCase();

export const scrt_upsert_concept = (
  store: SCRTStore, 
  partial: { label: string; type: ElementType; synonyms?: string[]; unit?: string }
): string => {
  const normLabel = normalizeLabel(partial.label);
  
  // 1. Resolve Canonical ID
  const existingId = resolveToConceptId(store, partial.label);
  let existing = existingId ? store.concept_store.concepts.find(c => c.concept_id === existingId) : undefined;

  if (existing) {
    // Merge synonyms
    if (partial.synonyms) {
      const newSyns = partial.synonyms.filter(s => !existing!.synonyms.includes(s));
      existing.synonyms.push(...newSyns);
    }
    // Update unit if missing
    if (partial.unit && !existing.unit) existing.unit = partial.unit;
    return existing.concept_id;
  }

  // 2. Create New
  const newId = `CPT_${Date.now()}_${Math.floor(Math.random()*1000)}`;
  const sectionMap: Record<string, MainSectionId> = {
    'symptome': 'symptome',
    'signe_clinique': 'examen_physique',
    'mesure': 'parametres_vitaux',
    'signe_paraclinique': 'paraclinique',
    'antecedent': 'antecedent'
  };

  const newConcept: SCRTConcept = {
    concept_id: newId,
    label: partial.label,
    type: partial.type,
    synonyms: partial.synonyms || [],
    negatable: true,
    unit: partial.unit,
    ui_config: {
      section_default: sectionMap[partial.type] || 'motif_histoire',
      widget_type: partial.unit ? 'numeric' : 'boolean',
      options: [] 
    }
  };

  store.concept_store.concepts.push(newConcept);
  return newId;
};

// --- Indexing Logic (Scalability) ---

const rebuildMedicalIndex = (store: SCRTStore) => {
  const root: MedicalIndexNode = { id: 'MEDICINE', label: 'Medicine', children: [], linked_pathologies: [] };

  store.nodes.forEach(node => {
    // Ensure Disc/Spec exist
    const discLabel = node.discipline || 'General';
    const specLabel = node.specialty || 'General';

    let discNode = root.children.find(c => c.label === discLabel);
    if (!discNode) {
      discNode = { id: `DISC_${discLabel}`, label: discLabel, children: [], linked_pathologies: [] };
      root.children.push(discNode);
    }

    let specNode = discNode.children.find(c => c.label === specLabel);
    if (!specNode) {
      specNode = { id: `SPEC_${specLabel}`, label: specLabel, children: [], linked_pathologies: [] };
      discNode.children.push(specNode);
    }

    if (!specNode.linked_pathologies.includes(node.node_id)) {
      specNode.linked_pathologies.push(node.node_id);
    }
  });

  store.index.root = root;
};

const searchMedicalIndex = (store: SCRTStore, activeConcepts: string[]): string[] => {
  // Simple heuristic: If no concepts provided, scan all.
  if (activeConcepts.length === 0) return store.nodes.map(n => n.node_id);

  // In a real large-scale app, we would tag Specialty Nodes with "Trigger Concepts".
  // For now, we return ALL nodes because our dataset is small (<1000).
  return store.nodes.map(n => n.node_id);
};


// --- Inference Engine (vNext) ---

// Helper: Normalize Observation Values (Step 2)
const normalizeObsValue = (val: any): any => {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '') return null; // Empty string is null/absent
    if (trimmed.toLowerCase() === 'true') return true;
    if (trimmed.toLowerCase() === 'false') return false;
    // Check strict numeric
    if (!isNaN(Number(trimmed))) return Number(trimmed);
    return trimmed;
  }
  return val;
};

// Helper: Determine Presence based on Concept Type (Step 2)
const isPresentByConcept = (
  branch: SCRTConceptTree, 
  value: any, 
  store: SCRTStore, 
  grammarById: Map<string, any>
): boolean => {
  if (value === null) return false;

  const conceptId = branch.concept_id;
  let type: 'boolean' | 'numeric' | 'text' = 'text'; // Default

  // 1. Resolve Type from Store
  const storeConcept = store.concept_store.concepts.find(c => c.concept_id === conceptId);
  if (storeConcept) {
      const w = storeConcept.ui_config.widget_type;
      if (w === 'numeric' || w === 'scale' || storeConcept.unit) type = 'numeric';
      else if (w === 'boolean') type = 'boolean';
  } else {
      // 2. Resolve Type from Grammar (Legacy)
      const el = grammarById.get(conceptId);
      if (el) {
          const m = el.mode_description?.type;
          if (m === 'numeric' || m === 'scale') type = 'numeric';
          else if (m === 'boolean') type = 'boolean';
      } else {
          // 3. Fallback Heuristic
          if (typeof value === 'number') type = 'numeric';
          else if (typeof value === 'boolean') type = 'boolean';
      }
  }

  // 3. Presence Rules
  switch (type) {
    case 'boolean': return value === true;
    case 'numeric': return typeof value === 'number'; // 0 is Valid, even for VAS or Counts
    case 'text': return typeof value === 'string' && value.length > 0;
  }
  return false;
};

const evaluateCondition = (condition: { operator: string, threshold: any }, value: any): boolean => {
  // Value is already normalized (number, boolean, string) via normalizeObsValue
  if (value === undefined || value === null) return false;
  
  let v = value;
  let t = condition.threshold;

  // Step 3: Strong Type Handling for Numeric Modalities
  if (typeof t === 'number') {
      // If threshold is numeric (from parser), force value to number if it's a numeric string
      // (Safety double check, though normalizeObsValue usually handles this)
      if (typeof v === 'string') {
           const parsedV = parseFloat(v);
           if (isNaN(parsedV)) return false; // Cannot compare string "High" to number 10 with inequality
           v = parsedV;
      }
      
      if (typeof v !== 'number') return false; // Strict type check for numeric comparisons

      switch (condition.operator) {
        case 'gt': return v > t;
        case 'lt': return v < t;
        case 'gte': return v >= t;
        case 'lte': return v <= t;
        case 'eq': return v === t;
        default: return false;
      }
  }

  // Fallback for String/Boolean conditions
  switch (condition.operator) {
    case 'eq': 
      if (typeof v === 'string' && typeof t === 'string') {
          return v.toLowerCase().trim() === t.toLowerCase().trim();
      }
      return v == t; // loose equality for boolean/legacy
    case 'contains': 
      return String(v).toLowerCase().includes(String(t).toLowerCase());
    default: return false;
  }
};

/**
 * SCRT Query Engine with Semantic Resolution (Step 1) & Activation Logic (Step 2)
 */
export const querySCRT = (observation: ClinicalObservationData): SCRTInferenceResult[] => {
  const store = scrt_get_store();
  const grammar = getGrammar(); 
  const grammarById = new Map(grammar.elements.map(e => [e.id, e]));
  
  // 1. Build an O(1) Map with Semantic Resolution
  // We map: ElementID -> Value, NormalizedLabel -> Value, ResolvedLabel -> Value, ConceptID -> Value
  const obsMap = new Map<string, any>();

  observation.values.forEach(v => {
    // A. Direct Element ID
    obsMap.set(v.element_id, v.value);
    
    // B. Resolve Name & Semantics
    // Find the grammar element to get the raw name
    const el = grammar.elements.find(e => e.id === v.element_id);
    
    if (el) {
       const rawName = el.name;
       const normalizedName = norm(rawName);
       
       // Map normalized name
       obsMap.set(normalizedName, v.value);

       // Map resolved semantic label (e.g., "Angina" -> "Chest Pain")
       // This handles transitive links (Angina -> Chest Pain) via conceptResolver
       const resolvedLabel = resolveLabelSemantics(rawName);
       if (resolvedLabel && resolvedLabel !== normalizedName) {
           obsMap.set(resolvedLabel, v.value);
       }

       // Map Canonical Concept IDs from the Store
       // Check 1: Does the raw name map to a concept ID?
       const cid1 = resolveToConceptId(store, rawName);
       if (cid1) obsMap.set(cid1, v.value);

       // Check 2: Does the resolved label map to a concept ID?
       // e.g. "Angina" resolved to "chest pain", which maps to CPT_CHEST_PAIN
       if (resolvedLabel) {
           const cid2 = resolveToConceptId(store, resolvedLabel);
           if (cid2) obsMap.set(cid2, v.value);
       }
    }
  });

  // Debug Log to verify Semantic Expansion
  // console.log("SCRT Inference Map Keys:", Array.from(obsMap.keys()));

  // 2. Filter Candidates (Top-Down)
  const candidateIds = searchMedicalIndex(store, Array.from(obsMap.keys()));

  // 3. Convolution
  const results = candidateIds.map(nodeId => {
    const node = store.nodes.find(n => n.node_id === nodeId);
    if (!node) return null;

    let score = 0;
    const activeModalities: SCRTModality[] = [];
    const activeConceptIds = new Set<string>();
    const matchedConcepts: string[] = [];
    const unmatchedConcepts: string[] = [];

    const clinicalTree = [...(node.clinique?.symptomes || []), ...(node.clinique?.signes || [])];

    clinicalTree.forEach((branch: SCRTConceptTree) => {
      // Priority 1: Direct Concept ID Match (Fastest)
      let rawValue = obsMap.get(branch.concept_id);
      
      // Priority 2: Legacy/Name Match
      if (rawValue === undefined) {
          // If branch.concept_id is actually a legacy ID (e.g. EL_...), 
          // we might need to look it up in grammar to get the name, 
          // then check the obsMap for that name.
          const grammarEl = grammarById.get(branch.concept_id);
          if (grammarEl) {
              rawValue = obsMap.get(norm(grammarEl.name));
              
              // Try resolved semantics if direct name failed
              if (rawValue === undefined) {
                  const resolved = resolveLabelSemantics(grammarEl.name);
                  rawValue = obsMap.get(resolved);
              }
          }
      }

      // STEP 2: Normalize & Check Presence
      const vNorm = normalizeObsValue(rawValue);

      if (isPresentByConcept(branch, vNorm, store, grammarById)) {
        score += 1; // Presence score
        activeConceptIds.add(branch.concept_id);
        matchedConcepts.push(branch.concept_id);

        const modalities = branch.modalities || [];
        // Sort by weight to take the strongest match
        const triggered = modalities
          .filter(mod => evaluateCondition(mod.condition, vNorm))
          .sort((a, b) => b.score - a.score)[0];

        if (triggered) {
          activeModalities.push(triggered);
          score += triggered.score;
        }
      } else {
        unmatchedConcepts.push(branch.concept_id);
      }
    });

    // Pivot Bonus
    const pivots = node.clinique?.modalites_pivots || [];
    pivots.forEach(pivot => {
      // Check simple text inclusion in original narrative
      if (observation.reconstructedText?.toLowerCase().includes(pivot.toLowerCase())) {
        score += 15;
      }
    });

    // Syndrome Bonus
    const activeSyndromes = store.syndromes.filter(syn => {
      if (!node.syndromes?.includes(syn.id)) return false;
      // Syndrome active if at least 1 of its components is active (simplified for demo)
      return syn.concept_ids.filter(cid => activeConceptIds.has(cid)).length >= 1;
    });

    score += activeSyndromes.length * 10;

    // 4. Name/Title Keyword Matching (Semantic Rescue)
    const normalizeForSearch = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const userTextNorm = normalizeForSearch(observation.reconstructedText || '');
    
    const targetLabel = node.title || node.pathology;
    const labelTokens = normalizeForSearch(targetLabel).split(/\s+/).filter(t => t.length > 3);
    
    const stopWords = new Set([
        'acute', 'chronic', 'syndrome', 'disease', 'disorder', 'condition', 
        'with', 'from', 'type', 'left', 'right', 'mild', 'severe', 
        'primary', 'secondary', 'idiopathic', 'recurrent', 'management', 'protocol'
    ]);
    
    const meaningfulTokens = labelTokens.filter(t => !stopWords.has(t));
    
    let nameMatchScore = 0;
    const matchedKeywords: string[] = [];
    meaningfulTokens.forEach(token => {
        if (userTextNorm.includes(token)) {
            nameMatchScore += 5; 
            matchedKeywords.push(token);
        }
    });
    
    score += nameMatchScore;

    const reasoningPath = activeModalities.map(m => `${m.class}: ${m.label}`);
    if (matchedKeywords.length > 0) {
        reasoningPath.push(`Keyword Match: ${matchedKeywords.join(', ')}`);
    }

    return { 
        node, 
        score, 
        activeModalities, 
        activeSyndromes, 
        reasoningPath,
        matchedConcepts,
        unmatchedConcepts,
        obsKeys: Array.from(obsMap.keys())
    };
  }).filter(n => n !== null) as SCRTInferenceResult[];

  const sorted = results.sort((a, b) => b.score - a.score);
  
  // 4. Expand with Linked Nodes (Guidelines/Protocols) via Edges & Links
  const topNodes = sorted.slice(0, 5); 
  const linkedResults: SCRTInferenceResult[] = [];
  const edges = scrt_get_edges(); 
  
  topNodes.forEach(res => {
      const node = res.node;
      
      // A. Process Graph Edges
      const relevantEdges = edges.filter(e => e.source_id === node.node_id);
      relevantEdges.forEach(edge => {
          const linkedNode = store.nodes.find(n => n.node_id === edge.target_id);
          if (!linkedNode) return;

          // Check if already in sorted (active via convolution)
          const existingInSorted = sorted.find(r => r.node.node_id === linkedNode.node_id);
          if (existingInSorted) {
             // Boost it
             existingInSorted.score = Math.max(existingInSorted.score, res.score); // Ensure at least equal activation
             if (!existingInSorted.reasoningPath.includes(`Boosted by ${node.pathology}`)) {
                 existingInSorted.reasoningPath.push(`Boosted by ${node.pathology} (${edge.relation})`);
             }
          } else {
             // Check if already in linkedResults
             const existingInLinked = linkedResults.find(r => r.node.node_id === linkedNode.node_id);
             if (!existingInLinked) {
                  linkedResults.push({
                      node: linkedNode,
                      score: res.score, // Equal activation
                      activeModalities: [],
                      activeSyndromes: [],
                      reasoningPath: [`Linked to ${node.pathology} via edge (${edge.relation})`],
                      matchedConcepts: [],
                      unmatchedConcepts: [],
                      obsKeys: []
                  });
             }
          }
      });

      // B. Process Legacy Links (Fallback)
      if (node.links) {
          node.links.forEach(link => {
              const linkedNode = store.nodes.find(n => n.node_id === link.target_node_id);
              if (!linkedNode) return;
              
              if (!sorted.find(r => r.node.node_id === linkedNode.node_id) && !linkedResults.find(r => r.node.node_id === linkedNode.node_id)) {
                  linkedResults.push({
                      node: linkedNode,
                      score: res.score,
                      activeModalities: [],
                      activeSyndromes: [],
                      reasoningPath: [`Linked to ${node.pathology} (${link.relation})`],
                      matchedConcepts: [],
                      unmatchedConcepts: [],
                      obsKeys: []
                  });
              }
          });
      }
  });

  const finalResults = [...sorted, ...linkedResults].sort((a, b) => b.score - a.score);
  
  // DEBUG LOGGING
  console.groupCollapsed("SCRT Inference Debug (Top 5)");
  finalResults.slice(0, 5).forEach(r => {
      console.log(`Node: ${r.node.pathology} (Score: ${r.score})`);
      console.log(`  Matched (${r.matchedConcepts?.length}):`, r.matchedConcepts);
      console.log(`  Unmatched (${r.unmatchedConcepts?.length}):`, r.unmatchedConcepts);
      console.log(`  ObsKeys (${r.obsKeys?.length}):`, r.obsKeys?.slice(0, 20));
  });
  console.groupEnd();

  return finalResults;
};

// --- Ingestion & Storage ---

// Step 3 Helper: Parse numeric qualifiers like "> 10" or "Hb < 9 g/dL"
const parseNumericCondition = (q: string): { operator: LogicalOperator, threshold: number } | null => {
    // 1. Normalize: remove spaces around, convert comma to dot for parsing
    const normalized = q.trim().replace(',', '.');

    // 2. Regex to find Comparator + Number
    // Matches: <=, >=, <, >, = followed optionally by space and a number (float/int)
    // We ignore the unit or leading text (e.g. "Hb <")
    const match = normalized.match(/(<=|>=|<|>|=)\s*?(\d+(\.\d+)?)/);

    if (match) {
        const opStr = match[1];
        const val = parseFloat(match[2]);
        
        if (isNaN(val)) return null;

        let operator: LogicalOperator = 'eq';
        switch(opStr) {
            case '<': operator = 'lt'; break;
            case '<=': operator = 'lte'; break;
            case '>': operator = 'gt'; break;
            case '>=': operator = 'gte'; break;
            case '=': operator = 'eq'; break;
        }
        
        return { operator, threshold: val };
    }
    
    return null;
};

// STEP 2: Auto-Merging Logic
const cleanAndMergeExtractionResults = (elements: ExtractionResult['clinical_elements']) => {
    const mergedElements = [...elements];
    
    // Heuristic Map: Adjective -> Head Noun it belongs to
    // If both are present, we merge them into one concept "Adjective Noun"
    const MERGE_MAP: Record<string, string> = {
        'palmar': 'erythema',
        'spider': 'angiomas',
        'shifting': 'dullness',
        'collateral': 'circulation',
        'foetor': 'hepaticus',
        'fetor': 'hepaticus',
        'pitting': 'edema',
        'digital': 'hippocratism', // or clubbing
        'neutrophil': 'count',
        'white': 'cell count',
        'testicular': 'atrophy'
    };

    // 1. Detect pairs
    Object.entries(MERGE_MAP).forEach(([adj, noun]) => {
        const adjIdx = mergedElements.findIndex(e => e.root_term.toLowerCase() === adj);
        const nounIdx = mergedElements.findIndex(e => e.root_term.toLowerCase() === noun || e.root_term.toLowerCase().includes(noun));

        if (adjIdx > -1 && nounIdx > -1 && adjIdx !== nounIdx) {
            // Found both fragments! Merge them.
            const nounEl = mergedElements[nounIdx];
            const adjEl = mergedElements[adjIdx];
            
            // Construct new term
            // If the noun already contains the adjective (e.g. "Spider angiomas"), don't double it
            let compoundTerm = nounEl.root_term;
            if (!compoundTerm.toLowerCase().includes(adj)) {
                 compoundTerm = `${adj.charAt(0).toUpperCase() + adj.slice(1)} ${nounEl.root_term.toLowerCase()}`;
            }
            
            // Update the noun element to be the compound
            nounEl.root_term = compoundTerm;
            
            // Merge characteristics if any
            nounEl.characteristics = [...new Set([...(nounEl.characteristics || []), ...(adjEl.characteristics || [])])];
            
            // Create Semantic Link for traceability
            // "Palmar" (source) is part of "Palmar erythema" (target)
            saveSemanticLink({
                concept_source: adjEl.root_term,
                relation: 'partie_de', 
                concept_cible: compoundTerm,
                strength: 1,
                sources: ['auto_merge_ingestion']
            });

            // Remove the adjective fragment
            mergedElements.splice(adjIdx, 1);
        }
    });

    return mergedElements;
};

// Helper to generate stable key for node identity
const generateNodeKey = (kind: NodeKind | undefined, pathology: string, title?: string): string => {
    const k = kind || 'pathology';
    const n = (s: string) => s.trim().toLowerCase();
    
    if (k === 'pathology' || k === 'syndrome') {
        return `${n(k)}:${n(pathology)}`;
    } else {
        // For guidelines/protocols, use title if available, else pathology
        const label = title || pathology || 'untitled';
        return `${n(k)}:${n(label)}`;
    }
};

// --- Auto-Linking Logic ---

const getConceptSet = (node: SCRTNode): Set<string> => {
    const ids = new Set<string>();
    // Collect from tree/clinical structure
    const trees = [...(node.clinique?.symptomes || []), ...(node.clinique?.signes || [])];
    trees.forEach(t => ids.add(t.concept_id));
    return ids;
};

const autoLinkNode = (store: SCRTStore, node: SCRTNode) => {
    console.groupCollapsed(`Auto-Linking Analysis for: ${node.pathology}`);
    
    const nodeConcepts = getConceptSet(node);
    const nodeLabelNorm = normalizeString(node.pathology);
    
    // High-signal triggers that imply strong relationship if shared
    const TRIGGER_CONCEPTS = new Set([
        'scorpion', 'sting', 'envenomation', 'venom', 'toxin', 'poisoning', 
        'snake', 'bite', 'trauma', 'alcohol', 'gallstone'
    ]);

    const nodeTriggers = Array.from(nodeConcepts).filter(c => {
        // Resolve concept label to check against triggers
        // This is a simplification; ideally we check concept IDs if we had a trigger ID list
        // For now, we check if any part of the node label or concept label matches
        return false; // Placeholder if we don't have easy label lookup here without store search
    });

    // Better Trigger Check: Check if node label contains triggers
    const nodeHasTrigger = Array.from(TRIGGER_CONCEPTS).some(t => nodeLabelNorm.includes(t));

    const matches: { other: SCRTNode, score: number, reason: string, relation: string, intersection: string[] }[] = [];

    store.nodes.forEach(other => {
        if (other.node_id === node.node_id) return;

        // 1. Filter by Discipline (Optimization)
        // if (other.discipline !== node.discipline && other.discipline !== 'General') return;

        const otherLabelNorm = normalizeString(other.pathology);
        const otherConcepts = getConceptSet(other);

        // A. Jaccard Similarity
        const intersectionSet = new Set([...nodeConcepts].filter(x => otherConcepts.has(x)));
        const intersection = Array.from(intersectionSet);
        const union = new Set([...nodeConcepts, ...otherConcepts]);
        const jaccard = union.size > 0 ? intersectionSet.size / union.size : 0;

        // B. Shared Trigger Check
        // Check if both labels contain the same trigger word
        const sharedTrigger = Array.from(TRIGGER_CONCEPTS).find(t => nodeLabelNorm.includes(t) && otherLabelNorm.includes(t));

        // C. Substring / Generalization
        const isSubstring = nodeLabelNorm.includes(otherLabelNorm) || otherLabelNorm.includes(nodeLabelNorm);

        let score = jaccard;
        let reason = `Jaccard: ${jaccard.toFixed(2)}`;
        let relation = 'related_to';

        if (sharedTrigger) {
            score += 0.5;
            reason += `, Shared Trigger: ${sharedTrigger}`;
            relation = 'same_etiology_as';
        }

        if (isSubstring) {
            score += 0.8;
            reason += `, Substring Match`;
            relation = nodeLabelNorm.includes(otherLabelNorm) ? 'is_specific_of' : 'is_generalization_of';
            // If node includes other (e.g. "Scorpion Pancreatitis" includes "Pancreatitis"), 
            // then Node is specific of Other. 
            // Relation is from Node -> Other.
        }

        if (score >= 0.25 || sharedTrigger || isSubstring) {
            matches.push({ other, score, reason, relation, intersection });
        }
    });

    // Sort by score and take top 5
    matches.sort((a, b) => b.score - a.score);
    const topMatches = matches.slice(0, 5);

    topMatches.forEach(match => {
        console.log(`Match: ${match.other.pathology} (${match.score.toFixed(2)}) - ${match.reason}`);
        console.log(`  Overlapping Concepts (${match.intersection.length}):`, match.intersection);
        
        const { other, relation } = match;

        // 1. Create Graph Edges
        scrt_upsert_edge({
            source_id: node.node_id,
            relation: relation,
            target_id: other.node_id,
            strength: Math.min(match.score, 1),
            sources: ['auto_link_ingestion']
        });

        // Reverse Edge
        let reverseRel = 'related_to';
        if (relation === 'is_specific_of') reverseRel = 'has_variant'; // or is_generalization_of
        else if (relation === 'is_generalization_of') reverseRel = 'is_specific_of'; // or has_variant
        else if (relation === 'same_etiology_as') reverseRel = 'same_etiology_as';

        scrt_upsert_edge({
            source_id: other.node_id,
            relation: reverseRel,
            target_id: node.node_id,
            strength: Math.min(match.score, 1),
            sources: ['auto_link_ingestion']
        });

        // 2. Update Node Links (UI Traversal)
        if (!node.links) node.links = [];
        if (!node.links.find(l => l.target_node_id === other.node_id)) {
            node.links.push({ relation, target_node_id: other.node_id });
        }

        if (!other.links) other.links = [];
        if (!other.links.find(l => l.target_node_id === node.node_id)) {
            other.links.push({ relation: reverseRel, target_node_id: node.node_id });
        }
    });

    console.groupEnd();
};

export const scrt_store_ingestion_result = (result: ExtractionResult) => {
  const store = scrt_get_store();
  
  // STEP 2: Pre-process to fix fragmentation via Auto-Merge
  const cleanedElements = cleanAndMergeExtractionResults(result.clinical_elements || []);

  // 1. Process Concepts (Upsert to Concept Store)
  const featureConceptIds: { treeItem: SCRTConceptTree, type: ElementType }[] = [];

  cleanedElements.forEach(item => {
    // Legacy: Ensure Grammar Service knows about it for UI
    // IMPORTANT: This now includes the Integrity Gate inside addValidatedElement
    const validatedEl = addValidatedElement({
       id: undefined, // Let grammar generate ID
       name: item.root_term,
       type: item.type,
       mode_description: {
         type: item.unit ? 'numeric' : 'options',
         unit: item.unit,
         options: [...(item.characteristics || []), ...(item.values || [])]
       }
    });

    // If addValidatedElement rejected it (returned a TEMP_REJECT id), we SKIP adding it to the store logic
    if (validatedEl.id.startsWith('TEMP_REJECT')) {
        console.warn(`Blocked incomplete concept from SCRT store: ${item.root_term}`);
        return;
    }

    // Canonize Concept (Only if passed gate)
    // Use the ID from grammar service if possible to keep them linked, or generate new
    // Actually, scrt_upsert_concept generates CPT_ ids. We map Grammar IDs (EL_) to Concepts separately/implicitly via Name.
    const conceptId = scrt_upsert_concept(store, {
      label: item.root_term,
      type: item.type,
      unit: item.unit
    });

    // Build Tree Item
    const allQualifiers = [...(item.characteristics || []), ...(item.values || [])];
    const treeItem: SCRTConceptTree = {
      concept_id: conceptId,
      characteristics: item.characteristics || [],
      // Step 3: Modality Generation with Numeric Parsing
      modalities: allQualifiers.length > 0 
        ? allQualifiers.map(q => {
            const parsed = parseNumericCondition(q);
            return {
                label: q,
                class: 'M3',
                score: 8,
                condition: parsed ? parsed : { operator: 'eq', threshold: q }
            };
          })
        : [{ label: 'Present', class: 'M1', score: 4, condition: { operator: 'eq', threshold: true } }]
    };
    
    featureConceptIds.push({ treeItem, type: item.type });
  });

  // STEP 3: Trigger Learning Loop Consolidation
  consolidateTemporaryMemory();

  // 2. Process Syndromes
  const syndromeIds: string[] = [];
  (result.syndromes || []).forEach(syn => {
     const synId = `SYN_${syn.name.toUpperCase().replace(/\s+/g, '_')}`;
     
     // Resolve associated signs to concept IDs
     const linkedConcepts = syn.associated_signs.map(signLabel => {
         // Attempt resolution to find ID
         const resolvedId = resolveToConceptId(store, signLabel);
         return resolvedId;
     }).filter(id => id !== null) as string[];

     const newSyn: SCRTSyndrome = {
       id: synId,
       label: syn.name,
       description: syn.description,
       concept_ids: linkedConcepts
     };

     // Upsert Syndrome
     const idx = store.syndromes.findIndex(s => s.id === synId);
     if (idx > -1) store.syndromes[idx] = newSyn;
     else store.syndromes.push(newSyn);
     
     syndromeIds.push(synId);
  });

  // 3. Upsert Node (Pathology/Guideline)
  const nodeKey = generateNodeKey(result.node_kind, result.pathology, result.title);
  
  // Find existing node by key OR fallback to pathology name for backward compat
  let existingNodeIdx = store.nodes.findIndex(n => {
      // 1. Exact Key Match (Best)
      if (n.node_key && n.node_key === nodeKey) return true;

      // 2. Fallback: Kind + Label Match (Legacy nodes without keys)
      const nKind = n.node_kind || 'pathology';
      const resKind = result.node_kind || 'pathology';
      
      // Strict Kind Match to prevent mixing Protocols with Pathologies
      if (nKind !== resKind) return false;

      // Determine label for comparison based on kind
      // For pathology/syndrome: use pathology field
      // For others (guidelines/protocols): use title if available, else pathology
      const nLabel = (nKind === 'pathology' || nKind === 'syndrome') ? n.pathology : (n.title || n.pathology);
      const resLabel = (resKind === 'pathology' || resKind === 'syndrome') ? result.pathology : (result.title || result.pathology);

      return normalizeString(nLabel) === normalizeString(resLabel);
  });
  
  // Prepare new node data
  const newNodeData: SCRTNode = {
    node_id: existingNodeIdx > -1 ? store.nodes[existingNodeIdx].node_id : `NODE_${(result.node_kind || 'PATH').toUpperCase()}_${Date.now()}`,
    node_key: nodeKey,
    pathology: result.title || result.pathology, // Use title as main label for guidelines
    title: result.title,
    node_kind: result.node_kind || 'pathology',
    discipline: result.taxonomy.discipline,
    specialty: result.taxonomy.specialty,
    contexte: result.contexte, 
    clinique: {
      symptomes: featureConceptIds.filter(f => f.type === 'symptome' || f.type === 'antecedent').map(f => f.treeItem),
      signes: featureConceptIds.filter(f => f.type !== 'symptome' && f.type !== 'antecedent').map(f => f.treeItem),
      modalites_pivots: result.modalites_pivots || []
    },
    syndromes: syndromeIds,
    description: result.contexte.definition, // Legacy compat
    tree: featureConceptIds.map(f => f.treeItem), // Legacy compat
    clinical_forms: [],
    last_updated: new Date().toISOString(),
    links: existingNodeIdx > -1 ? (store.nodes[existingNodeIdx].links || []) : []
  };

  // 4. Handle applies_to link (Guideline/Protocol/Syndrome -> Condition)
  // Extract target condition label
  let targetName = result.applies_to;
  if (!targetName && result.links) {
      const link = result.links.find(l => l.relation === 'applies_to');
      if (link) targetName = link.target_label;
  }

  // Allow ANY kind to link if applies_to is present
  if (targetName) {
      // Target is likely a pathology
      const targetKey = generateNodeKey('pathology', targetName);
      
      // Resolve using robust normalization AND Semantic Resolution
      const resolvedTargetName = resolveLabelSemantics(targetName!);
      
      let targetNode = store.nodes.find(n => 
          (n.node_key === targetKey) || 
          (normalizeString(n.pathology) === normalizeString(targetName!)) ||
          (n.title && normalizeString(n.title) === normalizeString(targetName!)) ||
          (normalizeString(n.pathology) === normalizeString(resolvedTargetName))
      );
      
      if (!targetNode) {
          // Create placeholder condition node if not exists
          const newTarget: SCRTNode = {
              node_id: `NODE_PATH_${Date.now()}_AUTO`,
              node_key: targetKey,
              pathology: targetName,
              node_kind: 'pathology', // Default to pathology/syndrome
              discipline: result.taxonomy.discipline,
              specialty: result.taxonomy.specialty,
              contexte: { 
                  definition: "Auto-generated placeholder for guideline target.", 
                  epidemiologie: {}, 
                  lesionnel: { typical_sites: [], red_flags: [], anatomical_context: "" }, 
                  examens_preuves: [], 
                  prise_en_charge: { medicale: [], chirurgicale: [], surveillance: [] }, 
                  commentaire_pedagogique: [] 
              },
              clinique: { symptomes: [], signes: [], modalites_pivots: [] },
              syndromes: [],
              tree: [],
              clinical_forms: [],
              last_updated: new Date().toISOString(),
              links: []
          };
          store.nodes.push(newTarget);
          targetNode = newTarget;
      }
      
      // Create Link on the Source Node (Legacy/Traversal)
      if (!newNodeData.links) newNodeData.links = [];
      if (!newNodeData.links.find(l => l.target_node_id === targetNode!.node_id && l.relation === 'applies_to')) {
          newNodeData.links.push({ relation: 'applies_to', target_node_id: targetNode.node_id });
      }

      // Create Reverse Link on the Target Node (Bidirectional)
      if (!targetNode.links) targetNode.links = [];
      const reverseRel = result.node_kind === 'syndrome' ? 'has_syndrome' : 'has_protocol';
      if (!targetNode.links.find(l => l.target_node_id === newNodeData.node_id && l.relation === reverseRel)) {
          targetNode.links.push({ relation: reverseRel, target_node_id: newNodeData.node_id });
      }

      // Upsert Edge (Graph Store)
      scrt_upsert_edge({
          source_id: newNodeData.node_id,
          relation: 'applies_to',
          target_id: targetNode.node_id,
          strength: 1,
          sources: ['ingestion_auto_link']
      });

      // Upsert Reverse Edge
      scrt_upsert_edge({
          source_id: targetNode.node_id,
          relation: reverseRel,
          target_id: newNodeData.node_id,
          strength: 1,
          sources: ['ingestion_auto_link_reverse']
      });
  }

  if (existingNodeIdx > -1) {
    store.nodes[existingNodeIdx] = newNodeData;
  } else {
    store.nodes.push(newNodeData);
  }

  // 6. Auto-Link based on Similarity (Jaccard, Triggers, Substrings)
  // This replaces the previous simple name-match logic with a more robust one
  const currentNode = existingNodeIdx > -1 ? store.nodes[existingNodeIdx] : newNodeData;
  autoLinkNode(store, currentNode);

  // 5. Rebuild Index
  rebuildMedicalIndex(store);
  scrt_save_store(store);
};

export const scrt_store_pathology = (node: SCRTNode) => {
  const store = scrt_get_store();
  
  // Upsert
  const idx = store.nodes.findIndex(n => n.node_id === node.node_id || n.pathology.toLowerCase() === node.pathology.toLowerCase());
  if (idx >= 0) {
      store.nodes[idx] = { ...store.nodes[idx], ...node };
  } else {
      store.nodes.push(node);
  }

  rebuildMedicalIndex(store);
  scrt_save_store(store);
};

export const scrt_delete_node = (nodeId: string) => {
  const store = scrt_get_store();
  const idx = store.nodes.findIndex(n => n.node_id === nodeId);
  if (idx > -1) {
    store.nodes.splice(idx, 1);
    rebuildMedicalIndex(store);
    scrt_save_store(store);
    
    // Clean up edges
    const edges = scrt_get_edges();
    const newEdges = edges.filter(e => e.source_id !== nodeId && e.target_id !== nodeId);
    localStorage.setItem(EDGES_KEY, JSON.stringify(newEdges));
  }
};

export const scrt_delete_concept = (conceptId: string) => {
  const store = scrt_get_store();
  const idx = store.concept_store.concepts.findIndex(c => c.concept_id === conceptId);
  if (idx > -1) {
    store.concept_store.concepts.splice(idx, 1);
    scrt_save_store(store);
  }
};
