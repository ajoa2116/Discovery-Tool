import React, { useState } from 'react';
import { PhaseState } from '../../types/index.ts';
import { Play, CheckCircle2, AlertCircle, Clock, ChevronDown, ChevronUp, Terminal, ShieldCheck } from 'lucide-react';

interface ExecutionPipelineProps {
  phases: PhaseState[];
  onRunFullPipeline: () => void;
  onRunSinglePhase: (phaseNum: number) => void;
  isRunning: boolean;
}

export const ExecutionPipeline: React.FC<ExecutionPipelineProps> = ({
  phases,
  onRunFullPipeline,
  onRunSinglePhase,
  isRunning,
}) => {
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);

  const getStatusIcon = (status: PhaseState['status']) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case 'RUNNING':
        return <div className="w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />;
      case 'FAILED':
        return <AlertCircle className="w-5 h-5 text-rose-400" />;
      default:
        return <Clock className="w-5 h-5 text-slate-500" />;
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-sky-400" />
            <h2 className="text-lg font-bold text-white tracking-wide">6-Phase Batch Execution Pipeline</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">Section 4 Orchestration: Strict sequence prevents routing lockouts & state collisions.</p>
        </div>

        <button
          onClick={onRunFullPipeline}
          disabled={isRunning}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all shadow-md ${
            isRunning
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white shadow-sky-900/30'
          }`}
        >
          <Play className="w-4 h-4 fill-current" />
          {isRunning ? 'Executing Batch...' : 'Run Full 6-Phase Pipeline'}
        </button>
      </div>

      {/* Pipeline Steps Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
        {phases.map((phase) => {
          const isExpanded = expandedPhase === phase.phaseNumber;
          return (
            <div
              key={phase.phaseNumber}
              className={`flex flex-col justify-between p-3.5 rounded-lg border transition-all ${
                phase.status === 'RUNNING'
                  ? 'bg-sky-950/40 border-sky-500/60 ring-1 ring-sky-500/40'
                  : phase.status === 'COMPLETED'
                  ? 'bg-slate-850/90 border-slate-700/70'
                  : 'bg-slate-950/60 border-slate-800/80'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    Phase {phase.phaseNumber}
                  </span>
                  {getStatusIcon(phase.status)}
                </div>

                <h3 className="font-semibold text-sm text-slate-100 line-clamp-1">{phase.name}</h3>
                <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">{phase.description}</p>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs">
                <span className="text-slate-400 font-mono">
                  {phase.devicesFoundCount > 0 ? `${phase.devicesFoundCount} devs` : '0 devs'}
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onRunSinglePhase(phase.phaseNumber)}
                    disabled={isRunning}
                    title="Run only this phase"
                    className="p-1 hover:bg-slate-700/60 rounded text-slate-400 hover:text-sky-300 transition"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>

                  {phase.logs.length > 0 && (
                    <button
                      onClick={() => setExpandedPhase(isExpanded ? null : phase.phaseNumber)}
                      className="p-1 hover:bg-slate-700/60 rounded text-slate-400 hover:text-slate-200 transition"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Expanded Logs Drawer */}
      {expandedPhase !== null && (
        <div className="mt-4 p-3.5 bg-slate-950 border border-slate-800 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs font-mono text-sky-400">
              <Terminal className="w-4 h-4" />
              <span>Phase {expandedPhase} Terminal Output Log</span>
            </div>
            <button
              onClick={() => setExpandedPhase(null)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Close
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto font-mono text-[11px] text-slate-300 space-y-1">
            {phases[expandedPhase - 1]?.logs.map((log, idx) => (
              <div key={idx} className="leading-relaxed">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
