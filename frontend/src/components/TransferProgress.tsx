import React from 'react';
import { 
  Wifi, WifiOff, RefreshCw, CheckCircle2, 
  Clock, Zap, File, ShieldAlert 
} from 'lucide-react';
import type { TransferStats } from '../utils/webrtc';

interface TransferProgressProps {
  isSender: boolean;
  fileName: string;
  fileSize: number;
  connectionState: string;
  peerConnected: boolean;
  stats: TransferStats | null;
  onCancel: () => void;
  onSendAnotherFile?: (file: File) => void;
}

export const TransferProgress: React.FC<TransferProgressProps> = ({
  isSender,
  fileName,
  fileSize,
  connectionState,
  peerConnected,
  stats,
  onCancel,
  onSendAnotherFile
}) => {
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const formatETA = (seconds: number) => {
    if (seconds === 9999 || isNaN(seconds) || seconds === Infinity) return 'Calculating...';
    if (seconds === 0) return 'Done';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const progress = stats?.progress || 0;
  const speed = stats?.speed || 0;
  const eta = stats?.eta || 0;
  const transferred = stats?.transferredBytes || 0;

  const getStatusBadge = () => {
    switch (connectionState) {
      case 'connected':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded border border-neutral-700 bg-neutral-900 text-xs font-medium text-neutral-300">
            <Wifi className="w-3 h-3 mr-1" />
            Connected
          </span>
        );
      case 'connecting':
      case 'negotiating':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded border border-neutral-700 bg-neutral-900 text-xs font-medium text-neutral-400">
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
            Connecting
          </span>
        );
      case 'verifying':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded border border-neutral-700 bg-neutral-900 text-xs font-medium text-neutral-300">
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
            Verifying Hash
          </span>
        );
      case 'downloading':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded border border-neutral-700 bg-neutral-900 text-xs font-medium text-neutral-300">
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
            Saving File
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded border border-emerald-800 bg-emerald-950/30 text-xs font-medium text-emerald-400">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Success
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded border border-neutral-800 bg-neutral-950 text-xs font-medium text-neutral-500">
            <WifiOff className="w-3 h-3 mr-1" />
            Disconnected
          </span>
        );
    }
  };

  const getSubStatusText = () => {
    if (connectionState === 'verifying') return 'Checking cryptographic signatures...';
    if (connectionState === 'downloading') return 'Reassembling blocks for download...';
    if (connectionState === 'completed') return isSender ? 'Transfer complete.' : 'File saved successfully.';
    if (!peerConnected && connectionState === 'disconnected') return 'Connection dropped. Waiting for peer to resume...';
    return isSender ? 'Sending encrypted stream...' : 'Receiving encrypted stream...';
  };

  return (
    <div className="w-full max-w-xl mx-auto p-6 rounded-xl solid-panel text-left">
      
      {/* File Details */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center space-x-3 overflow-hidden">
          <div className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-300 shrink-0">
            <File className="w-6 h-6" />
          </div>
          <div className="overflow-hidden">
            <h3 className="font-semibold text-neutral-100 truncate text-sm">{fileName}</h3>
            <p className="text-[10px] text-neutral-500 mt-0.5">{formatBytes(fileSize)}</p>
          </div>
        </div>
        <div>
          {getStatusBadge()}
        </div>
      </div>

      {/* Flat Progress Bar */}
      <div className="relative mb-6">
        <div className="flex mb-1.5 items-center justify-between text-xs font-semibold text-neutral-400">
          <span>{isSender ? 'Sending' : 'Downloading'}</span>
          <span className="font-mono text-neutral-200">{progress.toFixed(1)}%</span>
        </div>
        
        {/* Simple flat progress bar */}
        <div className="overflow-hidden h-2.5 rounded bg-neutral-950 border border-neutral-900">
          <div
            style={{ width: `${progress}%` }}
            className={`h-full transition-all duration-300 ${
              connectionState === 'completed'
                ? 'bg-emerald-500'
                : 'bg-white'
            }`}
          ></div>
        </div>
        
        <p className="text-[10px] text-neutral-500 mt-2">
          {getSubStatusText()}
        </p>
      </div>

      {/* Stats Table/List */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="p-3 bg-neutral-950/40 border border-neutral-900 rounded-lg text-center">
          <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider flex items-center justify-center space-x-1">
            <Zap className="w-3.5 h-3.5 text-neutral-400" />
            <span>Speed</span>
          </div>
          <span className="text-xs font-mono font-bold text-neutral-200 block mt-1">{speed} MB/s</span>
        </div>
        <div className="p-3 bg-neutral-950/40 border border-neutral-900 rounded-lg text-center">
          <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider flex items-center justify-center space-x-1">
            <Clock className="w-3.5 h-3.5 text-neutral-400" />
            <span>ETA</span>
          </div>
          <span className="text-xs font-mono font-bold text-neutral-200 block mt-1">{formatETA(eta)}</span>
        </div>
        <div className="p-3 bg-neutral-950/40 border border-neutral-900 rounded-lg text-center">
          <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider flex items-center justify-center space-x-1">
            <File className="w-3.5 h-3.5 text-neutral-400" />
            <span>Transferred</span>
          </div>
          <span className="text-xs font-mono font-bold text-neutral-200 block mt-1">{formatBytes(transferred)}</span>
        </div>
      </div>

      {/* Warnings & Action Buttons */}
      <div className="flex flex-col space-y-3">
        {!peerConnected && connectionState === 'disconnected' && (
          <div className="flex items-start space-x-2 p-3 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 text-xs">
            <ShieldAlert className="w-4 h-4 text-neutral-300 shrink-0 mt-0.5" />
            <span>Link dropped. Reconnecting automatically once peer is online...</span>
          </div>
        )}

        {connectionState === 'completed' ? (
          <div className="flex flex-col sm:flex-row gap-2.5">
            {isSender && onSendAnotherFile && (
              <>
                <input
                  type="file"
                  id="send-another-file-input"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onSendAnotherFile(file);
                  }}
                />
                <button
                  onClick={() => document.getElementById('send-another-file-input')?.click()}
                  className="flex-1 py-2 bg-white hover:bg-neutral-100 text-neutral-950 transition-colors text-xs font-semibold rounded-lg text-center"
                >
                  Send Another File
                </button>
              </>
            )}
            <button
              onClick={onCancel}
              className={`py-2 text-xs font-semibold rounded-lg transition-colors border ${
                isSender && onSendAnotherFile
                  ? 'flex-1 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border-neutral-800 hover:border-neutral-700'
                  : 'w-full bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border-neutral-800 hover:border-neutral-700'
              }`}
            >
              Close Room
            </button>
          </div>
        ) : (
          <button
            onClick={onCancel}
            className="w-full py-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 hover:border-neutral-700 transition-colors text-xs font-semibold rounded-lg"
          >
            Cancel Transfer
          </button>
        )}
      </div>

    </div>
  );
};
