
import React, { useState } from 'react';
import { getEconomicScenario } from '../services/geminiService';
import { ModelType, SynthesisParameters, AssetClass } from '../types';

interface AIAssistantProps {
  onScenarioApplied: (params: SynthesisParameters) => void;
}

const PREDEFINED_SCENARIOS = [
  { name: 'Flash Crash', prompt: 'Sudden high-intensity negative jumps in equity market with extreme short-term volatility.' },
  { name: 'Stagflation', prompt: 'High inflation rate with negative GDP growth and high structural seasonality.' },
  { name: 'Carry Trade', prompt: 'FX currency pair where the domestic rate is 7% and foreign rate is 1%, leading to sustained currency appreciation.' },
  { name: 'Supply Shock', prompt: 'Commodity prices surging with massive seasonal spikes and high volatility.' },
];

const AIAssistant: React.FC<AIAssistantProps> = ({ onScenarioApplied }) => {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);

  const startCalibration = async (customPrompt?: string) => {
    const targetPrompt = customPrompt || prompt;
    if (!targetPrompt.trim()) return;

    setLoading(true);
    setError(null);
    setPreview(null);

    try {
      const result = await getEconomicScenario(targetPrompt);
      
      const synthParams: SynthesisParameters = {
        modelType: result.modelType as ModelType,
        assetClass: (result.assetClass as AssetClass) || AssetClass.EQUITY,
        initialValue: result.parameters.initialValue ?? 100,
        timeHorizon: 365,
        dt: 1/252,
        mu: result.parameters.mu ?? 0,
        sigma: result.parameters.sigma ?? 0.2,
        kappa: result.parameters.kappa ?? 2.0,
        theta: result.parameters.theta ?? 0.05,
        lambda: result.parameters.lambda ?? 0,
        jumpMu: result.parameters.jumpMu ?? 0,
        jumpSigma: result.parameters.jumpSigma ?? 0,
        seasonalAmplitude: result.parameters.seasonalAmplitude ?? 0,
        riskFreeRate: result.parameters.riskFreeRate ?? 0.03,
        domesticRate: result.parameters.domesticRate ?? 0,
        foreignRate: result.parameters.foreignRate ?? 0,
      };

      setPreview({
        params: synthParams,
        name: result.name,
        description: result.description,
        summary: [
          { label: 'Drift (μ)', value: `${((synthParams.mu || 0) * 100).toFixed(1)}%` },
          { label: 'Vol (σ)', value: `${((synthParams.sigma || 0) * 100).toFixed(1)}%` },
          { label: 'Seasonality', value: synthParams.seasonalAmplitude?.toFixed(1) || '0' }
        ]
      });
      
      if (!customPrompt) setPrompt("");
    } catch (err: any) {
      console.error(err);
      const is500 = err?.message?.toLowerCase().includes('500') || err?.message?.toLowerCase().includes('xhr');
      setError(is500 
        ? "The AI model is currently experiencing high demand (Proxy Error). Please click retry to reconnect." 
        : "The Quant model failed to calibrate. Please try a different scenario prompt.");
    } finally {
      setLoading(false);
    }
  };

  const applyScenario = () => {
    if (preview) {
      onScenarioApplied(preview.params);
      setPreview(null);
    }
  };

  return (
    <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
      <div className="mb-4">
        <h3 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-1 flex items-center gap-2">
          <div className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
          </div>
          Quant Scenario Strategist
        </h3>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
          Auto-configure model parameters via natural language.
        </p>
      </div>
      
      <div className="flex flex-wrap gap-1.5 mb-4">
        {PREDEFINED_SCENARIOS.map((s) => (
          <button
            key={s.name}
            disabled={loading}
            onClick={() => {
              setPrompt(s.prompt);
              startCalibration(s.prompt);
            }}
            className="px-2.5 py-1 text-[9px] font-bold text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 hover:border-indigo-400 border border-slate-200 dark:border-slate-700 rounded-md transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <div className="relative">
          <textarea
            rows={2}
            className="w-full p-3 text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all resize-none shadow-inner font-medium"
            placeholder="Describe a custom scenario..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <button
            onClick={() => startCalibration()}
            disabled={loading || !prompt.trim()}
            className="absolute bottom-2 right-2 p-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors shadow-md disabled:bg-slate-300"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          </button>
        </div>
        
        {loading && (
          <div className="flex items-center justify-center gap-2 py-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 animate-pulse">
            <div className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-tighter">AI Calibration in progress...</span>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg">
            <p className="text-[10px] text-red-600 dark:text-red-400 font-bold mb-2 leading-snug">{error}</p>
            <button 
              onClick={() => startCalibration()} 
              className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-widest text-red-700 dark:text-red-400 hover:text-red-800"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              Retry Calibration
            </button>
          </div>
        )}

        {preview && !loading && (
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-indigo-100 dark:border-indigo-900 shadow-xl shadow-indigo-100/50 dark:shadow-none animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h4 className="text-[10px] font-extrabold text-slate-900 dark:text-white uppercase tracking-tight">{preview.name}</h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 italic line-clamp-2 leading-tight">{preview.description}</p>
              </div>
              <div className="bg-indigo-50 dark:bg-indigo-900/50 px-2 py-0.5 rounded text-[8px] font-bold text-indigo-600 dark:text-indigo-400">PROPOSED</div>
            </div>
            
            <div className="grid grid-cols-3 gap-2 mb-4">
              {preview.summary.map((s: any) => (
                <div key={s.label} className="bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded text-center border border-slate-100 dark:border-slate-800">
                  <p className="text-[8px] text-slate-400 uppercase font-bold">{s.label}</p>
                  <p className="text-[10px] text-slate-900 dark:text-white font-mono font-bold">{s.value}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={applyScenario}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-extrabold shadow-lg shadow-indigo-200 dark:shadow-none transition-all"
              >
                Apply Scenario
              </button>
              <button
                onClick={() => setPreview(null)}
                className="px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-bold transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIAssistant;
