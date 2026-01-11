
import React from 'react';
import { DataPoint } from '../types';
import { convertToCSV, downloadFile } from '../services/synthesisEngine';

interface DataPreviewProps {
  data: DataPoint[];
  title: string;
}

const DataPreview: React.FC<DataPreviewProps> = ({ data, title }) => {
  const exportCSV = () => {
    const csv = convertToCSV(data);
    downloadFile(csv, `quantsynth_${Date.now()}.csv`, 'text/csv');
  };

  const exportJSON = () => {
    const json = JSON.stringify(data, null, 2);
    downloadFile(json, `quantsynth_${Date.now()}.json`, 'application/json');
  };

  const hasGreeks = data.length > 0 && !!data[0].greeks;
  const hasPE = data.length > 0 && data[0].peRatio !== undefined;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden mt-6 transition-colors">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
        <h3 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-xs">{title}</h3>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-md transition-colors">Export CSV</button>
          <button onClick={exportJSON} className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors">Export JSON</button>
        </div>
      </div>
      <div className="overflow-x-auto max-h-96">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold z-10">
            <tr>
              <th className="px-6 py-3 border-b border-slate-100 dark:border-slate-700 whitespace-nowrap">Index</th>
              <th className="px-6 py-3 border-b border-slate-100 dark:border-slate-700 whitespace-nowrap">Timestamp</th>
              <th className="px-6 py-3 border-b border-slate-100 dark:border-slate-700 whitespace-nowrap text-indigo-600 dark:text-indigo-400">Value</th>
              {hasPE && (
                <>
                  <th className="px-6 py-3 border-b border-slate-100 dark:border-slate-700 whitespace-nowrap">P/E</th>
                  <th className="px-6 py-3 border-b border-slate-100 dark:border-slate-700 whitespace-nowrap">Earnings</th>
                </>
              )}
              {hasGreeks && (
                <>
                  <th className="px-6 py-3 border-b border-slate-100 dark:border-slate-700">Delta</th>
                  <th className="px-6 py-3 border-b border-slate-100 dark:border-slate-700">Gamma</th>
                  <th className="px-6 py-3 border-b border-slate-100 dark:border-slate-700">Vega</th>
                  <th className="px-6 py-3 border-b border-slate-100 dark:border-slate-700">Theta</th>
                  <th className="px-6 py-3 border-b border-slate-100 dark:border-slate-700">Rho</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="text-sm font-mono text-slate-600 dark:text-slate-400">
            {data.slice(0, 100).map((row, i) => (
              <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 last:border-0 transition-colors">
                <td className="px-6 py-3">{row.index}</td>
                <td className="px-6 py-3 whitespace-nowrap">{row.timestamp}</td>
                <td className="px-6 py-3 font-semibold text-slate-900 dark:text-slate-100">{row.value.toFixed(4)}</td>
                {hasPE && (
                  <>
                    <td className="px-6 py-3">{row.peRatio?.toFixed(2) || '-'}</td>
                    <td className="px-6 py-3">{row.expectedEarnings?.toFixed(2) || '-'}</td>
                  </>
                )}
                {hasGreeks && (
                  <>
                    <td className="px-6 py-3">{row.greeks?.delta?.toFixed(4) || '0.0000'}</td>
                    <td className="px-6 py-3">{row.greeks?.gamma?.toFixed(4) || '0.0000'}</td>
                    <td className="px-6 py-3">{row.greeks?.vega?.toFixed(4) || '0.0000'}</td>
                    <td className="px-6 py-3">{row.greeks?.theta?.toFixed(4) || '0.0000'}</td>
                    <td className="px-6 py-3">{row.greeks?.rho?.toFixed(4) || '0.0000'}</td>
                  </>
                )}
              </tr>
            ))}
            {data.length > 100 && (
              <tr>
                <td colSpan={hasGreeks ? (hasPE ? 10 : 8) : (hasPE ? 5 : 3)} className="px-6 py-3 text-center text-slate-400 dark:text-slate-500 italic bg-slate-50/20 dark:bg-slate-800/20">
                  Showing first 100 rows of {data.length} total points
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataPreview;
