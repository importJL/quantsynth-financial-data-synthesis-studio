
import React, { useState, useMemo, useEffect } from 'react';
import { ModelType, AssetClass, SynthesisParameters, CorrelationFactors } from '../types';

interface ModelControlsProps {
  params: SynthesisParameters;
  onParamChange: (newParams: Partial<SynthesisParameters>) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

interface ValidationErrors {
  [key: string]: string | null;
}

// Fixed standard market cross-correlations for context in the matrix
const MARKET_CROSS_CORRS = {
  equity_rates: 0.15,
  equity_vol: -0.72,
  equity_comm: 0.25,
  rates_vol: -0.10,
  rates_comm: 0.05,
  vol_comm: -0.15
};

const MODEL_INSIGHTS = {
  [ModelType.EQUITY_GBM]: {
    name: 'Geometric Brownian Motion',
    math: 'dS = μSdt + σSdW',
    category: 'Stochastic Growth',
    description: 'The industry standard for modeling asset prices. It assumes constant drift and volatility, ensuring prices remain strictly positive.',
    useCase: 'Equity prices, FX spot rates, and standard Black-Scholes implementations.',
    behavior: 'Lacks mean-reversion. Prices tend to drift indefinitely over long horizons.',
    deepDive: 'GBM is the cornerstone of the Black-Scholes-Merton framework. Its primary advantage is that the logarithm of the price follows a random walk with drift, meaning prices are log-normally distributed and cannot drop below zero. However, it fails to capture "volatility smiles" or mean-reverting tendencies found in rates and commodities.'
  },
  [ModelType.EQUITY_MERTON_JUMP]: {
    name: 'Merton Jump Diffusion',
    math: 'GBM + Poisson Jumps',
    category: 'Discontinuous Dynamics',
    description: 'Enhances GBM by adding discrete price "shocks." These jumps represent sudden market news or liquidity events.',
    useCase: 'Stress testing portfolios, modeling "Flash Crashes," or volatile tech stocks.',
    behavior: 'Produces "fat tails" (skewness) that realistic market returns exhibit.',
    deepDive: 'Standard GBM often underestimates the probability of extreme events. Merton Jump Diffusion introduces a Poisson process that creates discrete price gaps. This is essential for modeling assets sensitive to earnings surprises, biotech trial results, or systemic liquidity shocks where price movement is not continuous.'
  },
  [ModelType.INTEREST_RATE_VASICEK]: {
    name: 'Vasicek Model',
    math: 'dr = κ(θ - r)dt + σdW',
    category: 'Mean Reversion',
    description: 'A mean-reverting model where rates are pulled toward a long-term average (θ) at a specific speed (κ).',
    useCase: 'Short-term interest rates and central bank policy rates.',
    behavior: 'Mathematically allows rates to go negative (useful for recent Eurozone/Japan scenarios).',
    deepDive: 'Developed in 1977, this was the first model to capture mean reversion—the economic reality that interest rates do not wander off to infinity but are tethered to central bank targets. The speed of reversion (κ) defines how aggressively the market corrects deviations from the long-term mean (θ).'
  },
  [ModelType.INTEREST_RATE_CIR]: {
    name: 'Cox-Ingersoll-Ross (CIR)',
    math: 'dr = κ(θ - r)dt + σ√rdW',
    category: 'Mean Reversion (Square Root)',
    description: 'Similar to Vasicek but volatility scales with the square root of the rate, preventing negative values.',
    useCase: 'Modern interest rate modeling and credit spreads where positivity is required.',
    behavior: 'Volatility vanishes as the rate approaches zero, creating a natural floor.',
    deepDive: 'CIR improves upon Vasicek by introducing a state-dependent volatility term (√r). As rates drop toward zero, the random "noise" also decreases, making it mathematically impossible for rates to become negative under the Feller condition. This is the gold standard for modeling yields that must remain positive.'
  },
  [ModelType.OU_PROCESS]: {
    name: 'Ornstein-Uhlenbeck',
    math: 'dx = κ(θ - x)dt + σdW',
    category: 'Equilibrium Dynamics',
    description: 'The foundational mean-reverting process. It models any factor that naturally returns to a structural equilibrium.',
    useCase: 'Commodity prices, volatility indices (VIX), and macro indicators like unemployment.',
    behavior: 'Strictly mean-reverting. Higher κ values result in a more "pinned" process.',
    deepDive: 'The OU process is used to model stationary variables. Unlike GBM, which has no "memory" of its starting point, the OU process is "attracted" to its long-term mean. In finance, it is the go-to model for the VIX (volatility index) and pair-trading strategies where the spread is expected to revert to zero.'
  },
  [ModelType.MACRO_INFLATION]: {
    name: 'Macro Structural Model',
    math: 'Trend + Cycle + Shock',
    category: 'Hybrid Macro',
    description: 'A hybrid model designed to capture the structural trends of inflation and GDP.',
    useCase: 'Consumer Price Index (CPI), GDP growth paths, and productivity factors.',
    behavior: 'Sensitive to seasonal cycles and structural mean-reversion parameters.',
    deepDive: 'Macroeconomic variables often exhibit strong seasonality and long-term structural shifts. This model combines a deterministic seasonal amplitude (e.g., energy demand in winter) with a mean-reverting stochastic component to simulate realistic economic cycles rather than pure financial "price" action.'
  }
};

const Tooltip: React.FC<{ text: string }> = ({ text }) => (
  <div className="group relative inline-block ml-1 align-middle">
    <svg 
      className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 hover:text-indigo-500 cursor-help transition-colors" 
      fill="currentColor" 
      viewBox="0 0 20 20"
    >
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2.5 bg-slate-900 dark:bg-slate-800 text-white text-[11px] leading-relaxed rounded-lg shadow-2xl invisible group-hover:visible z-50 pointer-events-none transition-all opacity-0 group-hover:opacity-100 transform translate-y-1 group-hover:translate-y-0">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-slate-900 dark:border-t-slate-800"></div>
    </div>
  </div>
);

const CorrelationMatrix: React.FC<{ correlations: CorrelationFactors }> = ({ correlations }) => {
  const factors = [
    { id: 'asset', label: 'ASSET', name: 'Primary Asset' },
    { id: 'equity', label: 'EQ', name: 'Equity Index' },
    { id: 'rates', label: 'IR', name: 'Treasury Rates' },
    { id: 'volatility', label: 'VOL', name: 'Volatility (VIX)' },
    { id: 'commodity', label: 'COM', name: 'Commodity Basket' }
  ];

  const getCorrelationValue = (rowId: string, colId: string): number => {
    if (rowId === colId) return 1.0;
    
    // Primary Asset relationships (from state)
    if (rowId === 'asset' || colId === 'asset') {
      const otherId = rowId === 'asset' ? colId : rowId;
      return (correlations as any)[otherId] ?? 0;
    }

    // Standard market factor relationships
    const key = [rowId, colId].sort().join('_');
    return (MARKET_CROSS_CORRS as any)[key] ?? 0;
  };

  const getColor = (val: number) => {
    if (val === 1.0) return 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 opacity-40';
    if (val === 0) return 'bg-slate-50 dark:bg-slate-800 text-slate-400';
    
    const absVal = Math.abs(val);
    const opacity = Math.round(absVal * 10) * 10; // Scale to 10-100
    
    if (val > 0) {
      return `bg-indigo-600/${opacity || 10} text-indigo-700 dark:text-indigo-300`;
    } else {
      return `bg-rose-600/${opacity || 10} text-rose-700 dark:text-rose-300`;
    }
  };

  return (
    <div className="flex flex-col gap-2 mb-6 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 shadow-inner overflow-hidden">
      <div className="flex justify-between items-center mb-3">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Cross-Factor Risk Matrix</span>
        <div className="flex gap-2 text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
           <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-rose-500/40"></div> Negative</span>
           <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-indigo-500/40"></div> Positive</span>
        </div>
      </div>
      
      <div className="grid grid-cols-6 gap-1">
        {/* Empty top-left cell */}
        <div className="h-8"></div>
        {/* Column Headers */}
        {factors.map(f => (
          <div key={`col-${f.id}`} className="h-8 flex items-center justify-center text-[8px] font-extrabold text-slate-400 dark:text-slate-600 uppercase tracking-tighter rotate-[-45deg] origin-bottom-left ml-2">
            {f.label}
          </div>
        ))}

        {/* Rows */}
        {factors.map(row => (
          <React.Fragment key={`row-${row.id}`}>
            {/* Row Header */}
            <div className="h-10 flex items-center justify-end pr-2 text-[8px] font-extrabold text-slate-400 dark:text-slate-600 uppercase">
              {row.label}
            </div>
            {/* Cells */}
            {factors.map(col => {
              const val = getCorrelationValue(row.id, col.id);
              const isEditable = (row.id === 'asset' || col.id === 'asset') && row.id !== col.id;
              
              return (
                <div 
                  key={`${row.id}-${col.id}`}
                  className={`h-10 flex flex-col items-center justify-center rounded-lg border border-slate-200/50 dark:border-slate-700/50 transition-all group relative cursor-default ${getColor(val)} ${isEditable ? 'ring-1 ring-indigo-500/20' : ''}`}
                >
                  <span className="text-[9px] font-mono font-bold leading-none">
                    {val === 1.0 ? '1.0' : val.toFixed(1)}
                  </span>
                  
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 pointer-events-none">
                     <div className="bg-slate-900 text-white text-[9px] px-2 py-1.5 rounded-lg shadow-2xl border border-slate-700 whitespace-nowrap">
                        <span className="text-slate-400">{row.name}</span>
                        <span className="mx-1">×</span>
                        <span className="text-slate-400">{col.name}</span>
                        <div className="font-bold text-indigo-400 mt-0.5">Correlation: {val.toFixed(2)}</div>
                     </div>
                  </div>
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

const ModelControls: React.FC<ModelControlsProps> = ({ 
  params, 
  onParamChange, 
  onGenerate, 
  isGenerating,
  canUndo,
  canRedo,
  onUndo,
  onRedo
}) => {
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});

  const inputClass = (field: string) => `w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border ${errors[field] ? 'border-rose-500 focus:ring-rose-500' : 'border-slate-200 dark:border-slate-700 focus:ring-indigo-500'} rounded-md text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:border-transparent transition-all`;
  const labelClass = "inline-block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider";

  const isDerivative = [AssetClass.OPTION, AssetClass.FORWARD, AssetClass.FUTURE, AssetClass.SWAP, AssetClass.SWAPTION].includes(params.assetClass);
  const isOption = params.assetClass === AssetClass.OPTION;
  const isSwaption = params.assetClass === AssetClass.SWAPTION;
  const isMacro = [AssetClass.CENTRAL_BANK_RATE, AssetClass.INFLATION_RATE, AssetClass.UNEMPLOYMENT_RATE, AssetClass.TOTAL_PRODUCTIVITY, AssetClass.GDP_GROWTH].includes(params.assetClass);
  const isFixedIncome = params.assetClass === AssetClass.FIXED_INCOME;
  const isCommodity = params.assetClass === AssetClass.COMMODITY;
  const isEquity = params.assetClass === AssetClass.EQUITY;
  const isFX = params.assetClass === AssetClass.FX;

  const currentModelInfo = MODEL_INSIGHTS[params.modelType] || MODEL_INSIGHTS[ModelType.EQUITY_GBM];

  const handleCorrelationChange = (factor: keyof CorrelationFactors, val: string) => {
    const numericVal = parseFloat(val);
    const newCorrs = { ...params.correlations, [factor]: numericVal };
    onParamChange({ correlations: newCorrs });
  };

  const isMeanReverting = [
    ModelType.INTEREST_RATE_VASICEK, 
    ModelType.INTEREST_RATE_CIR, 
    ModelType.OU_PROCESS, 
    ModelType.MACRO_INFLATION
  ].includes(params.modelType);

  const isMertonJump = params.modelType === ModelType.EQUITY_MERTON_JUMP;

  // Validation Logic
  useEffect(() => {
    const newErrors: ValidationErrors = {};

    if (params.initialValue <= 0) newErrors.initialValue = "Must be > 0";
    if (params.sigma < 0 || params.sigma > 1.5) newErrors.sigma = "Range: 0 - 1.5";
    if (params.mu !== undefined && (params.mu < -1 || params.mu > 1)) newErrors.mu = "Range: -1 - 1";
    if (params.timeHorizon < 1 || params.timeHorizon > 5000) newErrors.timeHorizon = "Range: 1 - 5000";
    if (isMeanReverting) {
      if (params.kappa !== undefined && (params.kappa < 0 || params.kappa > 50)) newErrors.kappa = "Range: 0 - 50";
      if (params.theta !== undefined && (params.theta < -1 || params.theta > 1000)) newErrors.theta = "Unstable value";
    }
    if (isDerivative || isOption || isSwaption) {
      if (params.strikePrice !== undefined && params.strikePrice <= 0) newErrors.strikePrice = "Must be > 0";
      if (params.expiryTime !== undefined && (params.expiryTime < 0.01 || params.expiryTime > 20)) newErrors.expiryTime = "Range: 0.01 - 20";
      if (params.impliedVol !== undefined && (params.impliedVol < 0 || params.impliedVol > 2.0)) newErrors.impliedVol = "Range: 0 - 2.0";
      if (params.riskFreeRate !== undefined && (params.riskFreeRate < -0.2 || params.riskFreeRate > 0.3)) newErrors.riskFreeRate = "Range: -20% to 30%";
    }

    setErrors(newErrors);
  }, [params, isMeanReverting]);

  const hasErrors = Object.values(errors).some(e => e !== null && e !== undefined);

  const ErrorMsg: React.FC<{ field: string }> = ({ field }) => (
    errors[field] ? <span className="text-[10px] font-bold text-rose-500 mt-0.5 block animate-in fade-in duration-200">{errors[field]}</span> : null
  );

  return (
    <div className="p-6 space-y-6">
      {/* Model Library Modal */}
      {isLibraryOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[85vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Quantitative Model Library</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Technical specifications and mathematical foundations of QuantSynth processes.</p>
              </div>
              <button 
                onClick={() => setIsLibraryOpen(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Object.entries(MODEL_INSIGHTS).map(([key, info]) => (
                  <div key={key} className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 hover:border-indigo-500/30 transition-all">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.15em] bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded">{info.category}</span>
                      <code className="text-[10px] font-mono text-slate-400">{info.math}</code>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">{info.name}</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-4">{info.deepDive}</p>
                    <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                      <div className="flex items-start gap-2">
                        <span className="text-[9px] font-bold text-slate-500 uppercase mt-0.5">Key Use Case:</span>
                        <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">{info.useCase}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-[9px] font-bold text-slate-500 uppercase mt-0.5">Limitations:</span>
                        <span className="text-xs text-slate-700 dark:text-slate-300 font-medium italic">{info.behavior}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-8 py-4 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 text-center">
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">© 2025 QuantSynth Proprietary Stochastic Framework</p>
            </div>
          </div>
        </div>
      )}

      {/* History Toolbar */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Configuration</h4>
        <div className="flex gap-1">
          <button 
            onClick={onUndo} 
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="p-1.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
          </button>
          <button 
            onClick={onRedo} 
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className="p-1.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
          </button>
        </div>
      </div>

      {/* Category Selector */}
      <div>
        <label className={labelClass}>Synthesis Category</label>
        <Tooltip text="Select the financial domain. Each domain has unique risk sensitivities (Greeks) and drift modifiers." />
        <select 
          className={inputClass('assetClass')}
          value={params.assetClass}
          onChange={(e) => onParamChange({ assetClass: e.target.value as AssetClass })}
        >
          <optgroup label="Financial Assets" className="bg-white dark:bg-slate-800">
            <option value={AssetClass.EQUITY}>Equity</option>
            <option value={AssetClass.FIXED_INCOME}>Fixed Income (Bonds)</option>
            <option value={AssetClass.FX}>FX (Currencies)</option>
            <option value={AssetClass.COMMODITY}>Commodity</option>
          </optgroup>
          <optgroup label="Derivatives" className="bg-white dark:bg-slate-800">
            <option value={AssetClass.OPTION}>Option</option>
            <option value={AssetClass.FORWARD}>Forward</option>
            <option value={AssetClass.FUTURE}>Future</option>
            <option value={AssetClass.SWAP}>Interest Rate Swap</option>
            <option value={AssetClass.SWAPTION}>Swaption</option>
          </optgroup>
          <optgroup label="Economic Factors" className="bg-white dark:bg-slate-800">
            <option value={AssetClass.CENTRAL_BANK_RATE}>Central Bank Rate</option>
            <option value={AssetClass.INFLATION_RATE}>Inflation Rate</option>
            <option value={AssetClass.UNEMPLOYMENT_RATE}>Unemployment Rate</option>
            <option value={AssetClass.TOTAL_PRODUCTIVITY}>Total Factor Productivity</option>
            <option value={AssetClass.GDP_GROWTH}>GDP Growth Rate</option>
          </optgroup>
        </select>
      </div>

      {/* Model Selector with Info Card */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center">
            <label className={labelClass}>Stochastic Model</label>
            <button 
              onClick={() => setIsLibraryOpen(true)}
              className="ml-2 mb-1 p-0.5 rounded bg-slate-100 dark:bg-slate-800 text-indigo-500 hover:text-indigo-600 transition-colors"
              title="Open Model Library"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </button>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[9px] font-bold text-slate-500">
            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>
            AUTO-CALIBRATED
          </div>
        </div>
        <select 
          className={inputClass('modelType')}
          value={params.modelType}
          onChange={(e) => onParamChange({ modelType: e.target.value as ModelType })}
        >
          <option value={ModelType.EQUITY_GBM}>GBM (Growth-Focused)</option>
          <option value={ModelType.EQUITY_MERTON_JUMP}>Merton (Shock-Focused)</option>
          <option value={ModelType.OU_PROCESS}>OU (Mean-Reverting)</option>
          <option value={ModelType.INTEREST_RATE_VASICEK}>Vasicek (Linear Rate)</option>
          <option value={ModelType.INTEREST_RATE_CIR}>CIR (Positivity Rate)</option>
          <option value={ModelType.MACRO_INFLATION}>Macro (Structural)</option>
        </select>

        {/* Dynamic Model Insight Card */}
        <div className="mt-3 p-3 bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100/50 dark:border-indigo-800/30 rounded-lg animate-in fade-in slide-in-from-top-1 duration-300">
          <div className="flex items-center justify-between mb-2">
            <h5 className="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-tight">{currentModelInfo.name}</h5>
            <span className="text-[9px] font-mono text-slate-400 bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded shadow-sm">{currentModelInfo.math}</span>
          </div>
          <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed mb-2">{currentModelInfo.description}</p>
          <div className="space-y-1.5 border-t border-indigo-100/50 dark:border-indigo-800/20 pt-2">
             <div className="flex items-start gap-1.5">
               <span className="text-[8px] font-bold text-indigo-500 uppercase mt-0.5">UseCase:</span>
               <span className="text-[9px] text-slate-500 dark:text-slate-400 italic leading-tight">{currentModelInfo.useCase}</span>
             </div>
             <div className="flex items-start gap-1.5">
               <span className="text-[8px] font-bold text-slate-500 uppercase mt-0.5">Behavior:</span>
               <span className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight">{currentModelInfo.behavior}</span>
             </div>
          </div>
        </div>
      </div>

      {/* 2D Correlation Matrix Heatmap Section */}
      <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <label className={labelClass}>Cross-Factor Correlation Matrix</label>
          <Tooltip text="Visualize the relationship between the primary asset and market factors. Diagonals represent perfect self-correlation (1.0)." />
        </div>
        
        {/* Heatmap Visualizer */}
        <CorrelationMatrix correlations={params.correlations || {}} />

        <div className="grid grid-cols-2 gap-3">
          {[
            { id: 'equity', label: 'Equity Index', icon: '📈' },
            { id: 'rates', label: 'Treasury Rates', icon: '🏦' },
            { id: 'volatility', label: 'Volatility (VIX)', icon: '📉' },
            { id: 'commodity', label: 'Commodity Basket', icon: '⛽' }
          ].map((factor) => {
            const val = (params.correlations as any)?.[factor.id] ?? 0;
            return (
              <div key={factor.id} className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm overflow-hidden">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs">{factor.icon}</span>
                  <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tighter">{factor.label}</span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex-1 min-w-0">
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.05"
                      className={`w-full h-1 rounded-lg appearance-none cursor-pointer accent-indigo-600`}
                      style={{
                        background: val > 0 ? 'linear-gradient(to right, #d1fae5, #a7f3d0)' :
                                  val < 0 ? 'linear-gradient(to right, #fee2e2, #fecaca)' :
                                  'linear-gradient(to right, #f1f5f9, #e2e8f0)'
                      }}
                      value={val}
                      onChange={(e) => handleCorrelationChange(factor.id as keyof CorrelationFactors, e.target.value)}
                    />
                  </div>
                  <span className={`text-[10px] font-mono w-8 text-right font-bold ${val > 0 ? 'text-indigo-600 dark:text-indigo-400' : val < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
                    {val > 0 ? '+' : ''}{val.toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Domain Specific Factors UI */}
      {(isFixedIncome || isCommodity || isMacro || isOption || isSwaption || isDerivative || isEquity || isFX) && (
        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
            {isMacro ? 'Macro Specifics' : 'Domain Specifics'}
          </h4>
          
          {isFixedIncome && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Base Rate (%)</label>
                  <input type="number" step="0.001" className={inputClass('riskFreeRate')} value={params.riskFreeRate || 0.03} onChange={(e) => onParamChange({ riskFreeRate: parseFloat(e.target.value) })} />
                  <ErrorMsg field="riskFreeRate" />
                </div>
                <div>
                  <label className={labelClass}>Credit Spread</label>
                  <input type="number" step="0.0001" className={inputClass('creditSpread')} value={params.creditSpread || 0.01} onChange={(e) => onParamChange({ creditSpread: parseFloat(e.target.value) })} />
                </div>
              </div>
              <div>
                <label className={labelClass}>CDS Spread (Basis Pts)</label>
                <Tooltip text="Directly impacts the synthesized yield path and credit-risk component." />
                <input type="number" step="0.0001" className={inputClass('cdsSpread')} value={params.cdsSpread || 0} onChange={(e) => onParamChange({ cdsSpread: parseFloat(e.target.value) })} />
              </div>
            </div>
          )}

          {isFX && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Domestic Rate (%)</label>
                <Tooltip text="Interest rate of the domestic currency (r_d). Drives the upward component of interest rate parity." />
                <input 
                  type="number" 
                  step="0.01" 
                  className={inputClass('domesticRate')} 
                  value={((params.domesticRate || 0) * 100).toFixed(2)} 
                  onChange={(e) => onParamChange({ domesticRate: parseFloat(e.target.value) / 100 })} 
                />
              </div>
              <div>
                <label className={labelClass}>Foreign Rate (%)</label>
                <Tooltip text="Interest rate of the foreign currency (r_f). Drives the downward component of interest rate parity." />
                <input 
                  type="number" 
                  step="0.01" 
                  className={inputClass('foreignRate')} 
                  value={((params.foreignRate || 0) * 100).toFixed(2)} 
                  onChange={(e) => onParamChange({ foreignRate: parseFloat(e.target.value) / 100 })} 
                />
              </div>
            </div>
          )}

          {isCommodity && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Conv. Yield</label>
                <input type="number" step="0.001" className={inputClass('convenienceYield')} value={params.convenienceYield || 0} onChange={(e) => onParamChange({ convenienceYield: parseFloat(e.target.value) })} />
              </div>
              <div>
                <label className={labelClass}>Storage Cost</label>
                <input type="number" step="0.001" className={inputClass('storageCost')} value={params.storageCost || 0} onChange={(e) => onParamChange({ storageCost: parseFloat(e.target.value) })} />
              </div>
            </div>
          )}

          {(isCommodity || isMacro) && (
            <div>
              <label className={labelClass}>Seasonal Amplitude</label>
              <Tooltip text="Models cyclic oscillations (e.g., quarterly GDP or heating demand)." />
              <input type="range" min="0" max="50" step="0.1" className="w-full accent-indigo-600 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer mt-1" value={params.seasonalAmplitude || 0} onChange={(e) => onParamChange({ seasonalAmplitude: parseFloat(e.target.value) })} />
            </div>
          )}

          {(isOption || isSwaption) && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Strike {isSwaption ? 'Rate' : 'Price'}</label>
                    <input type="number" step={isSwaption ? "0.001" : "1"} className={inputClass('strikePrice')} value={params.strikePrice || 100} onChange={(e) => onParamChange({ strikePrice: parseFloat(e.target.value) })} />
                    <ErrorMsg field="strikePrice" />
                  </div>
                  <div>
                    <label className={labelClass}>Type</label>
                    <select className={inputClass('isCall')} value={params.isCall ? "call" : "put"} onChange={(e) => onParamChange({ isCall: e.target.value === "call" })}>
                      <option value="call">{isSwaption ? 'Payer' : 'Call'}</option>
                      <option value="put">{isSwaption ? 'Receiver' : 'Put'}</option>
                    </select>
                  </div>
              </div>
              <div>
                  <label className={labelClass}>Implied Volatility (σ_IV)</label>
                  <Tooltip text="The volatility input for Black-Scholes pricing. Directly drives VEGA risk." />
                  <input type="number" step="0.01" className={inputClass('impliedVol')} value={params.impliedVol || params.sigma} onChange={(e) => onParamChange({ impliedVol: parseFloat(e.target.value) })} />
                  <ErrorMsg field="impliedVol" />
              </div>
              <div>
                  <label className={labelClass}>Expiry (Years)</label>
                  <Tooltip text="Time to maturity. Drives THETA decay and RHO sensitivity." />
                  <input type="number" step="0.1" className={inputClass('expiryTime')} value={params.expiryTime || 1.0} onChange={(e) => onParamChange({ expiryTime: parseFloat(e.target.value) })} />
                  <ErrorMsg field="expiryTime" />
              </div>
            </div>
          )}

          {isDerivative && (
            <div>
              <label className={labelClass}>Risk-Free Rate (r)</label>
              <Tooltip text="Used in discounting and for RHO calculation." />
              <input type="number" step="0.001" className={inputClass('riskFreeRate')} value={params.riskFreeRate || 0.03} onChange={(e) => onParamChange({ riskFreeRate: parseFloat(e.target.value) })} />
              <ErrorMsg field="riskFreeRate" />
            </div>
          )}

          {isEquity && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Dividend Yield (%)</label>
                  <input type="number" step="0.01" className={inputClass('dividendYield')} value={((params.dividendYield || 0) * 100).toFixed(2)} onChange={(e) => onParamChange({ dividendYield: parseFloat(e.target.value) / 100 })} />
                </div>
                <div>
                  <label className={labelClass}>P/E Ratio</label>
                  <Tooltip text="Price-to-Earnings multiple. Fundamental valuation anchor." />
                  <input type="number" step="0.1" className={inputClass('peRatio')} value={params.peRatio || 15} onChange={(e) => onParamChange({ peRatio: parseFloat(e.target.value) })} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Forward EPS ($)</label>
                <Tooltip text="Expected Earnings Per Share. Directly influences the fundamental valuation component." />
                <input type="number" step="0.01" className={inputClass('expectedEarnings')} value={params.expectedEarnings || 5.0} onChange={(e) => onParamChange({ expectedEarnings: parseFloat(e.target.value) })} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dynamic Model Dynamics Section */}
      <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
        <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Model Dynamics</h4>
        
        {/* Core GBM / Brownian Dynamics */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Initial Value</label>
            <input type="number" className={inputClass('initialValue')} value={params.initialValue} onChange={(e) => onParamChange({ initialValue: parseFloat(e.target.value) })} />
            <ErrorMsg field="initialValue" />
          </div>
          <div>
            <label className={labelClass}>Realized σ</label>
            <Tooltip text="The physical volatility used to generate the asset price path." />
            <input type="number" step="0.01" className={inputClass('sigma')} value={params.sigma} onChange={(e) => onParamChange({ sigma: parseFloat(e.target.value) })} />
            <ErrorMsg field="sigma" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Annual Drift (μ)</label>
            <Tooltip text={isFX ? 'Additional speculative drift beyond the interest rate differential.' : 'The expected rate of return. Drives the underlying DELTA over time.'} />
            <input type="number" step="0.01" className={inputClass('mu')} value={params.mu} onChange={(e) => onParamChange({ mu: parseFloat(e.target.value) })} />
            <ErrorMsg field="mu" />
          </div>
          <div>
             <label className={labelClass}>Horizon (Days)</label>
             <Tooltip text="Simulation path length in trading days." />
             <input type="number" step="1" className={inputClass('timeHorizon')} value={params.timeHorizon} onChange={(e) => onParamChange({ timeHorizon: parseInt(e.target.value) })} />
             <ErrorMsg field="timeHorizon" />
          </div>
        </div>

        <div>
           <label className={labelClass}>Drift (μ) Visual Check</label>
           <div className="flex items-center gap-3">
            <input type="range" min="-0.5" max="0.5" step="0.01" className="flex-1 accent-indigo-600 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer" value={params.mu} onChange={(e) => onParamChange({ mu: parseFloat(e.target.value) })} />
            <span className="text-[10px] font-mono text-slate-500 w-8">{(params.mu! * 100).toFixed(0)}%</span>
          </div>
        </div>
        
        {/* Mean Reversion κ & θ */}
        {isMeanReverting && (
          <div className="space-y-4 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800 animate-in fade-in slide-in-from-top-1">
             <h5 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Reversion Parameters</h5>
             <div>
                <label className={labelClass}>Reversion Speed (κ)</label>
                <Tooltip text="How quickly the path returns to the long-term average (θ)." />
                <input type="number" step="0.1" className={inputClass('kappa')} value={params.kappa} onChange={(e) => onParamChange({ kappa: parseFloat(e.target.value) })} />
                <ErrorMsg field="kappa" />
             </div>
             <div>
                <label className={labelClass}>Long-Term Mean (θ)</label>
                <Tooltip text="The structural equilibrium level the model targets." />
                <input type="number" step="0.001" className={inputClass('theta')} value={params.theta} onChange={(e) => onParamChange({ theta: parseFloat(e.target.value) })} />
                <ErrorMsg field="theta" />
             </div>
          </div>
        )}

        {/* Jump Diffusion λ, μ_j, σ_j */}
        {isMertonJump && (
          <div className="space-y-4 p-3 bg-indigo-50/30 dark:bg-indigo-900/10 rounded-lg border border-indigo-100 dark:border-indigo-800 animate-in fade-in slide-in-from-top-1">
             <h5 className="text-[9px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest">Jump Diffusion Parameters</h5>
             <div>
                <label className={labelClass}>Jump Intensity (λ)</label>
                <Tooltip text="Expected number of jumps per year. A Poisson intensity factor." />
                <input type="number" step="0.5" className={inputClass('lambda')} value={params.lambda || 0} onChange={(e) => onParamChange({ lambda: parseFloat(e.target.value) })} />
             </div>
             <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Jump Mean (μ_j)</label>
                  <Tooltip text="The mean log-size of each jump." />
                  <input type="number" step="0.01" className={inputClass('jumpMu')} value={params.jumpMu || 0} onChange={(e) => onParamChange({ jumpMu: parseFloat(e.target.value) })} />
                </div>
                <div>
                  <label className={labelClass}>Jump Vol (σ_j)</label>
                  <Tooltip text="The standard deviation of log-size of each jump." />
                  <input type="number" step="0.01" className={inputClass('jumpSigma')} value={params.jumpSigma || 0} onChange={(e) => onParamChange({ jumpSigma: parseFloat(e.target.value) })} />
                </div>
             </div>
          </div>
        )}
      </div>

      <button
        onClick={onGenerate}
        disabled={isGenerating || hasErrors}
        className={`w-full py-3 rounded-lg font-bold shadow-lg transition-all flex items-center justify-center gap-2 active:scale-[0.98] ${hasErrors ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 dark:shadow-none'}`}
      >
        {isGenerating ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Re-Synthesizing...</span>
          </>
        ) : (
          hasErrors ? "Resolve Parameter Errors" : "Update Synthesis"
        )}
      </button>
      
      {hasErrors && (
        <p className="text-[10px] text-rose-500 font-bold text-center uppercase tracking-tight">
          Warning: Simulation path is mathematically unstable
        </p>
      )}
    </div>
  );
};

export default ModelControls;
