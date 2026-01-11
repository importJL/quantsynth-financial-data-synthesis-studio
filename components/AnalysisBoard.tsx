
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush, LineChart, Line, Legend } from 'recharts';
import { SynthesisResult, AssetClass } from '../types';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import './AnalysisBoard.css';

interface AnalysisBoardProps {
  result: SynthesisResult;
  insights: string | null;
  isDark: boolean;
}

const GREEKS_INFO = {
  delta: {
    label: 'Delta (Δ)',
    color: '#10b981',
    meaning: 'Directional Risk',
    explanation: 'Measures the rate of change of the option price relative to a $1 change in the underlying asset.',
    impact: 'High Delta = Strong directional sensitivity.'
  },
  gamma: {
    label: 'Gamma (Γ)',
    color: '#f59e0b',
    meaning: 'Convexity',
    explanation: 'The rate of change in Delta. High Gamma means price moves accelerate rapidly.',
    impact: 'Crucial for tail-risk and rapid hedging needs.'
  },
  vega: {
    label: 'Vega (ν)',
    color: '#6366f1',
    meaning: 'Volatility Sensitivity',
    explanation: 'The change in value for a 1% change in Implied Volatility.',
    impact: 'Profits from rising fear/uncertainty.'
  },
  theta: {
    label: 'Theta (θ)',
    color: '#ec4899',
    meaning: 'Time Decay',
    explanation: 'The rate at which an option loses value as time passes. Usually negative.',
    impact: 'The "cost of carry" for long positions.'
  },
  rho: {
    label: 'Rho (ρ)',
    color: '#8b5cf6',
    meaning: 'Rate Sensitivity',
    explanation: 'The sensitivity of the price to changes in interest rates.',
    impact: 'Significant for long-dated contracts.'
  }
};

const STRESS_PRESETS = [
  { id: 'normal', label: 'Flat', values: { asset: 0, vol: 0, time: 0, rates: 0 } },
  { id: 'black_monday', label: 'Market Crash', values: { asset: -20, vol: 50, time: 1, rates: -5 } },
  { id: 'bull_run', label: 'Bull Run', values: { asset: 15, vol: -10, time: 5, rates: 2 } },
  { id: 'time_decay', label: 'Last Week', values: { asset: 0, vol: 0, time: 7, rates: 0 } },
];

const AnalysisBoard: React.FC<AnalysisBoardProps> = ({ result, insights, isDark }) => {
  const { data, summary, parameters } = result;
  const boardRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const [range, setRange] = useState({ start: 0, end: data.length - 1 });
  const [selectedGreek, setSelectedGreek] = useState<string>('all');
  const [showBenchmark, setShowBenchmark] = useState<boolean>(true);

  // Stress Test State
  const [shockType, setShockType] = useState<'asset' | 'vol' | 'time' | 'rates'>('asset');
  const [shockMagnitude, setShockMagnitude] = useState<number>(0);

  useEffect(() => {
    setRange({ start: 0, end: data.length - 1 });
  }, [data]);

  const effectiveRho = useMemo(() => {
    const corrs = parameters.correlations || {};
    return Object.values(corrs).reduce((acc: number, val: any) => acc + (val || 0), 0);
  }, [parameters.correlations]);

  const chartData = useMemo(() => {
    return data.map(d => ({
      ...d,
      delta: d.greeks?.delta,
      gamma: d.greeks?.gamma,
      vega: d.greeks?.vega,
      theta: d.greeks?.theta,
      rho: d.greeks?.rho
    }));
  }, [data]);

  const isZoomed = range.start !== 0 || range.end !== data.length - 1;

  const handleBrushChange = (obj: any) => {
    if (obj && typeof obj.startIndex === 'number' && typeof obj.endIndex === 'number') {
      setRange({ start: obj.startIndex, end: obj.endIndex });
    }
  };

  const resetZoom = () => {
    setRange({ start: 0, end: data.length - 1 });
  };

  const exportChartAsImage = async () => {
    if (!chartRef.current) return;
    try {
      const dataUrl = await toPng(chartRef.current, { 
        backgroundColor: isDark ? '#0f172a' : '#ffffff', 
        cacheBust: true,
        style: { borderRadius: '12px' }
      });
      const link = document.createElement('a');
      link.download = `quantsynth-chart-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Could not export chart image', err);
    }
  };

  const exportFullReportPDF = async () => {
    if (!boardRef.current) return;
    try {
      const dataUrl = await toPng(boardRef.current, { 
        backgroundColor: isDark ? '#0f172a' : '#ffffff', 
        cacheBust: true,
        pixelRatio: 2,
        style: { padding: '20px' }
      });
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`quantsynth-report-${Date.now()}.pdf`);
    } catch (err) {
      console.error('Could not export PDF report', err);
    }
  };

  const latestPoint = data[data.length - 1];
  const hasGreeks = [AssetClass.OPTION, AssetClass.SWAPTION].includes(parameters.assetClass);

  // Shock Calculation Logic
  const shockImpact = useMemo(() => {
    if (!hasGreeks || !latestPoint.greeks) return { pnl: 0, newPrice: latestPoint.value, percent: 0 };
    
    const { delta = 0, gamma = 0, vega = 0, theta = 0, rho = 0 } = latestPoint.greeks;
    // Use the actual underlying spot at the end of the simulation
    const underlyingSpot = latestPoint.underlyingValue || parameters.initialValue;
    let pnl = 0;

    switch (shockType) {
      case 'asset':
        const dS = underlyingSpot * (shockMagnitude / 100);
        // Taylor series second-order approximation: ΔP ≈ Δ * dS + 0.5 * Γ * dS^2
        pnl = (delta * dS) + (0.5 * gamma * Math.pow(dS, 2));
        break;
      case 'vol':
        // Standard BS Vega is ∂P/∂σ. 1 unit of shock = 1 percentage point = 0.01.
        pnl = vega * (shockMagnitude / 100);
        break;
      case 'time':
        // Theta is rate of change with time (usually annualized or per day). 
        // We assume daily theta in our mathUtils and magnitude is in days passed.
        pnl = theta * (shockMagnitude / 365); 
        break;
      case 'rates':
        // Rho is ∂P/∂r. 1 unit of shock = 1 percentage point = 0.01.
        pnl = rho * (shockMagnitude / 100);
        break;
    }

    return { 
      pnl, 
      newPrice: Math.max(0, latestPoint.value + pnl),
      percent: latestPoint.value !== 0 ? (pnl / latestPoint.value) * 100 : 0
    };
  }, [shockType, shockMagnitude, latestPoint, parameters.initialValue, hasGreeks]);

  const StatCard = ({ label, value, sub, highlight }: { label: string, value: string, sub?: string, highlight?: boolean }) => (
    <div className={`p-4 rounded-xl border shadow-sm transition-all ${highlight ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}>
      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-xl font-bold font-mono ${highlight ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-900 dark:text-white'}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{sub}</p>}
    </div>
  );

  const gridColor = isDark ? "#1e293b" : "#f1f5f9";
  const axisColor = isDark ? "#475569" : "#94a3b8";
  const tooltipBg = isDark ? "rgba(15, 23, 42, 0.95)" : "rgba(255, 255, 255, 0.95)";
  const tooltipBorder = isDark ? "#334155" : "#e2e8f0";

  const applyPreset = (preset: typeof STRESS_PRESETS[0]) => {
    const val = preset.values[shockType];
    setShockMagnitude(val);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-slate-100/50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest">Analysis Terminal</h3>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowBenchmark(!showBenchmark)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all border ${showBenchmark ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-100 dark:shadow-none' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
          >
            {showBenchmark ? 'Market Overlay: On' : 'Market Overlay: Off'}
          </button>
          {isZoomed && (
            <button onClick={resetZoom} className="px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800 rounded-md transition-all active:scale-95">Reset View</button>
          )}
          <button onClick={exportChartAsImage} className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-md shadow-sm transition-all active:scale-95">Export PNG</button>
          <button onClick={exportFullReportPDF} className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm transition-all active:scale-95">PDF Report</button>
        </div>
      </div>

      <div ref={boardRef} className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Final Synth Value" value={latestPoint.value.toFixed(4)} />
          <StatCard label="Benchmark Coupling" value={`${(effectiveRho * 100).toFixed(1)}%`} sub="Effective ρ Coefficient" highlight={Math.abs(effectiveRho) > 0.5} />
          {hasGreeks ? (
            <StatCard label="Current Delta" value={latestPoint.greeks?.delta?.toFixed(4) || 'N/A'} highlight />
          ) : (
            <StatCard label="Realized Vol" value={summary.vol.toFixed(4)} highlight={summary.vol > 0.3} />
          )}
          <StatCard label="Time Horizon" value={`${parameters.timeHorizon} Steps`} sub={`${(parameters.timeHorizon/252).toFixed(2)} Annualized`} />
        </div>

        {/* Primary Path Chart */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors" ref={chartRef}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider text-xs">Synthesis & Benchmark Correlation</h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{parameters.modelType} logic + {showBenchmark ? 'Factor Coupling Active' : 'Factor Coupling Isolated'}</p>
            </div>
            <div className="flex gap-4 items-center">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-indigo-600"></div>
                <span className="text-[9px] font-bold text-slate-500 uppercase">Primary Asset</span>
              </div>
              {showBenchmark && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 border-t-2 border-dashed border-slate-400"></div>
                  <span className="text-[9px] font-bold text-slate-500 uppercase">Composite Benchmark</span>
                </div>
              )}
            </div>
          </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} syncId="quantSync" margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                <XAxis dataKey="timestamp" tick={{fontSize: 10, fill: axisColor}} axisLine={false} tickLine={false} minTickGap={50} />
                <YAxis tick={{fontSize: 10, fill: axisColor}} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '8px', border: `1px solid ${tooltipBorder}`, backgroundColor: tooltipBg, color: isDark ? '#fff' : '#000', fontSize: '11px'
                  }}
                />
                <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" name="Primary Value" isAnimationActive={false} />
                {showBenchmark && (
                  <Line type="monotone" dataKey="benchmarkValue" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Market Benchmark" isAnimationActive={false} />
                )}
                <Brush dataKey="timestamp" height={40} stroke={axisColor} fill={isDark ? "#0f172a" : "#f8fafc"} startIndex={range.start} endIndex={range.end} onChange={handleBrushChange} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Greeks Multi-Chart & Stress Test Tool */}
        {hasGreeks && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider text-xs">Risk Factor Sensitivities (Greeks)</h3>
                <div className="flex gap-1">
                  {['all', 'delta', 'gamma', 'vega', 'theta', 'rho'].map(key => (
                    <button 
                      key={key} 
                      onClick={() => setSelectedGreek(key)}
                      className={`px-2 py-0.5 text-[9px] font-bold rounded uppercase transition-all ${
                        selectedGreek === key 
                        ? "bg-indigo-600 text-white" 
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} syncId="quantSync">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                    <XAxis dataKey="timestamp" hide />
                    <YAxis tick={{fontSize: 9, fill: axisColor}} domain={['auto', 'auto']} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: `1px solid ${tooltipBorder}`, backgroundColor: tooltipBg, fontSize: '10px' }} />
                    <Legend verticalAlign="top" height={36} iconType="circle"/>
                    {Object.entries(GREEKS_INFO).map(([key, info]) => (selectedGreek === 'all' || selectedGreek === key) && (
                      <Line 
                        key={key}
                        type="monotone" 
                        dataKey={key} 
                        stroke={info.color} 
                        dot={false} 
                        strokeWidth={2} 
                        name={info.label} 
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Instant Sensitivity Stress Test Sub-Component */}
              <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                  <div>
                    <h4 className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Sensitivity Stress Test</h4>
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 font-medium italic">Taylor series approximation based on instantaneous Greeks</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {[
                      { id: 'asset', label: 'Spot Δ/Γ', icon: '🎯' },
                      { id: 'vol', label: 'Vega ν', icon: '☁️' },
                      { id: 'time', label: 'Theta θ', icon: '⏳' },
                      { id: 'rates', label: 'Rho ρ', icon: '🏦' }
                    ].map(t => (
                      <button 
                        key={t.id}
                        onClick={() => { setShockType(t.id as any); setShockMagnitude(0); }}
                        className={`px-3 py-1.5 text-[9px] font-bold rounded-lg border transition-all flex items-center gap-1.5 ${
                          shockType === t.id 
                          ? 'bg-indigo-600 text-white border-indigo-500' 
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <span>{t.icon}</span>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-8 items-start">
                  <div className="md:col-span-2 space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase">
                        Magnitude: <span className="text-indigo-600 dark:text-indigo-400 font-mono text-xs">{shockMagnitude > 0 ? '+' : ''}{shockMagnitude}{shockType === 'time' ? ' Days' : '%'}</span>
                      </span>
                      <button onClick={() => setShockMagnitude(0)} className="text-[8px] font-bold text-slate-400 hover:text-indigo-500 uppercase tracking-tighter">Reset</button>
                    </div>
                    <input 
                      type="range" 
                      min={shockType === 'time' ? 0 : -50} 
                      max={shockType === 'time' ? 365 : 50} 
                      step={1}
                      value={shockMagnitude}
                      onChange={(e) => setShockMagnitude(parseInt(e.target.value))}
                      className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 shadow-inner"
                    />
                    
                    <div className="pt-2">
                       <p className="text-[9px] font-bold text-slate-400 uppercase mb-2 tracking-tight">Quick Presets</p>
                       <div className="flex gap-1.5">
                          {STRESS_PRESETS.map(preset => (
                            <button
                              key={preset.id}
                              onClick={() => applyPreset(preset)}
                              className="px-2 py-1 text-[8px] font-extrabold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded hover:border-indigo-500 transition-colors uppercase"
                            >
                              {preset.label}
                            </button>
                          ))}
                       </div>
                    </div>
                  </div>

                  <div className="md:col-span-2 grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col items-center">
                      <span className="text-[8px] font-bold text-slate-400 uppercase mb-1">Projected P&L</span>
                      <span className={`text-lg font-mono font-bold ${shockImpact.pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {shockImpact.pnl >= 0 ? '+' : ''}{shockImpact.pnl.toFixed(4)}
                      </span>
                      <span className={`text-[10px] font-bold ${shockImpact.pnl >= 0 ? 'text-emerald-600/60' : 'text-rose-600/60'}`}>
                        ({shockImpact.percent >= 0 ? '+' : ''}{shockImpact.percent.toFixed(2)}%)
                      </span>
                    </div>
                    <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800 flex flex-col items-center shadow-inner">
                      <span className="text-[8px] font-bold text-indigo-500 uppercase mb-1">Shocked Price</span>
                      <span className="text-lg font-mono font-bold text-indigo-700 dark:text-indigo-300">
                        {shockImpact.newPrice.toFixed(4)}
                      </span>
                      <div className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-full mt-3 overflow-hidden flex">
                         <div 
                           className={`h-full transition-all duration-300 ${shockImpact.pnl >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                           style={{ width: `${Math.min(100, 50 + (shockImpact.percent * 0.5))}%`, marginLeft: shockImpact.pnl < 0 ? 'auto' : '0' }}
                         ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Risk Glossary Sidebar */}
            <div className="space-y-4">
               <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Risk Sensitivity Guide</h4>
               <div className="space-y-3 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
                  {Object.entries(GREEKS_INFO).map(([key, info]) => (
                    <div key={key} className={`p-3 rounded-lg border transition-all ${selectedGreek === key || selectedGreek === 'all' ? 'opacity-100 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50' : 'opacity-40 grayscale'}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: info.color }}></div>
                        <span className="text-[10px] font-extrabold text-slate-900 dark:text-white uppercase">{info.label}</span>
                        <span className="text-[8px] px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded font-bold ml-auto">{info.meaning}</span>
                      </div>
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed font-medium mb-1.5">{info.explanation}</p>
                      <p className="text-[9px] text-indigo-500 dark:text-indigo-400 font-bold italic leading-tight">{info.impact}</p>
                    </div>
                  ))}
               </div>
            </div>
          </div>
        )}

        {insights && (
          <div className="bg-indigo-900 dark:bg-indigo-950 text-white p-6 rounded-xl shadow-xl shadow-indigo-100 dark:shadow-none border border-indigo-800 transition-all">
            <h3 className="text-indigo-200 text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="animate-pulse w-2 h-2 bg-indigo-400 rounded-full"></span>
              Quant Insight Report
            </h3>
            <div className="prose prose-invert prose-sm max-w-none text-indigo-50 leading-relaxed font-medium whitespace-pre-line text-sm">
              {insights}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisBoard;
