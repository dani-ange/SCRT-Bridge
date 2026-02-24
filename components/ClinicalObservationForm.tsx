
import React, { useState, useMemo, useEffect } from 'react';
import { ClinicalOntology, MainSectionId, ObservationValue, ClinicalElement } from '../types';

interface Props {
  onAnalyze: (values: ObservationValue[], fullSummary: string) => void;
  onRealtimeUpdate: (values: ObservationValue[], fullSummary: string) => void;
  loading: boolean;
  ontology: ClinicalOntology;
}

const SECTION_LABELS: Record<MainSectionId, string> = {
  motif_histoire: "History",
  antecedent: "Antecedents",
  symptome: "Symptoms",
  parametres_vitaux: "Vitals",
  examen_physique: "Physical Exam",
  paraclinique: "Labs/Imaging"
};

export const ClinicalObservationForm: React.FC<Props> = ({ onAnalyze, onRealtimeUpdate, loading, ontology }) => {
  const [activeTab, setActiveTab] = useState<MainSectionId>('motif_histoire');
  const [observationValues, setObservationValues] = useState<Record<string, any>>({});
  const [motifText, setMotifText] = useState('');

  // Helper to construct payload
  const getPayload = (currentValues: Record<string, any>, text: string) => {
    const values: ObservationValue[] = Object.entries(currentValues)
      .filter(([_, v]) => v !== undefined && v !== '' && v !== false)
      .map(([id, v]) => ({ element_id: id, value: v }));

    const summaryParts = [
      `HISTORY: ${text || 'N/A'}`,
      `CLINICAL: ${values.map(v => {
        const el = ontology.elements.find(e => e.id === v.element_id);
        return `${el?.name}: ${v.value}`;
      }).join(', ')}`
    ];

    return { values, text: summaryParts.join('\n') };
  };

  // Real-time updates effect
  useEffect(() => {
    const payload = getPayload(observationValues, motifText);
    // Debounce slightly for text, immediate for values
    const timer = setTimeout(() => {
        onRealtimeUpdate(payload.values, payload.text);
    }, 500);
    return () => clearTimeout(timer);
  }, [observationValues, motifText]);

  const updateValue = (id: string, val: any) => {
    setObservationValues(prev => ({ ...prev, [id]: val }));
  };

  const handleSubmit = () => {
    const payload = getPayload(observationValues, motifText);
    onAnalyze(payload.values, payload.text);
  };

  const renderInput = (el: ClinicalElement) => {
    const val = observationValues[el.id];
    const desc = el.mode_description;

    if (!desc) return null;

    return (
      <div key={el.id} className="space-y-3 bg-white p-5 rounded-2xl border border-slate-100 transition-all hover:border-indigo-100 shadow-sm hover:shadow-md">
        <div className="flex justify-between items-center">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{el.name}</span>
            <button 
                onClick={() => updateValue(el.id, val ? undefined : true)}
                className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${val ? 'bg-indigo-600 border-indigo-600 text-white shadow-indigo-200 shadow-lg' : 'bg-slate-50 border-slate-200 text-slate-300'}`}
            >
                <i className={`fas ${val ? 'fa-check' : 'fa-plus'} text-[10px]`}></i>
            </button>
        </div>

        {val && desc.type === 'options' && (
            <div className="pt-3 border-t border-slate-50 animate-in">
                <p className="text-[8px] font-black text-indigo-400 uppercase mb-2">Characteristics:</p>
                <div className="flex flex-wrap gap-1.5">
                    {desc.options?.map(opt => (
                        <button 
                            key={opt}
                            onClick={() => updateValue(el.id, opt)}
                            className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold border transition-all ${val === opt ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-200'}`}
                        >
                            {opt}
                        </button>
                    ))}
                </div>
            </div>
        )}

        {desc.type === 'numeric' && (
          <div className="flex items-center gap-2 animate-in">
            <input 
                type="number" 
                className="w-full bg-slate-50 p-2 rounded-lg text-xs font-bold outline-none border border-transparent focus:border-indigo-200 focus:bg-white transition-all"
                placeholder={`${desc.unit || 'Value'}`}
                value={typeof val === 'number' ? val : ''}
                onChange={e => updateValue(el.id, parseFloat(e.target.value))}
            />
            {desc.unit && <span className="text-[10px] text-slate-400 font-bold">{desc.unit}</span>}
          </div>
        )}
      </div>
    );
  };

  const filteredElements = useMemo(() => 
    ontology.elements.filter(e => e.section_observation === activeTab),
  [ontology, activeTab]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-2xl overflow-x-auto sticky top-0 z-10">
        {(Object.keys(SECTION_LABELS) as MainSectionId[]).map(id => (
            <button key={id} onClick={() => setActiveTab(id)} className={`px-3 py-2 rounded-xl text-[9px] font-black transition-all flex-1 whitespace-nowrap ${activeTab === id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                {SECTION_LABELS[id].toUpperCase()}
            </button>
        ))}
      </div>

      <div className="min-h-[400px]">
        {activeTab === 'motif_histoire' ? (
          <textarea 
              className="w-full h-48 p-5 rounded-2xl border border-slate-100 outline-none focus:ring-4 focus:ring-indigo-500/5 text-sm font-medium transition-all" 
              placeholder="Patient narrative (e.g., 45-year-old patient with dry cough...)"
              value={motifText}
              onChange={e => setMotifText(e.target.value)}
          />
        ) : (
          <div className="grid md:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar pb-12">
            {filteredElements.map(renderInput)}
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-slate-100">
        <button onClick={handleSubmit} disabled={loading} className="w-full group bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-xl shadow-indigo-200/50 flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all">
            {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-brain group-hover:animate-pulse"></i>}
            <span className="uppercase text-xs tracking-widest">Start Convolutional Reasoning</span>
        </button>
      </div>
    </div>
  );
};
