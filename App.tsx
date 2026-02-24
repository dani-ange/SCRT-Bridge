
import React, { useState, useEffect, useMemo } from 'react';
import { KnowledgeAcquisition } from './components/KnowledgeAcquisition';
import { ClinicalObservation } from './components/ClinicalObservation';
import { ClinicianLearning } from './components/ClinicianLearning';
import { NeuralMemoryPanel } from './components/NeuralMemoryPanel';
import { SelectionTool } from './components/SelectionTool';
import { LandingPage } from './components/LandingPage';
import { scrt_get_store } from './services/scrtService';
import { getGrammar } from './services/grammarService';
import { SCRTStore, ClinicalOntology, SCRTInferenceResult } from './types';
import ReactMarkdown from 'react-markdown';
import { ZoomProvider } from './contexts/ZoomContext';
import { Zoomable } from './components/Zoomable';

type ReasonState = 'IDLE' | 'EXTRACTION' | 'NEURAL' | 'DETAILS' | 'SYNTHESIS';

const InputToBrainArrows: React.FC<{ active: boolean }> = ({ active }) => {
    if (!active) return null;
    return (
        <div className="absolute top-[40%] left-[19%] w-[14%] h-24 pointer-events-none z-50 flex items-center overflow-hidden">
             {/* Gradient lines moving right */}
             <div className="absolute top-1/2 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent animate-shimmer" style={{ animationDuration: '1s' }}></div>
             <div className="absolute top-1/2 right-0 transform translate-x-1/2 animate-bounce-x text-indigo-400 text-2xl"><i className="fas fa-chevron-right"></i></div>
        </div>
    );
};

const BrainToOutputArrows: React.FC<{ active: boolean }> = ({ active }) => {
    if (!active) return null;
    return (
        <div className="absolute top-[40%] right-[24%] w-[14%] h-24 pointer-events-none z-50 flex items-center overflow-hidden">
             {/* Gradient lines moving right */}
             <div className="absolute top-1/2 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent animate-shimmer" style={{ animationDuration: '1s' }}></div>
             <div className="absolute top-1/2 right-0 transform translate-x-1/2 animate-bounce-x text-amber-500 text-2xl"><i className="fas fa-chevron-right"></i></div>
        </div>
    );
};

const App: React.FC = () => {
  const [showLanding, setShowLanding] = useState(true);
  const [activeTab, setActiveTab] = useState<'learn' | 'reason' | 'memory' | 'clinic'>('reason');
  const [store, setStore] = useState<SCRTStore>(scrt_get_store());
  const [ontology, setOntology] = useState<ClinicalOntology>(getGrammar());
  const [inferenceResults, setInferenceResults] = useState<SCRTInferenceResult[]>([]);
  const [reasonState, setReasonState] = useState<ReasonState>('IDLE');
  const [tokens, setTokens] = useState<string[]>([]);
  const [visibleTokenCount, setVisibleTokenCount] = useState(0);
  const [activeTokenIdx, setActiveTokenIdx] = useState(-1);
  const [synthesis, setSynthesis] = useState<string | null>(null);
  const [isDirectMode, setIsDirectMode] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
        setStore(scrt_get_store());
        setOntology(getGrammar());
    }, 2000); 
    return () => clearInterval(interval);
  }, []);

  const handleStartReasoning = async (promise: Promise<string>, extracted: string[], useSCRT: boolean) => {
      setTokens(extracted);
      setSynthesis(null);
      setIsDirectMode(!useSCRT);
      
      promise.then(res => {
          setSynthesis(res || "Synthesis unavailable.");
      }).catch(err => {
          console.error("Synthesis error:", err);
          setSynthesis(`**Critical Error**: ${err.message || "An error occurred during analysis."}`);
      });

      if (useSCRT) {
        // Step 1: Extraction Display (Left Panel)
        setReasonState('EXTRACTION');
        setVisibleTokenCount(0);
        setActiveTokenIdx(-1);

        // Animate tokens appearing
        for (let i = 0; i < extracted.length; i++) {
            await new Promise(r => setTimeout(r, 600));
            setVisibleTokenCount(prev => prev + 1);
        }
        
        // Step 2: Tokens enter Brain (Left -> Middle)
        // Highlight tokens one by one and simulate transfer
        await new Promise(r => setTimeout(r, 500));
        for (let i = 0; i < extracted.length; i++) {
             setActiveTokenIdx(i);
             await new Promise(r => setTimeout(r, 400));
        }
        
        // Step 3: Neural Processing (Middle Panel)
        setReasonState('NEURAL');
        setActiveTokenIdx(-1); // Stop highlighting left
        await new Promise(r => setTimeout(r, 5000)); // Let the brain pulse

        // Step 4: Output to Details (Middle -> Right)
        setReasonState('DETAILS');
        await new Promise(r => setTimeout(r, 4000)); // Show matches

        // Step 5: Final Report
        setReasonState('SYNTHESIS');
      } else {
        setReasonState('SYNTHESIS');
      }
  };

  const closeReasoning = () => {
      setReasonState('IDLE');
      setSynthesis(null);
      setTokens([]);
      setVisibleTokenCount(0);
      setActiveTokenIdx(-1);
      setInferenceResults([]);
      setIsDirectMode(false);
  };

  const activeResults = useMemo(() => {
      return inferenceResults.filter(r => r.score > 0).sort((a,b) => b.score - a.score);
  }, [inferenceResults]);

  const isReasoning = reasonState !== 'IDLE';

  return (
    <ZoomProvider>
    {/* Landing Page Layer */}
    {showLanding && <LandingPage onEnter={() => setShowLanding(false)} />}
    
    {/* Main Application Layer */}
    <div className={`h-screen bg-[#f8fafc] flex flex-col overflow-hidden relative transition-opacity duration-1000 ${showLanding ? 'opacity-0' : 'opacity-100'}`}>
      <SelectionTool />
      
      <header className={`medical-gradient text-white py-4 px-8 relative z-50 shadow-lg flex-shrink-0 transition-all duration-1000 ${isReasoning ? '-translate-y-full opacity-0' : ''}`}>
        <div className="max-w-[1920px] mx-auto flex justify-between items-center">
          <div className="flex items-center gap-6">
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
              <i className="fas fa-project-diagram text-indigo-400"></i>
              SCRT <span className="text-indigo-400 text-sm font-black">vNext</span>
            </h1>
            <nav className="flex gap-1 bg-slate-900/50 p-1.5 rounded-2xl border border-white/5 ml-8">
                <button onClick={() => setActiveTab('learn')} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'learn' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400 hover:text-white'}`}>Acquisition</button>
                <button onClick={() => setActiveTab('clinic')} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'clinic' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400 hover:text-white'}`}>Learning</button>
                <button onClick={() => setActiveTab('reason')} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'reason' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400 hover:text-white'}`}>Inference</button>
                <button onClick={() => setActiveTab('memory')} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'memory' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400 hover:text-white'}`}>Memory</button>
            </nav>
          </div>
          <div className="text-[10px] text-white/40 font-black tracking-widest uppercase">
            <i className="fas fa-circle text-emerald-500 mr-2 animate-pulse"></i>
            System Online
          </div>
        </div>
      </header>

      {/* REASONING HUD - FULL SCREEN */}
      {isReasoning && (
          <div className="absolute inset-0 z-40 bg-slate-950 flex transition-all duration-1000 overflow-hidden">
              
              {!isDirectMode && (
                  <>
                    {/* Visual Flow Arrows */}
                    <InputToBrainArrows active={activeTokenIdx !== -1} />
                    <BrainToOutputArrows active={reasonState === 'NEURAL' || reasonState === 'DETAILS'} />
                  </>
              )}
              
              {/* PANEL 1: EXTRACTION (Left) */}
              {!isDirectMode && (
                  <div className={`w-[20%] h-full flex flex-col border-r border-white/5 bg-slate-900/80 backdrop-blur-md transition-all duration-700 ease-in-out z-20 ${reasonState === 'EXTRACTION' || reasonState === 'NEURAL' || reasonState === 'DETAILS' ? 'translate-x-0' : '-translate-x-full'}`}>
                      <div className="p-8 border-b border-white/10 bg-slate-900">
                          <div className="flex items-center gap-3 mb-2">
                              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">Incoming Signal</span>
                          </div>
                          <h2 className="text-2xl font-black text-white tracking-tighter">Symptoms</h2>
                      </div>
                      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
                          {tokens.slice(0, visibleTokenCount).map((t, i) => (
                              <div key={i} className={`p-4 rounded-xl border flex items-center justify-between transition-all duration-300 ${activeTokenIdx === i ? 'bg-indigo-600 border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.5)] scale-105 z-10 translate-x-2' : 'bg-white/5 border-white/5 text-slate-400'}`}>
                                  <span className={`text-[11px] font-black uppercase tracking-wide ${activeTokenIdx === i ? 'text-white' : 'text-slate-400'}`}>{t}</span>
                                  {activeTokenIdx === i && <i className="fas fa-arrow-right text-white text-xs animate-bounce-x"></i>}
                              </div>
                          ))}
                      </div>
                  </div>
              )}

              {/* PANEL 2: NEURAL (Center) */}
              {!isDirectMode && (
                  <div className="flex-1 h-full relative z-10 bg-slate-950">
                      <div className="absolute top-6 left-6 z-20 flex gap-4 pointer-events-none">
                          <div className="bg-slate-900/80 backdrop-blur border border-white/10 px-4 py-2 rounded-full flex items-center gap-3">
                               <span className="relative flex h-2 w-2">
                                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 ${reasonState === 'NEURAL' ? 'block' : 'hidden'}`}></span>
                                  <span className={`relative inline-flex rounded-full h-2 w-2 ${reasonState === 'NEURAL' ? 'bg-emerald-500' : 'bg-slate-600'}`}></span>
                                </span>
                               <span className="text-[10px] font-black text-white uppercase tracking-widest">Convolution Active</span>
                          </div>
                      </div>
                      <NeuralMemoryPanel 
                        store={store} 
                        inferenceResults={reasonState === 'EXTRACTION' ? [] : inferenceResults} 
                        isReasoningMode={true} 
                        activeTokenIndex={activeTokenIdx} // Triggers pulses
                      />
                  </div>
              )}

              {/* PANEL 3: INFERENCE RESULTS (Right) */}
              {!isDirectMode && (
                  <div className={`w-[25%] h-full flex flex-col bg-white border-l border-slate-200 shadow-2xl transition-all duration-700 ease-in-out z-20 ${reasonState === 'DETAILS' ? 'translate-x-0' : 'translate-x-[110%]'}`}>
                      <div className="p-8 border-b border-slate-100 bg-slate-50">
                          <div className="flex items-center gap-3 mb-2">
                              <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce"></div>
                              <span className="text-[10px] font-black text-amber-600 uppercase tracking-[0.2em]">Semantic Resonance</span>
                          </div>
                          <h2 className="text-2xl font-black text-slate-900 tracking-tighter">Inference</h2>
                      </div>
                      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 bg-slate-50/50">
                          {activeResults.map((h, i) => (
                              <div key={i} className="bg-white p-6 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 animate-in hover:scale-[1.02] transition-transform duration-300" style={{ animationDelay: `${i * 150}ms` }}>
                                  <div className="flex justify-between items-start mb-4">
                                      <h4 className="text-lg font-black text-slate-800 leading-tight">{h.node.pathology}</h4>
                                      <span className="text-xl font-black text-amber-500">{h.score.toFixed(1)}</span>
                                  </div>
                                  <div className="h-1 w-full bg-slate-100 rounded-full mb-4 overflow-hidden">
                                      <div className="h-full bg-amber-500 transition-all duration-1000" style={{ width: `${Math.min(h.score * 5, 100)}%` }}></div>
                                  </div>
                                  <p className="text-[11px] text-slate-500 line-clamp-3 font-medium leading-relaxed mb-4">{h.node.contexte?.definition}</p>
                              </div>
                          ))}
                      </div>
                  </div>
              )}

              {/* SYNTHESIS OVERLAY (Full Screen White) - ALWAYS FULL PAGE IN DIRECT MODE */}
              <div className={`absolute inset-0 z-50 bg-white transition-all duration-1000 flex flex-col ${reasonState === 'SYNTHESIS' ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
                  
                  {/* Header */}
                  <div className="h-24 border-b border-slate-100 flex items-center justify-between px-10 bg-white shadow-sm flex-shrink-0">
                      <div className="flex items-center gap-6">
                          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                              <i className="fas fa-file-medical-alt"></i>
                          </div>
                          <div>
                              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">MedGemma Analysis Report</h2>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{isDirectMode ? 'Direct Synthesis (AI Only)' : 'SCRT Augmented Synthesis'}</p>
                          </div>
                      </div>
                      <div className="flex gap-4">
                           <button onClick={closeReasoning} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                               Close Report
                           </button>
                           <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-200">
                               <i className="fas fa-print mr-2"></i> Export PDF
                           </button>
                      </div>
                  </div>

                  <div className="flex-1 flex overflow-hidden">
                      {/* Left: Neural Markers Reference (Hidden in Direct Mode for Full Page Focus) */}
                      {!isDirectMode && activeResults.length > 0 && (
                        <div className="w-[380px] bg-slate-50 border-r border-slate-100 flex flex-col overflow-hidden">
                            <div className="p-8 border-b border-slate-100">
                                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Neural Markers</h3>
                                <p className="text-xs text-slate-500">Pathologies identified by convolution</p>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                                {activeResults.map((res, i) => (
                                    <Zoomable key={i} label={`Marker: ${res.node.pathology}`}>
                                    <div className="relative pl-6 border-l-2 border-indigo-200 group">
                                        <div className="absolute left-[-5px] top-0 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-white shadow-sm group-hover:scale-125 transition-transform"></div>
                                        <h4 className="text-lg font-black text-slate-800 leading-tight mb-2 group-hover:text-indigo-600 transition-colors">{res.node.pathology}</h4>
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="h-1.5 flex-1 bg-slate-200 rounded-full overflow-hidden">
                                                <div className="h-full bg-indigo-500" style={{ width: `${Math.min(res.score * 2, 100)}%` }}></div>
                                            </div>
                                            <span className="text-xs font-black text-indigo-600">{res.score.toFixed(1)}</span>
                                        </div>
                                    </div>
                                    </Zoomable>
                                ))}
                            </div>
                        </div>
                      )}

                      {/* Right: Main Content (Full Page if Direct Mode) */}
                      <div className={`flex-1 overflow-y-auto custom-scrollbar bg-white p-16 ${isDirectMode ? 'max-w-5xl mx-auto' : ''}`}>
                           <div className={`${isDirectMode ? 'w-full' : 'max-w-4xl mx-auto'}`}>
                               {!synthesis ? (
                                   <div className="flex flex-col items-center justify-center py-20 text-center">
                                       <div className="w-24 h-24 border-8 border-indigo-50 border-t-indigo-500 rounded-full animate-spin mb-10"></div>
                                       <h3 className="text-2xl font-black text-slate-900 mb-2">Generating Final Report...</h3>
                                       <p className="text-slate-400 uppercase tracking-widest text-xs">MedGemma Semantic Analysis in Progress</p>
                                   </div>
                               ) : (
                                   <article className="prose prose-slate prose-lg max-w-none prose-headings:font-black prose-headings:tracking-tight prose-headings:text-slate-900 prose-p:text-slate-600 prose-strong:text-indigo-600 prose-li:text-slate-600">
                                       <ReactMarkdown
                                            components={{
                                                p: ({node, children}) => <Zoomable label="Analysis Paragraph" className="mb-6"><p>{children}</p></Zoomable>,
                                                h1: ({node, children}) => <Zoomable label="Main Title" className="mb-10"><h1 className="text-5xl font-black text-indigo-900 border-b-4 border-indigo-50 pb-6">{children}</h1></Zoomable>,
                                                h2: ({node, children}) => <Zoomable label="Clinical Section" className="mt-12 mb-6"><h2 className="text-3xl font-black text-slate-800 flex items-center gap-4"><i className="fas fa-chevron-right text-indigo-500 text-sm"></i>{children}</h2></Zoomable>,
                                                h3: ({node, children}) => <Zoomable label="Key Point" className="mt-8 mb-4"><h3 className="text-xl font-bold text-slate-700 italic">{children}</h3></Zoomable>,
                                                ul: ({node, children}) => <Zoomable label="Item List" className="mb-8"><ul className="list-disc pl-8 space-y-3">{children}</ul></Zoomable>,
                                                li: ({node, children}) => <li className="pl-2 font-medium">{children}</li>,
                                                blockquote: ({node, children}) => <Zoomable label="Critical Synthesis" className="my-10"><blockquote className="border-l-8 border-indigo-500 pl-8 py-4 italic bg-slate-50 rounded-r-3xl text-xl font-medium text-slate-700">{children}</blockquote></Zoomable>
                                            }}
                                       >
                                            {synthesis}
                                       </ReactMarkdown>
                                   </article>
                               )}
                           </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
        <aside className={`flex-shrink-0 z-20 shadow-2xl relative order-1 bg-[#020617] transition-all duration-1000 ${isReasoning ? 'opacity-0 w-0' : 'w-96 lg:w-[560px] border-r border-slate-900'}`}>
            <NeuralMemoryPanel store={store} inferenceResults={inferenceResults} isReasoningMode={false} />
        </aside>

        <main className={`flex-1 overflow-y-auto relative z-10 bg-slate-50/50 order-2 transition-all duration-700 ${isReasoning ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
           <div className="max-w-7xl mx-auto px-10 py-20">
                {activeTab === 'reason' && (
                    <ClinicalObservation 
                        ontology={ontology} 
                        onAnalysisUpdate={setInferenceResults} 
                        onStartReasoning={handleStartReasoning}
                        isReasoningActive={isReasoning}
                    />
                )}
                {activeTab === 'learn' && <KnowledgeAcquisition />}
                {activeTab === 'clinic' && <ClinicianLearning concepts={ontology.temporary_memory} store={store} onResolved={() => { setOntology(getGrammar()); setStore(scrt_get_store()); }} />}
                {activeTab === 'memory' && (
                    <div className="grid md:grid-cols-2 gap-12 animate-in">
                        {store.nodes.map(n => (
                            <div key={n.node_id} className="bg-white p-12 rounded-[5rem] shadow-2xl border border-slate-100 hover:scale-[1.03] transition-all group relative overflow-hidden">
                                <span className="text-[11px] font-black text-indigo-600 uppercase bg-indigo-50 px-6 py-2 rounded-2xl border border-indigo-100 tracking-widest">{n.specialty}</span>
                                <h3 className="text-4xl font-black text-slate-800 mt-8 leading-tight tracking-tighter">{n.pathology}</h3>
                                <p className="text-sm text-slate-500 mt-6 italic line-clamp-3 leading-relaxed font-medium">{n.contexte?.definition}</p>
                            </div>
                        ))}
                    </div>
                )}
           </div>
        </main>
      </div>
    </div>
    </ZoomProvider>
  );
};

export default App;
