
import { SemanticLink } from '../types';

const LINKS_KEY = 'semantic_links_v1';

// Consistent Normalization Helper
export const norm = (s: string): string => {
  if (!s) return '';
  return s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
    .trim()
    .replace(/\s+/g, ' '); // collapse spaces
};

const INITIAL_LINKS: SemanticLink[] = [
  // Synonyms
  { concept_source: 'Hyperthermia', relation: 'synonyme_de', concept_cible: 'Fever' },
  { concept_source: 'Febricula', relation: 'synonyme_de', concept_cible: 'Fever' },
  { concept_source: 'Pressure Drop', relation: 'synonyme_de', concept_cible: 'Hypotension' },
  { concept_source: 'Paresis', relation: 'synonyme_de', concept_cible: 'Focal Deficit' },
  { concept_source: 'Hemiplegia', relation: 'est_un', concept_cible: 'Focal Deficit' },
  { concept_source: 'Rales', relation: 'synonyme_de', concept_cible: 'Crackles' },
  { concept_source: 'Shortness of breath', relation: 'synonyme_de', concept_cible: 'Dyspnea' },
  { concept_source: 'Polypnea', relation: 'est_un', concept_cible: 'Dyspnea' },
  { concept_source: 'Migraine', relation: 'est_un', concept_cible: 'Headache' },
  
  // Measures & Evaluations
  { concept_source: 'Thermometer', relation: 'mesure', concept_cible: 'Fever' },
  { concept_source: 'Cuff', relation: 'mesure', concept_cible: 'Hypotension' },
  { concept_source: 'CBC', relation: 'évalue', concept_cible: 'Leukocytosis' },
  { concept_source: 'White Blood Cells', relation: 'synonyme_de', concept_cible: 'Leukocytosis' },
  { concept_source: 'Glycemia', relation: 'évalue', concept_cible: 'Diabetes' },
  { concept_source: 'Pack-Year', relation: 'mesure', concept_cible: 'Smoking' },
  
  // Hierarchy & Localization
  { concept_source: 'Dry cough', relation: 'est_un', concept_cible: 'Cough' },
  { concept_source: 'Productive cough', relation: 'est_un', concept_cible: 'Cough' },
  { concept_source: 'Neck stiffness', relation: 'appartient_section', concept_cible: 'Neurological' },
  { concept_source: 'Photophobia', relation: 'appartient_section', concept_cible: 'Neurological' },
  { concept_source: 'Angina', relation: 'synonyme_de', concept_cible: 'Chest Pain' },
  { concept_source: 'Jaundice', relation: 'synonyme_de', concept_cible: 'Icterus' },
  
  // Signs
  { concept_source: 'Hypotension', relation: 'signe_de', concept_cible: 'Shock' },
  { concept_source: 'Cyanosis', relation: 'signe_de', concept_cible: 'Hypoxemia' },
  { concept_source: 'Crackles', relation: 'signe_de', concept_cible: 'Pneumonia' },
  { concept_source: 'Leukocytosis', relation: 'signe_de', concept_cible: 'Infection' },
  { concept_source: 'Proteinuria', relation: 'signe_de', concept_cible: 'Nephropathy' },
  { concept_source: 'Polyuria', relation: 'synonyme_de', concept_cible: 'Polyuria' },
  { concept_source: 'Blood sugar', relation: 'synonyme_de', concept_cible: 'Glycemia' },
  { concept_source: 'Nausea', relation: 'synonyme_de', concept_cible: 'Nausea' }
];

// Enrich links with defaults (migration on load)
const enrichLink = (link: SemanticLink): SemanticLink => ({
  ...link,
  id: link.id || `LINK_${Math.random().toString(36).substr(2,9)}`,
  strength: link.strength !== undefined ? link.strength : 1,
  count_seen: link.count_seen !== undefined ? link.count_seen : 1,
  last_seen: link.last_seen || new Date().toISOString(),
  sources: link.sources || ['system_init']
});

export const getSemanticLinks = (): SemanticLink[] => {
  const data = localStorage.getItem(LINKS_KEY);
  if (!data) {
      const initial = INITIAL_LINKS.map(enrichLink);
      return initial;
  }
  const loaded = JSON.parse(data) as SemanticLink[];
  return loaded.map(enrichLink);
};

/**
 * Upsert a semantic link.
 * If the link (source+relation+target) exists, it reinforces it (increments strength/count).
 * If not, it creates it.
 */
export const saveSemanticLink = (partialLink: SemanticLink) => {
  const links = getSemanticLinks();
  
  const sourceNorm = norm(partialLink.concept_source);
  const targetNorm = norm(partialLink.concept_cible);
  const relationNorm = norm(partialLink.relation);

  if (!sourceNorm || !targetNorm || !relationNorm) return;
  if (sourceNorm === targetNorm) return; // Prevent self-loops

  // Find existing link with same normalized key
  const existingIndex = links.findIndex(l => 
    norm(l.concept_source) === sourceNorm &&
    norm(l.relation) === relationNorm &&
    norm(l.concept_cible) === targetNorm
  );

  const now = new Date().toISOString();

  if (existingIndex > -1) {
    // Update existing
    const existing = links[existingIndex];
    existing.count_seen = (existing.count_seen || 1) + 1;
    // Accumulate strength (evidence weighting)
    // If input has strength 5 (e.g. from strong source), we add it. Default adds 1.
    existing.strength = (existing.strength || 1) + (partialLink.strength || 1);
    existing.last_seen = now;
    
    if (partialLink.sources) {
        existing.sources = Array.from(new Set([...(existing.sources || []), ...partialLink.sources]));
    }
    
    links[existingIndex] = existing;
  } else {
    // Insert new
    const newLink: SemanticLink = {
        ...partialLink,
        id: partialLink.id || `LINK_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
        // Keep original casing for display, but normalization is used for ID/Matching
        concept_source: partialLink.concept_source, 
        relation: partialLink.relation,
        concept_cible: partialLink.concept_cible,
        strength: partialLink.strength || 1,
        count_seen: 1,
        last_seen: now,
        sources: partialLink.sources || ['user_action']
    };
    links.push(newLink);
  }

  localStorage.setItem(LINKS_KEY, JSON.stringify(links));
};

/**
 * Enhanced Semantic Resolution (Transitive & Weighted).
 * 
 * 1. Normalizes label.
 * 2. Follows 'synonyme_de' and 'est_un' relations.
 * 3. Chooses the "strongest" link if multiple options exist.
 * 4. Prevents loops.
 * 
 * @param label The starting label (e.g. "Angina")
 * @returns The canonical label (e.g. "Chest Pain") or original if no link found.
 */
export const resolveConcept = (label: string): string => {
  const links = getSemanticLinks();
  let current = label;
  let currentNorm = norm(current);
  
  const visited = new Set<string>();
  visited.add(currentNorm);
  
  const maxHops = 6; // Limit depth to avoid performance hit

  for (let i = 0; i < maxHops; i++) {
    // Find all outgoing links from current node with relevant relations
    const candidates = links.filter(l => 
        norm(l.concept_source) === currentNorm &&
        (norm(l.relation) === 'synonyme_de' || norm(l.relation) === 'est_un')
    );

    if (candidates.length === 0) break;

    // Pick best edge: Highest strength, then highest count_seen
    candidates.sort((a, b) => {
        const sA = a.strength || 1;
        const sB = b.strength || 1;
        if (sB !== sA) return sB - sA;
        return (b.count_seen || 1) - (a.count_seen || 1);
    });

    const bestLink = candidates[0];
    const nextNorm = norm(bestLink.concept_cible);

    if (visited.has(nextNorm)) break; // Loop detected

    // Advance
    current = bestLink.concept_cible;
    currentNorm = nextNorm;
    visited.add(currentNorm);
  }

  return current;
};
