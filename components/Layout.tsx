
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  isDark: boolean;
  onToggleTheme: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, sidebar, isDark, onToggleTheme }) => {
  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden transition-colors duration-300">
      {/* Sidebar */}
      <aside className="w-80 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 overflow-y-auto flex flex-col transition-colors duration-300">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">Q</div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">QuantSynth</h1>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-[0.2em]">Data Studio</p>
          </div>
          <button 
            onClick={onToggleTheme}
            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDark ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4-9H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M16.95 16.95l.707.707M7.05 7.05l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
            )}
          </button>
        </div>
        <div className="flex-1">
          {sidebar}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
