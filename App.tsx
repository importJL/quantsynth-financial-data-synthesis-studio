
import React, { useState, useCallback, useEffect } from 'react';
import Layout from './components/Layout';
import ModelControls from './components/ModelControls';
import AnalysisBoard from './components/AnalysisBoard';
import DataPreview from './components/DataPreview';
import AIAssistant from './components/AIAssistant';
import { ModelType, AssetClass, SynthesisParameters, SynthesisResult } from './types';
import { generateSynthesizedData } from './services/synthesisEngine';
import { getAnalysisInsights } from './services/geminiService';

const INITIAL_PARAMS: SynthesisParameters = {
  modelType: ModelType.EQUITY_GBM,
  assetClass: AssetClass.EQUITY,
  initialValue: 100,
  timeHorizon: 365,
  dt: 1 / 252,
  mu: 0.08,
  sigma: 0.20,
  kappa: 2.0,
  theta: 0.05,
  dividendYield: 0.02,
  correlations: {
    equity: 0.7,
    rates: -0.2,
    volatility: -0.5,
    commodity: 0.1
  }
};

const MAX_HISTORY = 50;

const App: React.FC = () => {
  // History State
  const [past, setPast] = useState<SynthesisParameters[]>([]);
  const [params, setParams] = useState<SynthesisParameters>(INITIAL_PARAMS);
  const [future, setFuture] = useState<SynthesisParameters[]>([]);

  const [result, setResult] = useState<SynthesisResult | null>(null);
  const [insights, setInsights] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
             (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark(!isDark);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    
    setFuture([params, ...future]);
    setParams(previous);
    setPast(newPast);
  }, [past, params, future]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);
    
    setPast([...past, params]);
    setParams(next);
    setFuture(newFuture);
  }, [future, params, past]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const handleParamChange = (newParams: Partial<SynthesisParameters>) => {
    // Check if anything actually changed to avoid redundant history steps
    const updated = { ...params, ...newParams };
    if (JSON.stringify(updated) === JSON.stringify(params)) return;

    setPast(prev => [...prev.slice(-(MAX_HISTORY - 1)), params]);
    setParams(updated);
    setFuture([]); // Clear redo history on new change
  };

  const generateData = useCallback(async (overridingParams?: SynthesisParameters) => {
    setIsGenerating(true);
    setInsights(null);
    
    const targetParams = overridingParams || params;

    setTimeout(async () => {
      try {
        const newResult = generateSynthesizedData(targetParams);
        setResult(newResult);
        
        // Fix: Explicitly type accumulator and handle unknown/undefined in correlation strength calculation to resolve TS errors
        const summaryStr = JSON.stringify({
          category: targetParams.assetClass,
          model: targetParams.modelType,
          mu: targetParams.mu,
          sigma: targetParams.sigma,
          finalValue: newResult.data[newResult.data.length - 1].value,
          vol: newResult.summary.vol,
          correlationStrength: Object.values(targetParams.correlations || {}).reduce((acc: number, val: any) => acc + Math.abs(val || 0), 0)
        });
        
        const aiText = await getAnalysisInsights(summaryStr);
        setInsights(aiText);
      } catch (err) {
        console.error("Synthesis error:", err);
      } finally {
        setIsGenerating(false);
      }
    }, 600);
  }, [params]);

  useEffect(() => {
    generateData();
  }, []);

  const handleScenarioApplied = (newParams: SynthesisParameters) => {
    setPast(prev => [...prev.slice(-(MAX_HISTORY - 1)), params]);
    setParams(newParams);
    setFuture([]);
    generateData(newParams);
  };

  const sidebarContent = (
    <>
      <ModelControls 
        params={params} 
        onParamChange={handleParamChange} 
        onGenerate={() => generateData()}
        isGenerating={isGenerating}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={undo}
        onRedo={redo}
      />
      <AIAssistant onScenarioApplied={handleScenarioApplied} />
    </>
  );

  return (
    <Layout sidebar={sidebarContent} isDark={isDark} onToggleTheme={toggleTheme}>
      <header className="mb-8">
        <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-2">
          Synthesis Studio
        </h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
          Multi-domain simulation studio. Synthesize realistic <span className="text-indigo-600 dark:text-indigo-400 font-semibold">Asset Prices</span>, 
          <span className="text-indigo-600 dark:text-indigo-400 font-semibold ml-1">Derivatives</span>, and 
          <span className="text-indigo-600 dark:text-indigo-400 font-semibold ml-1">Macroeconomic Factors</span> using structural quantitative models.
        </p>
      </header>

      {result ? (
        <div key={JSON.stringify(params)} className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <AnalysisBoard result={result} insights={insights} isDark={isDark} />
          <DataPreview data={result.data} title={`${params.assetClass.replace(/_/g, ' ')} Dataset Preview`} />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-32 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 transition-colors">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-slate-400 dark:text-slate-500 font-medium tracking-tight">Initializing quantitative engine...</p>
        </div>
      )}
      
      {isGenerating && result && (
        <div className="fixed bottom-8 right-8 bg-indigo-600 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-bounce z-50">
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-bold tracking-tight">Re-synthesizing Data...</span>
        </div>
      )}
    </Layout>
  );
};

export default App;
