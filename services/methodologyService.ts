
import { ElementType, MainSectionId, IPPAMethod } from '../types';

export const CLINICAL_METHODOLOGY = {
  anamnese: {
    types_autorises: ['symptome', 'antecedent'],
    // Fixed: replaced 'atcd' and 'enquete_systemes' with valid MainSectionId values
    sections: ['motif_histoire', 'antecedent', 'symptome']
  },
  examen_physique: {
    types_autorises: ['signe_clinique', 'mesure'],
    ippa_order: ['general', 'inspection', 'palpation', 'percussion', 'auscultation']
  },
  paraclinique: {
    types_autorises: ['signe_paraclinique']
  }
};

export interface MethodologyClassification {
  section: MainSectionId;
  ippa?: IPPAMethod;
}

export const classifyClinicalConcept = (type: ElementType, label: string): MethodologyClassification => {
  const l = label.toLowerCase();
  
  // 1. Determine Root Section
  // Fixed: used valid MainSectionId values
  if (type === 'symptome') return { section: 'symptome' };
  if (type === 'antecedent') return { section: 'antecedent' };
  if (type === 'signe_paraclinique') return { section: 'paraclinique' };
  
  // 2. Fine-grained IPPA Logic for Clinical Signs
  if (type === 'signe_clinique' || type === 'mesure') {
    let method: IPPAMethod = 'inspection'; // Default: what is seen
    
    // AUSCULTATION
    if (l.includes('breath') || l.includes('sound') || l.includes('rale') || l.includes('murmur') || 
        l.includes('auscultation') || l.includes('crackle') || l.includes('wheeze') || 
        l.includes('stridor') || l.includes('friction') || l.includes('rub')) {
      method = 'auscultation';
    } 
    // PERCUSSION
    else if (l.includes('dullness') || l.includes('tympany') || l.includes('percussion') || l.includes('resonance')) {
      method = 'percussion';
    } 
    // PALPATION
    else if (l.includes('tenderness') || l.includes('mass') || l.includes('palpation') || 
             l.includes('vibration') || l.includes('thrill') || l.includes('heave') ||
             l.includes('guarding') || l.includes('rigidity') || l.includes('fluid wave')) {
      method = 'palpation';
    } 
    // GENERAL / PARAMETERS
    else if (l.includes('pressure') || l.includes('rate') || l.includes('temperature') || 
             l.includes('weight') || l.includes('saturation') || l.includes('glasgow') || l.includes('bmi')) {
      method = 'general';
    }
    // INSPECTION (Enriched Default)
    else if (l.includes('cyanosis') || l.includes('jaundice') || l.includes('scar') || 
             l.includes('edema') || l.includes('mottling') || l.includes('retraction')) {
      method = 'inspection';
    }

    return { section: 'examen_physique', ippa: method };
  }

  // Fixed: used valid MainSectionId value
  return { section: 'symptome' };
};
