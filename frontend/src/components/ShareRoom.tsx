import React, { useState, useEffect, useRef } from 'react';
import { 
  Copy, Check, Shield, ArrowLeft,
  Lock, RefreshCw, Send, Sparkles
} from 'lucide-react';
import { FileSelector } from './FileSelector';
import { TransferProgress } from './TransferProgress';
import { P2PConnectionManager } from '../utils/webrtc';
import type { TransferStats } from '../utils/webrtc';
import { generateEncryptionKey, exportKey } from '../utils/crypto';
import type { FileMetadata } from '../utils/storage';

const SIGNALING_URL = 'http://localhost:4000'; // Default local address

export const ShareRoom: React.FC = () => {
  const [roomId, setRoomId] = useState<string>('');
  const [role, setRole] = useState<'sender' | 'receiver' | null>(null);
  const [e2eeKeyStr, setE2eeKeyStr] = useState<string>('');
  const [isE2eeEnabled, setIsE2eeEnabled] = useState<boolean>(true);
  
  // File details
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileMetadata, setFileMetadata] = useState<FileMetadata | null>(null);
  
  // Connection / Transfer states
  const [connectionState, setConnectionState] = useState<string>('idle');
  const [peerConnected, setPeerConnected] = useState<boolean>(false);
  const [stats, setStats] = useState<TransferStats | null>(null);
  const [roomLink, setRoomLink] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState<boolean>(false);
  
  // Ref for the connection manager
  const managerRef = useRef<P2PConnectionManager | null>(null);

  // Initialize and check URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    const hash = window.location.hash;
    const keyParam = hash && hash.startsWith('#key=') ? hash.substring(5) : '';

    if (roomParam) {
      // We are the receiver
      setRole('receiver');
      setRoomId(roomParam);
      if (keyParam) {
        setE2eeKeyStr(keyParam);
        setIsE2eeEnabled(true);
        addLog('E2EE key parsed from URL hash.');
      } else {
        setIsE2eeEnabled(false);
        addLog('Unencrypted link.');
      }
      
      addLog(`Joined room: ${roomParam}`);
      connectP2P(roomParam, 'receiver', keyParam);
    } else {
      // We are the sender
      setRole('sender');
    }

    return () => {
      if (managerRef.current) {
        managerRef.current.disconnect();
      }
    };
  }, []);

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`].slice(-6));
  };

  const connectP2P = (rId: string, clientRole: 'sender' | 'receiver', keyStr?: string) => {
    const backendUrl = import.meta.env.VITE_SIGNALING_URL || SIGNALING_URL;
    
    addLog(`Signaling host: ${backendUrl}`);
    const manager = new P2PConnectionManager(backendUrl);
    managerRef.current = manager;

    manager.onConnectionState = (state) => {
      setConnectionState(state);
      addLog(`State: ${state.toUpperCase()}`);
    };

    manager.onPeerStatus = (connected) => {
      setPeerConnected(connected);
      if (connected) {
        addLog('Peer connected. Direct handshake negotiating...');
      } else {
        addLog('Peer disconnected from signaling.');
      }
    };

    manager.onStats = (transferStats) => {
      setStats(transferStats);
    };

    manager.onMetadata = (metadata) => {
      setFileMetadata(metadata);
      addLog(`Metadata: ${metadata.name} (${(metadata.size / 1024 / 1024).toFixed(2)} MB)`);
    };

    manager.onComplete = (isSenderSide, _fileUrl) => {
      setConnectionState('completed');
      addLog(isSenderSide ? 'Transfer complete.' : 'Download complete and verified.');
    };

    manager.onError = (errMsg) => {
      setError(errMsg);
      addLog(`Error: ${errMsg}`);
    };

    manager.connect(rId, clientRole, keyStr);
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setError(null);
    addLog(`File: ${file.name}`);
  };

  const handleCreateRoom = async () => {
    if (!selectedFile) return;

    try {
      const generatedId = Math.random().toString(36).substring(2, 10);
      setRoomId(generatedId);
      
      let key: CryptoKey | undefined;
      let keyStr = '';

      if (isE2eeEnabled) {
        addLog('Generating AES-GCM 256 key...');
        key = await generateEncryptionKey();
        keyStr = await exportKey(key);
        setE2eeKeyStr(keyStr);
      }

      const link = isE2eeEnabled 
        ? `${window.location.origin}${window.location.pathname}?room=${generatedId}#key=${keyStr}`
        : `${window.location.origin}${window.location.pathname}?room=${generatedId}`;

      setRoomLink(link);
      addLog(`Room active: ${generatedId}`);

      connectP2P(generatedId, 'sender');
      
      if (managerRef.current) {
        managerRef.current.setSenderFile(selectedFile, key);
      }
    } catch (err: any) {
      console.error(err);
      setError(`Failed to create room: ${err.message}`);
    }
  };

  const copyLinkToClipboard = () => {
    navigator.clipboard.writeText(roomLink);
    setCopied(true);
    addLog('Room link copied.');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    if (managerRef.current) {
      managerRef.current.disconnect();
      managerRef.current = null;
    }
    window.history.pushState({}, '', window.location.pathname);
    setRoomId('');
    setRole('sender');
    setSelectedFile(null);
    setFileMetadata(null);
    setConnectionState('idle');
    setPeerConnected(false);
    setStats(null);
    setRoomLink('');
    setError(null);
    setLogs([]);
  };

  return (
    <div className="w-full min-h-[calc(100vh-140px)] flex flex-col items-center justify-center px-4 py-8">
      
      {/* Editorial Title */}
      <div className="w-full max-w-xl text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2 uppercase">
          P2P Web Share
        </h1>
        <p className="text-neutral-500 text-xs tracking-wide uppercase">
          Direct browser-to-browser encrypted file transfers
        </p>
      </div>

      {error && (
        <div className="w-full max-w-xl mb-6 p-4 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 text-xs flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Shield className="w-4 h-4 text-neutral-300 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="font-semibold text-white hover:underline">Dismiss</button>
        </div>
      )}

      {/* Main Container */}
      <div className="w-full max-w-xl">
        
        {/* Role: SENDER (Choose File) */}
        {role === 'sender' && !roomLink && (
          <div className="space-y-4">
            <FileSelector onFileSelect={handleFileSelect} />

            {selectedFile && (
              <div className="p-5 rounded-xl solid-panel space-y-4 animate-slide-up text-left">
                <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest flex items-center">
                  <Lock className="w-3.5 h-3.5 mr-1.5" />
                  Security Settings
                </h3>

                <div 
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                    isE2eeEnabled 
                      ? 'bg-neutral-950/20 border-neutral-700' 
                      : 'bg-neutral-900/40 border-neutral-850 hover:border-neutral-750'
                  }`}
                  onClick={() => setIsE2eeEnabled(!isE2eeEnabled)}
                >
                  <div className="flex items-start space-x-3 text-left">
                    <Lock className={`w-4 h-4 shrink-0 mt-0.5 ${isE2eeEnabled ? 'text-white' : 'text-neutral-600'}`} />
                    <div>
                      <p className="text-xs font-semibold text-neutral-200">Zero-Knowledge Encryption</p>
                      <p className="text-[10px] text-neutral-500 mt-0.5">Encrypt file chunks using AES-GCM. Decryption key shared via URL hash.</p>
                    </div>
                  </div>
                  <div className="ml-4">
                    <input
                      type="checkbox"
                      checked={isE2eeEnabled}
                      readOnly
                      className="w-3.5 h-3.5 text-white border-neutral-800 rounded bg-neutral-900 focus:ring-neutral-700"
                    />
                  </div>
                </div>

                <button
                  onClick={handleCreateRoom}
                  className="w-full btn-primary"
                >
                  <Send className="w-4 h-4" />
                  <span>Generate Share Link</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Role: SENDER (Link Generated, waiting for receiver) */}
        {role === 'sender' && roomLink && (
          <div className="space-y-4">
            
            {connectionState === 'idle' || connectionState === 'connecting' || connectionState === 'negotiating' ? (
              <div className="p-6 rounded-xl solid-panel space-y-5 animate-slide-up text-left">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                  <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wide flex items-center">
                    <Sparkles className="w-4 h-4 mr-1.5" />
                    Share Room Active ({roomId})
                  </h3>
                  <button 
                    onClick={handleReset}
                    className="text-[10px] text-neutral-500 hover:text-neutral-300 font-semibold flex items-center space-x-1 uppercase"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    <span>Back</span>
                  </button>
                </div>

                {/* Copier link box */}
                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                    Recipient URL:
                  </label>
                  <div className="flex items-center space-x-2 p-1.5 bg-neutral-950 border border-neutral-900 rounded-lg">
                    <input
                      type="text"
                      readOnly
                      value={roomLink}
                      className="bg-transparent text-xs text-neutral-300 px-2.5 w-full border-none focus:outline-none select-all font-mono"
                    />
                    <button
                      onClick={copyLinkToClipboard}
                      className={`p-2 rounded-md shrink-0 transition-colors flex items-center justify-center ${
                        copied 
                          ? 'bg-emerald-950/20 text-emerald-400' 
                          : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800 hover:text-white'
                      }`}
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="p-3.5 rounded-lg bg-neutral-900/60 border border-neutral-850 text-xs text-neutral-400">
                  The file is streamed directly from your browser memory. Do not close this tab or let your computer sleep.
                </div>

                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <div className="w-8 h-8 rounded bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 animate-spin-fast mb-3">
                    <RefreshCw className="w-4 h-4" />
                  </div>
                  <p className="text-xs font-semibold text-neutral-200">Waiting for peer to connect...</p>
                </div>
              </div>
            ) : (
              selectedFile && (
                <TransferProgress
                  isSender={true}
                  fileName={selectedFile.name}
                  fileSize={selectedFile.size}
                  connectionState={connectionState}
                  peerConnected={peerConnected}
                  stats={stats}
                  onCancel={handleReset}
                />
              )
            )}
          </div>
        )}

        {/* Role: RECEIVER (Connecting or downloading) */}
        {role === 'receiver' && (
          <div className="space-y-4">
            {!fileMetadata ? (
              <div className="p-8 rounded-xl solid-panel flex flex-col items-center justify-center text-center space-y-6">
                <div className="w-10 h-10 rounded bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-300 animate-spin-fast">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-neutral-200">Connecting to Share Room</h3>
                  <p className="text-xs text-neutral-500 max-w-xs mx-auto">
                    Establishing client-side decryption and routing WebRTC handshake...
                  </p>
                  {isE2eeEnabled && e2eeKeyStr && (
                    <div className="text-[10px] text-emerald-400 font-mono mt-3 inline-flex items-center justify-center bg-emerald-950/20 px-2.5 py-1 rounded border border-emerald-900/40">
                      <Lock className="w-3 h-3 mr-1" />
                      E2EE Verified: {e2eeKeyStr.substring(0, 12)}...
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <TransferProgress
                isSender={false}
                fileName={fileMetadata.name}
                fileSize={fileMetadata.size}
                connectionState={connectionState}
                peerConnected={peerConnected}
                stats={stats}
                onCancel={handleReset}
              />
            )}
          </div>
        )}

        {/* Debug Console Logs */}
        {logs.length > 0 && (
          <div className="mt-8 text-center animate-fade-in">
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="text-[9px] font-bold text-neutral-500 hover:text-neutral-300 uppercase tracking-widest px-3 py-1 border border-neutral-900 rounded bg-neutral-950/20 transition-colors"
            >
              {showLogs ? 'Hide Console Logs' : 'Show Console Logs'}
            </button>
            
            {showLogs && (
              <div className="mt-3 text-left p-3.5 rounded-lg bg-neutral-950 border border-neutral-900 font-mono text-[9px] text-neutral-500 space-y-1 shadow-inner">
                {logs.map((log, idx) => (
                  <div key={idx} className="truncate">
                    <span className="text-neutral-700 mr-1.5">&gt;</span>
                    {log}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
