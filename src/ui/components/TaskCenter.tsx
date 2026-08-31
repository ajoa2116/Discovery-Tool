import React from 'react';
import { X, CheckCircle2, Clock, AlertTriangle, RefreshCw, Layers } from 'lucide-react';

export interface TaskItem {
  id: string;
  deviceName: string;
  operation: string;
  status: 'QUEUED' | 'RUNNING' | 'VERIFYING' | 'SUCCESS' | 'FAILED' | 'COLLISION';
  timestamp: string;
}

interface TaskCenterProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: TaskItem[];
}

export const TaskCenter: React.FC<TaskCenterProps> = ({ isOpen, onClose, tasks }) => {
  if (!isOpen) return null;

  const getStatusIcon = (status: TaskItem['status']) => {
    switch (status) {
      case 'SUCCESS':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'RUNNING':
      case 'VERIFYING':
        return <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" />;
      case 'COLLISION':
      case 'FAILED':
        return <AlertTriangle className="w-4 h-4 text-rose-400" />;
      default:
        return <Clock className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 w-96 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[450px]">
      {/* Header */}
      <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-white text-xs">Activity</h3>
            <span className="text-[10px] text-slate-400">{tasks.length} Operations Queued/Logged</span>
          </div>
        </div>

        <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Task List */}
      <div className="p-3 space-y-2 overflow-y-auto flex-1 text-xs">
        {tasks.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-[11px]">
            No active operations running.
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-xl flex items-center justify-between"
            >
              <div>
                <div className="font-bold text-slate-100">{task.deviceName}</div>
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                  <span>{task.operation}</span>
                  <span className="text-slate-600">•</span>
                  <span className="font-mono text-slate-500">{task.timestamp}</span>
                </div>
              </div>

              <div>{getStatusIcon(task.status)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
