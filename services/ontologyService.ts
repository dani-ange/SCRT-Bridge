
import { ClinicalOntology, ClinicalElement, MainSectionId, ElementType } from '../types';

const ONTOLOGY_KEY = 'clinical_ontology_v3';

const INITIAL_ELEMENTS: ClinicalElement[] = [
  // MÉSURES BRUTES
  {
    id: 'MES_TEMP',
    name: 'Temperature',
    type: 'mesure',
    // Fixed: changed section to section_observation and used valid MainSectionId
    section_observation: 'parametres_vitaux',
    subsection: 'Vital Signs',
    ippa_method: 'general',
    synonymes: ['T°', 'Heat'],
    mode_description: { type: 'numeric', unit: '°C', min: 34, max: 43 }
  },
  {
    id: 'MES_TAS',
    name: 'Systolic BP',
    type: 'mesure',
    // Fixed: changed section to section_observation and used valid MainSectionId
    section_observation: 'parametres_vitaux',
    subsection: 'Vital Signs',
    ippa_method: 'general',
    synonymes: ['Tension'],
    mode_description: { type: 'numeric', unit: 'mmHg', min: 40, max: 250 }
  },
  {
    id: 'MES_EVA',
    name: 'Pain Intensity (VAS)',
    type: 'symptome',
    // Fixed: section -> section_observation
    section_observation: 'motif_histoire',
    subsection: 'Pain',
    synonymes: ['Visual scale'],
    mode_description: { type: 'scale', min: 0, max: 10 }
  },
  {
    id: 'SYM_TOUX',
    name: 'Cough',
    type: 'symptome',
    // Fixed: changed section to section_observation and used valid MainSectionId
    section_observation: 'symptome',
    subsection: 'Respiratory',
    synonymes: [],
    mode_description: { type: 'options', options: ['Dry', 'Productive', 'Fitful'] }
  },
  {
    id: 'SIG_MATITE',
    name: 'Percussion Dullness',
    type: 'signe_clinique',
    // Fixed: section -> section_observation
    section_observation: 'examen_physique',
    subsection: 'Respiratory',
    ippa_method: 'percussion',
    synonymes: [],
    mode_description: { type: 'boolean' }
  }
];

export const getClinicalOntology = (): ClinicalOntology => {
  const data = localStorage.getItem(ONTOLOGY_KEY);
  if (data) return JSON.parse(data);
  // Fix: Adding temporary_memory to satisfy ClinicalOntology interface requirements
  return { elements: INITIAL_ELEMENTS, temporary_memory: [] };
};

export const saveClinicalOntology = (ont: ClinicalOntology) => {
  localStorage.setItem(ONTOLOGY_KEY, JSON.stringify(ont));
};

export const addOrEnrichConcept = (proposed: Partial<ClinicalElement>): ClinicalElement => {
    const ont = getClinicalOntology();
    const existing = ont.elements.find(e => e.name.toLowerCase() === (proposed.name || '').toLowerCase());
    if (existing) return existing;

    const newEl: ClinicalElement = {
        id: `${proposed.type === 'mesure' ? 'MES' : 'EL'}_${Math.floor(Math.random()*10000)}`,
        name: proposed.name || 'Unknown',
        type: proposed.type || 'symptome',
        // Fixed: section -> section_observation and used valid fallback
        section_observation: proposed.section_observation || 'symptome',
        subsection: proposed.subsection || 'General',
        ippa_method: proposed.ippa_method,
        synonymes: proposed.synonymes || [],
        mode_description: proposed.mode_description || { type: 'boolean' }
    };
    ont.elements.push(newEl);
    saveClinicalOntology(ont);
    return newEl;
};

export const clearOntology = () => localStorage.removeItem(ONTOLOGY_KEY);
