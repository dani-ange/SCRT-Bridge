
import React, { useState, useEffect, useRef } from 'react';
import { medgemma_pathology_enrichment, medgemma_chat_concept_extractor, medgemma_clinical_reasoning } from '../services/geminiService';
import { getGrammar } from '../services/grammarService';
import { scrt_get_store, scrt_store_pathology, querySCRT } from '../services/scrtService';
import { resolveConcept } from '../services/semanticLinkService';
import { SCRTNode, SCRTInferenceResult, ObservationValue, ClinicalElement } from '../types';
import ReactMarkdown from 'react-markdown';

export const ISCIOverlay: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<{ role: 'user' | 'system', text: string, matches?: string[], error?: boolean }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [history]);

  /**
   * Tente de trouver l'élément de grammaire correspondant à un concept extrait
   */
  const findMatchingElement = (extractedName: string, elements: ClinicalElement[]): ClinicalElement | undefined => {
    const search = extractedName.toLowerCase().trim();
    const canonicalSearch = resolveConcept(search).toLowerCase().trim();

    // 1. Match Exact
    let match = elements.find(el => el.name.toLowerCase() === search);
    if (match) return match;

    // 2. Match via Synonyme (Service de liens sémantiques)
    match = elements.find(el => resolveConcept(el.name).toLowerCase().trim() === canonicalSearch);
    if (match) return match;

    // 3. Match Partiel (Si la racine de la grammaire est contenue dans le terme extrait)
    match = elements.find(el => search.includes(el.name.toLowerCase()) || el.name.toLowerCase().includes(search));
    
    return match;
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    if (runningRef.current) return;

    runningRef.current = true;
    const userText = input;
    setHistory(prev => [...prev, { role: 'user', text: userText }]);
    setInput('');
    setLoading(true);

    try {
      const grammar = getGrammar();
      const store = scrt_get_store();

      const isEnrichment = userText.toLowerCase().includes("add") || 
                           userText.toLowerCase().includes("create") || 
                           userText.toLowerCase().includes("enrich");

      if (isEnrichment) {
        const result = await medgemma_pathology_enrichment(userText, store.nodes, grammar.elements);
        result.updatedNodes.forEach(upd => {
            if (upd.pathology) {
                scrt_store_pathology({
                    node_id: `CHAT_${Date.now()}`,
                    pathology: upd.pathology,
                    clinique: { symptomes: [], signes: [], modalites_pivots: [] },
                    contexte: { 
                      definition: upd.description || "Added via Chat", 
                      epidemiologie: "", 
                      examens_complementaires: [], 
                      prise_en_charge: { medicale: [], chirurgicale: [], surveillance: [] } 
                    },
                    ...upd
                } as any);
            }
        });
        setHistory(prev => [...prev, { role: 'system', text: result.explanation }]);
      } else {
        // PIPELINE DE RAISONNEMENT SCRT
        // 1. Extraction guidée par la grammaire
        const grammarSample = grammar.elements.map(e => e.name);
        const extracted = await medgemma_chat_concept_extractor(userText, grammarSample);
        
        console.log("Concepts extracted by Gemini:", extracted);

        // 2. Mapping Intelligent (Multi-niveaux)
        const obsValues: ObservationValue[] = extracted.map(ex => {
            const el = findMatchingElement(ex.name, grammar.elements);
            if (el) {
                console.log(`Match found : "${ex.name}" -> element_id: ${el.id} (${el.name})`);
                return { element_id: el.id, value: ex.value };
            }
            console.warn(`No match for concept : "${ex.name}"`);
            return null;
        }).filter(x => x !== null) as ObservationValue[];

        // 3. Consultation de la mémoire SCRT avec les IDs mappés
        const scrtResults = querySCRT({ values: obsValues, reconstructedText: userText });
        const topMatches = scrtResults.filter(r => r.score > 0).slice(0, 3);
        const matchLabels = topMatches.map(m => `${m.node.pathology} (Match: ${m.score}w)`);

        // 4. Synthèse finale
        const finalResponse = await medgemma_clinical_reasoning(topMatches, userText);
        
        setHistory(prev => [...prev, { 
            role: 'system', 
            text: finalResponse,
            matches: matchLabels 
        }]);
      }
    } catch (e: any) {
      console.error(e);
      setHistory(prev => [...prev, { 
        role: 'system', 
        text: "The convolution flow was interrupted by a technical error.",
        error: true
      }]);
    } finally {
      setLoading(false);
      runningRef.current = false;
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-24 right-8 z-[60] bg-slate-900 text-white px-6 py-4 rounded-full shadow-2xl border border-white/10 flex items-center gap-3 hover:scale-105 transition-all group"
      >
        <div className="relative">
             <i className="fas fa-brain text-xl text-blue-400"></i>
             <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
        </div>
        <span className="text-xs font-black uppercase tracking-widest hidden md:inline">SCRT Consultation</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-end p-4 md:p-8 pointer-events-none">
          <div className="w-full max-w-xl bg-slate-950 text-white rounded-[2.5rem] shadow-2xl border border-white/10 flex flex-col pointer-events-auto h-[85vh] overflow-hidden animate-in">
            <div className="p-6 bg-gradient-to-r from-slate-900 to-indigo-950 flex justify-between items-center border-b border-white/5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center border border-indigo-500/30">
                    <i className="fas fa-microchip text-indigo-400"></i>
                </div>
                <div>
                    <h3 className="text-sm font-black uppercase tracking-widest leading-none">Insight Engine v12</h3>
                    <p className="text-[9px] text-slate-500 font-bold mt-1">SCRT REASONING MODULE</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-white transition-colors p-2">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
              {history.length === 0 && (
                <div className="text-center py-20 opacity-40">
                    <i className="fas fa-wave-square text-4xl mb-4 text-indigo-500"></i>
                    <p className="text-xs font-bold px-10 leading-relaxed">Submit a clinical case. The system will extract signs and query its semantic memory to answer you.</p>
                </div>
              )}
              {history.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in`}>
                  <div className={`max-w-[90%] p-5 rounded-3xl text-sm ${
                    msg.role === 'user' 
                      ? 'bg-indigo-600 font-medium text-white shadow-lg' 
                      : msg.error 
                        ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                        : 'bg-white/5 border border-white/10 text-slate-300'
                  }`}>
                    <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                  </div>
                  {msg.matches && msg.matches.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2 px-2">
                        <span className="text-[8px] font-black text-indigo-400 uppercase self-center mr-1">Memory Resonance:</span>
                        {msg.matches.map((m, idx) => (
                            <span key={idx} className="bg-emerald-500/10 text-emerald-400 text-[9px] font-black px-2 py-1 rounded-lg border border-emerald-500/20">
                                <i className="fas fa-bolt mr-1"></i> {m}
                            </span>
                        ))}
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-3 text-indigo-400 animate-pulse px-2">
                    <i className="fas fa-atom fa-spin"></i>
                    <span className="text-[10px] font-black uppercase tracking-widest">Computing semantic interference...</span>
                </div>
              )}
            </div>

            <div className="p-6 bg-slate-900/50 border-t border-white/5 backdrop-blur-md">
              <div className="relative flex items-center gap-2">
                <input 
                  className="flex-1 p-4 bg-white/5 border border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm placeholder-slate-600"
                  placeholder="Ex: Patient with epigastric pain and melena..."
                  value={input}
                  disabled={loading}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                />
                <button 
                    onClick={handleSend} 
                    disabled={loading || !input.trim()}
                    className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center hover:bg-indigo-500 transition-all disabled:opacity-50 shadow-xl"
                >
                    <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
