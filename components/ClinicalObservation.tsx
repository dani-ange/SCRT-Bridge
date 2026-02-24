
import React, { useState, useRef } from 'react';
import { ClinicalOntology, ObservationValue, SCRTInferenceResult } from '../types';
import { querySCRT } from '../services/scrtService';
import { medgemma_clinical_reasoning, medgemma_chat_concept_extractor, medgemma_direct_reasoning } from '../services/geminiService';
import { useZoom } from '../contexts/ZoomContext';
import { Zoomable } from './Zoomable';

interface Props {
  ontology: ClinicalOntology;
  onAnalysisUpdate: (results: SCRTInferenceResult[]) => void;
  onStartReasoning: (synthesisPromise: Promise<string>, extractedTokens: string[], useSCRT: boolean) => void;
  isReasoningActive?: boolean;
}

export const ClinicalObservation: React.FC<Props> = ({ ontology, onAnalysisUpdate, onStartReasoning, isReasoningActive = false }) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [useSCRT, setUseSCRT] = useState(true);
  const recognitionRef = useRef<any>(null);
  const runningRef = useRef(false);
  
  // Zoom Focus references
  const switchRef = useRef<HTMLDivElement>(null);
  const { zoomIn } = useZoom();

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert("Your browser does not support speech recognition.");
        return;
      }
      
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      
      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        
        if (finalTranscript) {
            setInput(prev => {
                const cleanPrev = prev.trim();
                return cleanPrev ? `${cleanPrev} ${finalTranscript}` : finalTranscript;
            });
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        if (event.error === 'not-allowed' || event.error === 'permission-denied') {
            alert("Microphone access denied. Please allow microphone access in your browser settings to use dictation.");
        }
        setIsListening(false);
      };

      recognition.onend = () => {
          setIsListening(false);
      };

      try {
        recognition.start();
        recognitionRef.current = recognition;
        setIsListening(true);
      } catch (err) {
        console.error("Failed to start recognition:", err);
        setIsListening(false);
      }
    }
  };

  const handleAnalyze = async () => {
    if (!input.trim() || loading) return;
    if (runningRef.current) return;
    
    runningRef.current = true;
    setLoading(true);

    try {
      let results: SCRTInferenceResult[] = [];
      let tokenNames: string[] = [];
      let synthesisPromise: Promise<string>;

      if (useSCRT) {
          const grammarSample = ontology.elements.map(e => e.name);
          const extracted = await medgemma_chat_concept_extractor(input, grammarSample);
          tokenNames = extracted.map(e => e.name);

          const obsValues: ObservationValue[] = extracted.map(ex => {
            const match = ontology.elements.find(el => 
                el.name.toLowerCase() === ex.name.toLowerCase() || 
                input.toLowerCase().includes(el.name.toLowerCase())
            );
            return match ? { element_id: match.id, value: ex.value } : null;
          }).filter(x => x !== null) as ObservationValue[];

          results = querySCRT({ values: obsValues, reconstructedText: input });
          onAnalysisUpdate(results);
          
          synthesisPromise = medgemma_clinical_reasoning(results, input);
      } else {
          // Direct Mode: Skip extraction, skip SCRT query
          onAnalysisUpdate([]);
          tokenNames = []; // No tokens to display
          // Send original message directly to Gemini without SCRT context
          synthesisPromise = medgemma_direct_reasoning(input);
      }

      onStartReasoning(synthesisPromise, tokenNames, useSCRT);

    } catch (error) {
      console.error(error);
      alert("Analysis failed. Please try again.");
    } finally {
        setLoading(false);
        runningRef.current = false;
    }
  };

  if (isReasoningActive) return null;

  return (
    <div className="max-w-4xl mx-auto pt-16 animate-in">
      <div className="text-center mb-12">
          <div className="inline-block p-3 bg-indigo-500/10 rounded-3xl mb-4 border border-indigo-500/20">
              <i className="fas fa-stethoscope text-2xl text-indigo-500"></i>
          </div>
          <h2 className="text-5xl font-black text-slate-800 tracking-tight mb-4">SCRT Consultation</h2>
          <p className="text-slate-500 font-medium text-lg">Describe the patient's clinical state to initiate convolution.</p>
      </div>

      {/* SCRT Toggle Switch with Zoom capability */}
      <div className="flex justify-center mb-10 relative">
        <div ref={switchRef} className="relative w-full max-w-lg">
             {/* Zoom Trigger Button - visually subtle but accessible */}
             <button 
                onClick={(e) => {
                    e.stopPropagation();
                    zoomIn(switchRef, "Neural Engine Control");
                }}
                className="absolute -top-10 right-0 text-slate-300 hover:text-indigo-500 transition-colors p-2 text-xs font-black uppercase tracking-widest flex items-center gap-2 group"
             >
                <i className="fas fa-search-plus text-lg group-hover:scale-110 transition-transform"></i>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">Focus</span>
             </button>

            <div 
                onClick={() => setUseSCRT(!useSCRT)}
                className={`
                    cursor-pointer w-full p-2 rounded-2xl border-2 transition-all duration-500 flex items-center shadow-2xl
                    ${useSCRT 
                        ? 'bg-slate-900 border-indigo-500/50 shadow-indigo-500/20' 
                        : 'bg-white border-slate-200 shadow-slate-200'}
                `}
            >
                <div className={`
                    absolute top-2 bottom-2 w-[calc(50%-8px)] rounded-xl transition-all duration-500 ease-in-out shadow-lg
                    ${useSCRT ? 'left-2 bg-indigo-600' : 'left-[calc(50%+4px)] bg-slate-100 border border-slate-200'}
                `}></div>

                <div className={`flex-1 relative z-10 text-center py-4 text-xs font-black uppercase tracking-[0.2em] transition-colors duration-500 ${useSCRT ? 'text-white' : 'text-slate-400'}`}>
                    <i className="fas fa-project-diagram mr-3"></i>
                    SCRT v12 Active
                </div>
                <div className={`flex-1 relative z-10 text-center py-4 text-xs font-black uppercase tracking-[0.2em] transition-colors duration-500 ${!useSCRT ? 'text-slate-800' : 'text-slate-600'}`}>
                    <i className="fas fa-brain mr-3"></i>
                    MedGemma Direct
                </div>
            </div>
        </div>
      </div>

      <div className="relative group max-w-3xl mx-auto">
        <div className={`absolute -inset-1 bg-gradient-to-r rounded-[3rem] blur opacity-20 group-hover:opacity-40 transition duration-1000 ${useSCRT ? 'from-indigo-500 to-emerald-500' : 'from-slate-400 to-slate-600'}`}></div>
        <Zoomable label="Clinical Entry" className="relative bg-white p-4 rounded-[3rem] shadow-2xl flex flex-col border border-slate-100">
            <textarea 
                className="w-full bg-transparent px-8 py-6 outline-none text-xl font-medium text-slate-700 placeholder-slate-300 resize-none h-44 custom-scrollbar"
                placeholder="Ex: 55-year-old patient presenting with progressive exertional dyspnea..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAnalyze(); }}}
            />
            <div className="flex justify-between items-center px-6 pb-2">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={toggleListening}
                        className={`
                            flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all
                            ${isListening 
                                ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30' 
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}
                        `}
                    >
                        <i className={`fas ${isListening ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
                        {isListening ? 'Listening...' : 'Dictate'}
                    </button>
                    <span className="text-slate-300 text-[10px] font-bold hidden sm:inline">Shift+Enter for new line</span>
                </div>
                
                <button 
                    onClick={handleAnalyze}
                    disabled={!input.trim() || loading}
                    className={`
                        w-16 h-16 rounded-[2rem] flex items-center justify-center transition-all duration-500 shadow-xl
                        ${loading ? 'bg-slate-100 text-slate-300' : (useSCRT ? 'bg-slate-900 text-white hover:bg-indigo-600' : 'bg-emerald-500 text-white hover:bg-emerald-600')}
                        hover:scale-105
                    `}
                >
                    {loading ? <i className="fas fa-atom fa-spin text-xl"></i> : <i className="fas fa-paper-plane text-xl"></i>}
                </button>
            </div>
        </Zoomable>
      </div>
    </div>
  );
};
