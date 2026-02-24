
import React, { useState } from 'react';
// Import necessary functions for temporary concept resolution
import { getGrammar, saveGrammar, resolveTemporaryConcept, deduceSection } from '../services/grammarService';
import { scrt_get_store, scrt_delete_node, scrt_delete_concept } from '../services/scrtService';
import { resolveToConceptId } from '../services/conceptResolver';
import { ClinicalElement, TemporaryConcept, SCRTStore, SCRTNode } from '../types';

// Define Props interface to match usage in App.tsx
interface Props {
  concepts: TemporaryConcept[];
  store: SCRTStore;
  onResolved: () => void;
}

// Update component signature to accept Props
export const ClinicianLearning: React.FC<Props> = ({ concepts, store, onResolved }) => {
  const [ontology, setOntology] = useState(getGrammar());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ isOpen: boolean; message: string; onConfirm: () => void } | null>(null);

  const handleUpdate = (id: string, newName: string) => {
    const updated = { ...ontology };
    const el = updated.elements.find(e => e.id === id);
    if (el) el.name = newName;
    saveGrammar(updated);
    setOntology(updated);
    setEditingId(null);
    // Notify parent to refresh state
    onResolved();
  };

  const confirmDeleteElement = (id: string) => {
    setConfirmation({
      isOpen: true,
      message: "Do you want to delete this concept? This may impact convolution.",
      onConfirm: () => executeDeleteElement(id)
    });
  };

  const executeDeleteElement = (id: string) => {
    const elToDelete = ontology.elements.find(e => e.id === id);

    const updated = { ...ontology };
    updated.elements = updated.elements.filter(e => e.id !== id);
    saveGrammar(updated);
    setOntology(updated);
    
    // Also delete from Concept Store if exists
    if (elToDelete) {
        const conceptId = resolveToConceptId(store, elToDelete.name);
        if (conceptId) {
            scrt_delete_concept(conceptId);
        }
    }

    // Notify parent to refresh state
    onResolved();
    setConfirmation(null);
  };

  const confirmDeleteNode = (node: SCRTNode) => {
      setConfirmation({
          isOpen: true,
          message: `Delete node "${node.pathology}"? This cannot be undone.`,
          onConfirm: () => {
              scrt_delete_node(node.node_id);
              onResolved();
              setConfirmation(null);
          }
      });
  };

  // Logic to move a temporary concept into the validated grammar
  const validateConcept = (temp: TemporaryConcept) => {
    const newEl: ClinicalElement = {
      id: `EL_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: temp.raw_label,
      type: temp.detected_type_guess,
      section_observation: deduceSection(temp.detected_type_guess),
      subsection: 'Manual Learning',
      synonymes: [],
      mode_description: { type: 'boolean' }
    };
    resolveTemporaryConcept(temp.id, newEl);
    setOntology(getGrammar());
    onResolved();
  };

  return (
    <div className="space-y-8 animate-in">
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
        <h2 className="text-2xl font-black text-slate-800">Semantic Grammar Audit</h2>
        <p className="text-slate-400 text-sm mt-1">Monitor auto-generated root concepts and validate new detections.</p>
      </div>

      {/* Display pending concepts passed via props */}
      {concepts.filter(c => c.status === 'pending').length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center gap-3">
             <div className="w-2 h-2 bg-amber-500 rounded-full animate-ping"></div>
             <h3 className="text-lg font-black text-amber-600 uppercase tracking-tight">Concepts Pending Approval</h3>
          </div>
          <div className="grid lg:grid-cols-3 gap-6">
            {concepts.filter(c => c.status === 'pending').map(temp => (
              <div key={temp.id} className="bg-amber-50 p-6 rounded-3xl border border-amber-100 shadow-md flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="px-2 py-0.5 text-[8px] font-black uppercase rounded bg-amber-200 text-amber-800">
                      {temp.detected_type_guess}
                    </span>
                    <span className="px-2 py-0.5 text-[8px] font-black uppercase rounded bg-blue-100 text-blue-800">
                      Seen: {temp.count_seen || 1}
                    </span>
                  </div>
                  <h4 className="font-black text-amber-900 text-lg">{temp.raw_label}</h4>
                  <p className="text-[10px] text-amber-700 italic mt-1">Source: {temp.source_document}</p>
                  <p className="text-[9px] text-amber-600/60 mt-0.5">Last seen: {new Date(temp.last_seen).toLocaleDateString()}</p>
                </div>
                <button 
                  onClick={() => validateConcept(temp)}
                  className="mt-6 w-full bg-amber-600 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-700 transition-all shadow-lg"
                >
                  Approve Concept
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-6">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 flex justify-between items-center">
            <div>
                <h2 className="text-2xl font-black text-slate-800">Knowledge Base (Neurons)</h2>
                <p className="text-slate-400 text-sm mt-1">Manage pathologies, syndromes, and guidelines.</p>
            </div>
            <div className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest">
                {store.nodes.length} Nodes
            </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
            {store.nodes.map(node => (
                <div key={node.node_id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center group hover:border-indigo-200 transition-all">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 text-[8px] font-black uppercase rounded ${
                                node.node_kind === 'pathology' ? 'bg-indigo-100 text-indigo-700' : 
                                node.node_kind === 'syndrome' ? 'bg-amber-100 text-amber-700' :
                                'bg-slate-100 text-slate-600'
                            }`}>
                                {node.node_kind || 'pathology'}
                            </span>
                            <span className="text-[9px] text-slate-400 font-mono">{node.node_id}</span>
                        </div>
                        <h4 className="font-bold text-slate-800">{node.pathology}</h4>
                        {node.title && node.title !== node.pathology && <p className="text-xs text-slate-500 italic">{node.title}</p>}
                    </div>
                    <button 
                        onClick={() => confirmDeleteNode(node)}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                        <i className="fas fa-trash"></i>
                    </button>
                </div>
            ))}
        </div>
      </section>

      <section className="space-y-6">
        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Validated Grammar</h3>
        <div className="grid lg:grid-cols-3 gap-6">
          {ontology.elements.map(el => (
            <div key={el.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl group hover:border-blue-200 transition-all">
              <div className="flex justify-between items-start mb-4">
                <span className={`px-2 py-0.5 text-[8px] font-black uppercase rounded ${el.type === 'symptome' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  {el.type}
                </span>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                   <button onClick={() => setEditingId(el.id)} className="text-slate-400 hover:text-blue-600"><i className="fas fa-edit"></i></button>
                   <button onClick={() => confirmDeleteElement(el.id)} className="text-slate-400 hover:text-red-600"><i className="fas fa-trash"></i></button>
                </div>
              </div>

              {editingId === el.id ? (
                <div className="flex gap-2">
                  <input 
                    autoFocus 
                    className="flex-1 bg-slate-50 border-b-2 border-blue-600 outline-none font-bold text-sm px-2 py-1"
                    defaultValue={el.name}
                    onKeyDown={e => e.key === 'Enter' && handleUpdate(el.id, e.currentTarget.value)}
                    onBlur={e => handleUpdate(el.id, e.target.value)}
                  />
                </div>
              ) : (
                <h4 className="font-black text-slate-800 text-lg">{el.name}</h4>
              )}
              
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">{el.subsection}</p>
              
              <div className="mt-4 pt-4 border-t border-slate-50">
                 <span className="text-[9px] font-black text-slate-300 uppercase tracking-tighter">Used by</span>
                 <div className="flex flex-wrap gap-1 mt-2">
                    {store.nodes.filter(n => [...n.clinique.symptomes, ...n.clinique.signes].some(t => t.concept_id === el.id)).map(n => (
                      <span key={n.node_id} className="text-[8px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">{n.pathology}</span>
                    ))}
                 </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {confirmation && confirmation.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-100 scale-100">
            <h3 className="text-xl font-black text-slate-800 mb-4">Confirm Action</h3>
            <p className="text-slate-600 mb-8">{confirmation.message}</p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setConfirmation(null)}
                className="px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmation.onConfirm}
                className="px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-200 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
