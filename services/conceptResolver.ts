
import { SCRTStore } from '../types';
import { getSemanticLinks } from './semanticLinkService';

/**
 * Normalizes text: lowercase, remove accents, trim.
 */
export const norm = (s: string): string => {
  if (!s) return '';
  return s.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
};

/**
 * Resolves a label transitively through semantic links.
 * E.g., "Angina" -> "Chest Pain" (synonym)
 * E.g., "Polypnea" -> "Dyspnea" (is_a)
 * 
 * @param label The starting label
 * @param maxHops Prevent infinite loops
 */
export const resolveLabelSemantics = (label: string, maxHops = 6): string => {
  let current = norm(label);
  const links = getSemanticLinks();
  const visited = new Set<string>();
  visited.add(current);

  for (let i = 0; i < maxHops; i++) {
    // Find a link where source == current
    const link = links.find(l => 
      norm(l.concept_source) === current && 
      (l.relation === 'synonyme_de' || l.relation === 'est_un')
    );

    if (link) {
      const next = norm(link.concept_cible);
      if (visited.has(next)) {
        break; // Cycle detected
      }
      current = next;
      visited.add(current);
    } else {
      break; // No further links
    }
  }

  return current;
};

/**
 * Maps a label (or its semantic resolved version) to a Canonical Concept ID in the store.
 * Checks concept label AND synonyms.
 */
export const resolveToConceptId = (store: SCRTStore, label: string): string | null => {
  const target = norm(label);
  if (!target) return null;

  // 1. Direct Search in Concept Store
  const directMatch = store.concept_store.concepts.find(c => 
    norm(c.label) === target || 
    (c.synonyms || []).some(syn => norm(syn) === target)
  );

  if (directMatch) return directMatch.concept_id;

  // 2. Semantic Resolution then Search
  const resolvedLabel = resolveLabelSemantics(label);
  if (resolvedLabel !== target) {
    const indirectMatch = store.concept_store.concepts.find(c => 
        norm(c.label) === resolvedLabel || 
        (c.synonyms || []).some(syn => norm(syn) === resolvedLabel)
    );
    if (indirectMatch) return indirectMatch.concept_id;
  }

  return null;
};
