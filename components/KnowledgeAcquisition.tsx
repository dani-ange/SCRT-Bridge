
import React, { useState, useRef, useEffect } from 'react';
import { medgemma_autonomous_ingestion } from '../services/geminiService';
import { scrt_store_ingestion_result } from '../services/scrtService';
import { ExtractionResult } from '../types';
import { LivingNeuronCanvas } from './LivingNeuronCanvas';

type IngestionPhase = 'INPUT' | 'PROCESSING' | 'EXTRACTION' | 'SYNTHESIS' | 'COMPLETE';

export const KnowledgeAcquisition: React.FC = () => {
  const [text, setText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<IngestionPhase>('INPUT');
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [visibleConcepts, setVisibleConcepts] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Accept PDF and Images
      if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
        setSelectedFile(file);
        
        if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        } else {
            setPreviewUrl(null);
        }
      } else {
        alert("Only PDF files and Images (PNG, JPG, WEBP) are accepted.");
      }
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
    });
  };

  const handleIngest = async () => {
    if ((!text.trim() && !selectedFile)) return;
    if (runningRef.current) return;
    
    runningRef.current = true;
    setPhase('PROCESSING');
    setError(null);
    setVisibleConcepts([]);

    try {
      let fileData: { mimeType: string, data: string } | undefined = undefined;
      if (selectedFile) {
        const base64 = await fileToBase64(selectedFile);
        fileData = { mimeType: selectedFile.type, data: base64 };
      }

      const extractedData = await medgemma_autonomous_ingestion({
        text: text,
        file: fileData
      });

      setResult(extractedData);
      setPhase('EXTRACTION');

    } catch (e: any) {
      console.error(e);
      setError(e.message || "Ingestion Error");
      setPhase('INPUT');
    } finally {
        runningRef.current = false;
    }
  };

  useEffect(() => {
    if (phase === 'EXTRACTION' && result) {
      let idx = 0;
      const interval = setInterval(() => {
        if (idx >= (result.clinical_elements?.length || 0)) {
          clearInterval(interval);
          setTimeout(() => setPhase('SYNTHESIS'), 1500);
        } else {
          const nextElement = result.clinical_elements?.[idx];
          if (nextElement) {
             setVisibleConcepts(prev => [...prev, nextElement]);
          }
          idx++;
        }
      }, 300); 
      return () => clearInterval(interval);
    }
  }, [phase, result]);

  useEffect(() => {
    if (phase === 'SYNTHESIS' && result) {
      const timer = setTimeout(() => {
        scrt_store_ingestion_result(result);
        setPhase('COMPLETE');
      }, 4000); 
      return () => clearTimeout(timer);
    }
  }, [phase, result]);

  const resetIngestion = () => {
    setText('');
    setSelectedFile(null);
    setPreviewUrl(null);
    setResult(null);
    setVisibleConcepts([]);
    setPhase('INPUT');
  };

  const StepIndicator = ({ step, current, label, icon, subtext }: { step: IngestionPhase, current: IngestionPhase, label: string, icon: string, subtext: string }) => {
    const phases = ['INPUT', 'PROCESSING', 'EXTRACTION', 'SYNTHESIS', 'COMPLETE'];
    const idxStep = phases.indexOf(step);
    const idxCurrent = phases.indexOf(current);
    
    let status = 'pending';
    if (idxCurrent === idxStep) status = 'active';
    if (idxCurrent > idxStep) status = 'done';

    return (
        <div className="flex items-start gap-4 relative">
             {step !== 'COMPLETE' && (
                 <div className={`absolute left-5 top-10 bottom-[-20px] w-0.5 ${status === 'done' ? 'bg-indigo-500' : 'bg-white/10'}`}></div>
             )}
             <div className={`
                w-10 h-10 rounded-full flex items-center justify-center text-sm transition-all duration-500 z-10
                ${status === 'active' ? 'bg-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.6)] scale-110' : ''}
                ${status === 'done' ? 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]' : ''}
                ${status === 'pending' ? 'bg-white/5 text-white/20 border border-white/5' : ''}
             `}>
                {status === 'done' ? <i className="fas fa-check"></i> : <i className={`fas ${icon} ${status === 'active' ? 'animate-pulse' : ''}`}></i>}
             </div>
             <div className={`flex-1 pt-2 transition-all duration-500 ${status === 'active' ? 'opacity-100 translate-x-2' : 'opacity-40'}`}>
                <h4 className="font-black text-xs uppercase tracking-widest text-white">{label}</h4>
                <p className="text-[10px] text-white/50 font-medium mt-0.5">{subtext}</p>
                {status === 'active' && <div className="mt-2 h-1 bg-indigo-500/20 rounded-full overflow-hidden w-24"><div className="h-full bg-indigo-500 animate-shimmer w-full"></div></div>}
             </div>
        </div>
    );
  };

  return (
    <div className="h-[85vh] rounded-[3rem] overflow-hidden bg-slate-950 shadow-2xl border border-white/10 flex flex-col lg:flex-row relative">
        {/* Brain Panel */}
        <div className="relative flex-1 bg-slate-950 overflow-hidden border-r border-white/5">
            {/* Brain Container Aesthetics */}
            <div className="absolute inset-0 z-0">
               {/* Use Default Variant for network visualization */}
               <LivingNeuronCanvas phase={phase} pulseIndex={visibleConcepts.length} variant="default" />
               <div className="absolute inset-0 shadow-[inset_0_0_100px_rgba(0,0,0,0.8)] pointer-events-none"></div>
            </div>

            <div className="absolute top-8 left-8 z-10">
                 <div className="flex items-center gap-3 bg-slate-900/50 backdrop-blur px-4 py-2 rounded-full border border-white/5 shadow-lg">
                    <div className="relative">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                        <div className="absolute top-0 left-0 w-2 h-2 bg-emerald-500 rounded-full animate-ping opacity-50"></div>
                    </div>
                    <span className="text-white/70 text-[10px] font-black uppercase tracking-widest">Neural Embryogenesis</span>
                 </div>
            </div>

            {/* Floating Chip Container */}
            {phase === 'EXTRACTION' && (
                <div className="absolute bottom-0 left-0 right-0 p-8 z-20 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent">
                    <div className="flex flex-wrap gap-3 justify-center max-h-[200px] overflow-y-auto custom-scrollbar">
                        {visibleConcepts.map((c, i) => (
                            <div key={i} className="bg-indigo-600/90 backdrop-blur text-white px-4 py-2 rounded-xl border border-indigo-400/30 text-[10px] font-black uppercase tracking-widest animate-in shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:scale-105 transition-transform cursor-default">
                                {c.root_term}
                            </div>
                        ))}
                    </div>
                    <div className="text-center mt-4">
                        <span className="text-indigo-400 text-[10px] animate-pulse font-bold tracking-widest uppercase">Synaptic integration in progress...</span>
                    </div>
                </div>
            )}

            {phase === 'COMPLETE' && result && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                    <div className="text-center animate-in bg-slate-900/40 backdrop-blur-md p-10 rounded-[4rem] border border-white/10 shadow-2xl">
                        <div className="w-24 h-24 bg-emerald-500 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 shadow-[0_0_50px_rgba(16,185,129,0.4)]">
                            <i className="fas fa-brain text-white text-4xl"></i>
                        </div>
                        <h2 className="text-5xl font-black text-white mb-2 drop-shadow-2xl tracking-tighter">{result.pathology}</h2>
                        <div className="h-1 w-20 bg-emerald-500 mx-auto rounded-full my-4"></div>
                        <p className="text-emerald-400 font-black tracking-widest text-xs uppercase">Neural Structure Established</p>
                    </div>
                </div>
            )}
        </div>

        {/* Control Panel */}
        <div className="w-full lg:w-[480px] bg-slate-900 flex flex-col shadow-2xl z-20">
            <div className="p-10 border-b border-white/5">
                <div className="flex items-center gap-4 mb-2">
                    <i className="fas fa-project-diagram text-indigo-400 text-2xl"></i>
                    <h3 className="text-2xl font-black text-white">SCRT Acquisition</h3>
                </div>
                <p className="text-xs text-white/40 font-bold uppercase tracking-widest">Semantic Convolution Pipeline vNext</p>
            </div>

            <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar relative">
                <StepIndicator step="INPUT" current={phase} label="Signal Source" icon="fa-satellite-dish" subtext="Injecting raw clinical flux" />
                {phase === 'INPUT' && (
                    <div className="ml-14 mb-10 bg-white/5 p-6 rounded-[2rem] border border-white/5 animate-in">
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-white/10 rounded-2xl p-6 text-center cursor-pointer hover:border-indigo-500 hover:bg-white/5 transition-all mb-4 group relative overflow-hidden"
                        >
                            <input type="file" ref={fileInputRef} className="hidden" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={handleFileChange} />
                            
                            {selectedFile ? (
                                previewUrl ? (
                                    <div className="relative">
                                        <img src={previewUrl} alt="Preview" className="w-full h-32 object-cover rounded-xl mb-2 opacity-80 group-hover:opacity-100 transition-opacity" />
                                        <div className="text-emerald-400 text-xs font-black uppercase"><i className="fas fa-image mr-2"></i> {selectedFile.name}</div>
                                    </div>
                                ) : (
                                    <div className="text-emerald-400 text-xs font-black uppercase"><i className="fas fa-file-pdf mr-2"></i> {selectedFile.name}</div>
                                )
                            ) : (
                                <div>
                                    <i className="fas fa-cloud-upload-alt text-3xl text-white/20 mb-3 group-hover:text-indigo-400 transition-colors"></i>
                                    <div className="text-white/30 text-xs font-black uppercase group-hover:text-white transition-colors">Drop PDF or Image</div>
                                    <div className="text-[9px] text-white/20 mt-1">Supports X-rays, ECG, Handwritten Notes</div>
                                </div>
                            )}
                        </div>
                        <textarea 
                            className="w-full bg-slate-950 border border-white/10 rounded-2xl p-4 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none mb-4 custom-scrollbar"
                            rows={4}
                            placeholder="Enter clinical notes or description..."
                            value={text}
                            onChange={e => setText(e.target.value)}
                        />
                        <button 
                            onClick={handleIngest}
                            disabled={!text && !selectedFile}
                            className="w-full bg-indigo-600 text-white py-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-500 disabled:opacity-30 transition-all shadow-xl shadow-indigo-500/20"
                        >
                            Start Analysis
                        </button>
                    </div>
                )}

                <StepIndicator step="PROCESSING" current={phase} label="Neural Processing" icon="fa-microscope" subtext="Signal decomposition via LLM" />
                <StepIndicator step="EXTRACTION" current={phase} label="Semantic Genome" icon="fa-dna" subtext="Identification of atomic descriptors" />
                <StepIndicator step="SYNTHESIS" current={phase} label="Graph Convolution" icon="fa-network-wired" subtext="Indexing into reasoning structure" />
                <StepIndicator step="COMPLETE" current={phase} label="Permanent Memory" icon="fa-brain" subtext="Ready for clinical inference" />

                {phase === 'COMPLETE' && (
                     <div className="ml-14 animate-in">
                        <button 
                            onClick={resetIngestion}
                            className="bg-white/10 hover:bg-white/20 text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border border-white/5 w-full"
                        >
                            New Ingestion
                        </button>
                     </div>
                )}
            </div>
        </div>
    </div>
  );
};
