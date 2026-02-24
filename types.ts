
export type MainSectionId = 
  | 'motif_histoire'
  | 'antecedent'
  | 'symptome'
  | 'parametres_vitaux'
  | 'examen_physique'
  | 'paraclinique';

export type ElementType = 
  | 'symptome' 
  | 'signe_clinique' 
  | 'signe_paraclinique' 
  | 'antecedent' 
  | 'mesure' 
  | 'pathology' 
  | 'syndrome' 
  | 'facteur_risque' 
  | 'anatomie'
  | 'contexte_lesionnel';

export type LogicalOperator = 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'contains';

export type IPPAMethod = 'inspection' | 'palpation' | 'percussion' | 'auscultation' | 'general';

// --- SCRT vNext: Concept Store (Canonical) ---
export interface SCRTConcept {
  concept_id: string;
  label: string;
  type: ElementType;
  definition?: string;
  synonyms: string[];
  negatable: boolean;
  unit?: string;
  interpretation_rules?: { threshold: number; operator: LogicalOperator; label: string }[];
  ui_config: {
    section_default: MainSectionId;
    widget_type: 'boolean' | 'numeric' | 'scale' | 'options';
    options?: string[]; // For characteristics
  };
}

export interface ConceptStore {
  concepts: SCRTConcept[];
}

// --- SCRT vNext: Context & Node ---
export interface SCRTContext {
  definition: string;
  epidemiologie: {
    age_peak?: string;
    sex_ratio?: string;
    prevalence?: string;
    risk_factors?: string[];
  };
  lesionnel: {
    typical_sites: string[];
    red_flags: string[];
    anatomical_context: string;
  };
  examens_preuves: {
    concept_ref: string; // Ref to a SCRTConcept ID
    label: string;
    role: 'gold_standard' | 'orientation' | 'exclusion';
    notes?: string;
  }[];
  prise_en_charge: {
    medicale: string[];
    chirurgicale: string[];
    surveillance: string[];
  };
  commentaire_pedagogique: string[];
}

export interface SCRTModality {
  label: string;
  class: 'M1' | 'M2' | 'M3' | 'M4' | 'M5';
  score: number;
  condition: {
    operator: LogicalOperator;
    threshold: any;
  };
}

export interface SCRTConceptTree {
  concept_id: string; // Points to SCRTConcept.concept_id
  characteristics: string[];
  modalities: SCRTModality[];
}

export interface SCRTSyndrome {
  id: string;
  label: string;
  description: string;
  concept_ids: string[];
}

export type NodeKind = 'pathology' | 'syndrome' | 'protocol' | 'guideline' | 'reference' | 'rule';

export interface SCRTNodeLink {
  relation: string;
  target_node_id: string;
}

export interface SCRTEdge {
  source_id: string;
  relation: string;
  target_id: string;
  strength?: number;
  count_seen?: number;
  last_seen?: string;
  sources?: string[];
}

export interface SCRTNode {
  node_id: string;
  node_key?: string;
  pathology: string;
  title?: string;
  node_kind?: NodeKind;
  links?: SCRTNodeLink[];
  
  // Categorization for Indexing
  discipline: string;
  specialty: string;
  
  // vNext Content
  contexte: SCRTContext;
  
  // Reasoning
  clinique: {
    symptomes: SCRTConceptTree[];
    signes: SCRTConceptTree[];
    modalites_pivots: string[];
  };
  syndromes: string[]; // IDs of active syndromes
  
  last_updated: string;
  
  // Legacy compatibility fields
  description?: string;
  tree: SCRTConceptTree[];
  clinical_forms: string[];
}

// --- SCRT vNext: Medical Index (Hierarchical) ---
export interface MedicalIndexNode {
  id: string;
  label: string;
  children: MedicalIndexNode[];
  linked_pathologies: string[]; // Node IDs
}

export interface MedicalIndex {
  root: MedicalIndexNode;
  trigger_index?: Record<string, string[]>; // ConceptID -> NodeID[]
}

export interface SCRTStore {
  nodes: SCRTNode[];
  syndromes: SCRTSyndrome[];
  concept_store: ConceptStore; // Embedded for persistence
  index: MedicalIndex;         // Embedded for persistence
}

// --- Runtime & Inference ---
export interface ObservationValue {
  element_id: string;
  value: any; 
}

export interface ClinicalObservationData {
  values: ObservationValue[];
  reconstructedText: string;
}

export interface SCRTInferenceResult {
  node: SCRTNode;
  score: number;
  activeModalities: SCRTModality[];
  activeSyndromes: SCRTSyndrome[];
  reasoningPath: string[];
  matchedConcepts?: string[];
  unmatchedConcepts?: string[];
  obsKeys?: string[];
}

// --- Legacy Interop (UI mostly) ---
export interface ClinicalElement {
  id: string;
  name: string;
  type: ElementType;
  section_observation: MainSectionId;
  subsection: string;
  ippa_method?: string;
  synonymes: string[];
  mode_description: {
    type: 'boolean' | 'numeric' | 'scale' | 'options';
    unit?: string;
    min?: number;
    max?: number;
    options?: string[];
    interpretation_rules?: { threshold: number; operator: LogicalOperator; label: string }[];
  };
}

export interface ClinicalOntology {
  elements: ClinicalElement[];
  temporary_memory: TemporaryConcept[];
}

export interface TemporaryConcept {
  id: string;
  raw_label: string;
  source_document: string;
  context_snippet: string;
  detected_type_guess: ElementType;
  status: 'pending' | 'validated' | 'rejected';
  description?: string;
  affinities?: string[]; 
  modalities?: any[];
  is_pivot?: boolean;
  // Learning metrics
  count_seen: number;
  last_seen: string;
  sources?: string[];
  promotion_score?: number;
}

export interface SemanticLink {
  id?: string;
  concept_source: string;
  relation: string;
  concept_cible: string;
  // Evidence / Weighting
  strength?: number;        // default 1
  count_seen?: number;      // default 1
  last_seen?: string;       // ISO string
  sources?: string[];       // provenance
}

/**
 * ExtractionResult vNext - Strict Separation
 */
export interface ExtractionResult {
  pathology: string;
  title?: string;
  applies_to?: string;
  links?: { relation: string; target_label: string; }[];
  node_kind: NodeKind;
  taxonomy: {
    discipline: string;
    specialty: string;
  };
  contexte: SCRTContext;
  syndromes: {
    name: string;
    description: string;
    associated_signs: string[]; 
  }[];
  clinical_elements: {
    root_term: string;
    type: ElementType;
    characteristics: string[]; 
    values: string[]; 
    unit?: string;
  }[];
  modalites_pivots: string[];
}
