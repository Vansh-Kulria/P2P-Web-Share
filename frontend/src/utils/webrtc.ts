import { io, Socket } from 'socket.io-client';
import { 
  encryptChunk, 
  decryptChunk, 
  hashSingleChunk, 
  hashChunks, 
  importKey 
} from './crypto';
import { 
  saveFileMetadata, 
  getFileMetadata, 
  saveChunk, 
  getStoredChunkIndices, 
  getChunk,
  triggerFileDownload,
  clearRoomData,
  type FileMetadata 
} from './storage';

const CHUNK_SIZE = 64 * 1024; // 64 KB chunks
const BUFFERED_AMOUNT_THRESHOLD = 1024 * 1024; // 1 MB backpressure limit

export interface TransferStats {
  progress: number; // percentage 0-100
  speed: number;    // MB/s
  eta: number;      // seconds
  transferredBytes: number;
  totalBytes: number;
}

export class P2PConnectionManager {
  private socket: Socket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  
  private role: 'sender' | 'receiver' | null = null;
  private roomId: string = '';
  private peerId: string = '';
  private encryptionKey: CryptoKey | null = null;
  
  // File state
  private file: File | null = null;
  private fileMetadata: FileMetadata | null = null;
  
  // Transfer tracking
  private chunkHashes: ArrayBuffer[] = [];
  private currentChunkIndex = 0;
  private isTransferring = false;
  private isPaused = false;
  private statsInterval: any = null;
  private lastTransferredBytes = 0;
  private lastStatsTime = 0;
  private startTime = 0;
  private iceCandidatesQueue: RTCIceCandidateInit[] = [];
  
  // Callbacks
  public onConnectionState: (state: string) => void = () => {};
  public onPeerStatus: (connected: boolean) => void = () => {};
  public onStats: (stats: TransferStats) => void = () => {};
  public onMetadata: (metadata: FileMetadata) => void = () => {};
  public onComplete: (isSender: boolean, fileBlobUrl?: string) => void = () => {};
  public onError: (message: string) => void = () => {};

  private signalingUrl: string;

  constructor(signalingUrl: string) {
    this.signalingUrl = signalingUrl;
  }

  /**
   * Connects to the signaling server and joins a room.
   */
  public connect(roomId: string, role: 'sender' | 'receiver', keyStr?: string) {
    this.roomId = roomId;
    this.role = role;
    
    // Connect to signaling socket
    this.socket = io(this.signalingUrl);

    this.socket.on('connect', () => {
      console.log('[WebRTC] Connected to signaling server');
      this.socket?.emit('join-room', roomId);
      this.onConnectionState('connecting');
    });

    this.socket.on('room-peers', ({ peerIds }: { peerIds: string[] }) => {
      if (peerIds.length > 0) {
        this.peerId = peerIds[0];
        this.onPeerStatus(true);
        if (role === 'sender') {
          this.initiateConnection();
        }
      }
    });

    this.socket.on('peer-joined', ({ peerId }: { peerId: string }) => {
      console.log(`[WebRTC] Peer joined room: ${peerId}`);
      this.peerId = peerId;
      this.onPeerStatus(true);
      
      if (this.role === 'sender') {
        // Initiate connection when a receiver joins
        this.initiateConnection();
      }
    });

    this.socket.on('signal', async ({ senderId, data }: { senderId: string; data: any }) => {
      if (!this.peerId) {
        this.peerId = senderId;
        this.onPeerStatus(true);
      }
      if (senderId !== this.peerId) return;

      try {
        if (data.sdp) {
          await this.handleSdp(data.sdp);
        } else if (data.candidate) {
          await this.handleIceCandidate(data.candidate);
        }
      } catch (err: any) {
        console.error('[WebRTC] Signal handling error:', err);
        this.onError(`Negotiation error: ${err.message}`);
      }
    });

    this.socket.on('peer-disconnected', ({ peerId }: { peerId: string }) => {
      if (peerId === this.peerId) {
        console.log('[WebRTC] Peer disconnected');
        this.handlePeerDisconnect();
      }
    });

    // Import decryption key if receiver and key is provided
    if (role === 'receiver' && keyStr) {
      importKey(keyStr)
        .then(key => {
          this.encryptionKey = key;
        })
        .catch(err => {
          console.error('[WebRTC] Key import error:', err);
          this.onError('Invalid decryption key in URL');
        });
    }
  }

  /**
   * Configures a sender's file and encryption key.
   */
  public setSenderFile(file: File, key?: CryptoKey) {
    this.file = file;
    this.encryptionKey = key || null;
    
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    this.fileMetadata = {
      roomId: this.roomId,
      name: file.name,
      size: file.size,
      type: file.type,
      totalChunks,
      isComplete: false
    };
  }

  /**
   * Manually triggers sending file metadata to the receiver.
   * Useful when sending a subsequent file in the same room.
   */
  public sendMetadata() {
    if (this.dataChannel && this.dataChannel.readyState === 'open' && this.fileMetadata) {
      console.log('[WebRTC] Sender sending metadata');
      this.dataChannel.send(JSON.stringify({
        type: 'metadata',
        metadata: this.fileMetadata
      }));
    }
  }

  /**
   * Initiates the RTCPeerConnection (Sender side).
   */
  private initiateConnection() {
    this.onConnectionState('negotiating');
    this.createPeerConnection();
    
    if (!this.peerConnection) return;

    // Create a reliable RTCDataChannel
    this.dataChannel = this.peerConnection.createDataChannel('file-transfer', {
      ordered: true
    });
    this.setupDataChannelHandlers(this.dataChannel);

    // Create SDP offer
    this.peerConnection.createOffer()
      .then(offer => this.peerConnection?.setLocalDescription(offer))
      .then(() => {
        this.socket?.emit('signal', {
          targetId: this.peerId,
          data: { sdp: this.peerConnection?.localDescription }
        });
      })
      .catch(err => {
        this.onError(`Failed to create connection offer: ${err.message}`);
      });
  }

  /**
   * Instantiates standard WebRTC RTCPeerConnection object.
   */
  private createPeerConnection() {
    if (this.peerConnection) return;

    const rtcConfig: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    };

    this.peerConnection = new RTCPeerConnection(rtcConfig);

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket?.emit('signal', {
          targetId: this.peerId,
          data: { candidate: event.candidate }
        });
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState || 'disconnected';
      console.log(`[WebRTC] Connection State: ${state}`);
      this.onConnectionState(state);
      
      if (state === 'failed' || state === 'disconnected') {
        this.handlePeerDisconnect();
      }
    };

    if (this.role === 'receiver') {
      this.peerConnection.ondatachannel = (event) => {
        console.log('[WebRTC] DataChannel received');
        this.dataChannel = event.channel;
        this.setupDataChannelHandlers(this.dataChannel);
      };
    }
  }

  /**
   * Handles incoming SDP (Offer or Answer).
   */
  private async handleSdp(sdp: RTCSessionDescriptionInit) {
    this.createPeerConnection();
    
    if (!this.peerConnection) return;
    
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    
    if (sdp.type === 'offer') {
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      this.socket?.emit('signal', {
        targetId: this.peerId,
        data: { sdp: this.peerConnection.localDescription }
      });
    }

    // Process queued candidates
    for (const cand of this.iceCandidatesQueue) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        console.error('[WebRTC] Error adding queued ICE candidate:', e);
      }
    }
    this.iceCandidatesQueue = [];
  }

  /**
   * Handles incoming ICE Candidates.
   */
  private async handleIceCandidate(candidate: RTCIceCandidateInit) {
    if (this.peerConnection && this.peerConnection.remoteDescription) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('[WebRTC] Error adding ICE candidate:', e);
      }
    } else {
      this.iceCandidatesQueue.push(candidate);
    }
  }

  /**
   * Hooks data channel message, open, and close events.
   */
  private setupDataChannelHandlers(channel: RTCDataChannel) {
    channel.binaryType = 'arraybuffer';
    
    channel.onopen = () => {
      console.log('[WebRTC] DataChannel open');
      this.onConnectionState('connected');
      this.onPeerStatus(true);
      
      if (this.role === 'receiver') {
        console.log('[WebRTC] Receiver requesting metadata upon channel open');
        channel.send(JSON.stringify({
          type: 'request-metadata'
        }));
      }
    };

    channel.onclose = () => {
      console.log('[WebRTC] DataChannel closed');
      this.handlePeerDisconnect();
    };

    channel.onerror = (err) => {
      console.error('[WebRTC] DataChannel error:', err);
      this.onError('Data channel connection error occurred');
    };

    channel.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          await this.handleTextMessage(msg);
        } catch (e) {
          console.error('[WebRTC] Text parsing error:', e);
        }
      } else {
        await this.handleBinaryMessage(event.data);
      }
    };
  }

  /**
   * Processes incoming text signals over DataChannel.
   */
  private async handleTextMessage(msg: any) {
    if (msg.type === 'request-metadata') {
      if (this.role === 'sender' && this.fileMetadata) {
        console.log('[WebRTC] Sender sending metadata in response to request-metadata');
        this.dataChannel?.send(JSON.stringify({
          type: 'metadata',
          metadata: this.fileMetadata
        }));
      }
    } else if (msg.type === 'ready') {
      console.log(`[WebRTC] Receiver is ready. Resuming from chunk index: ${msg.lastIndex + 1}`);
      
      if (this.role === 'sender' && this.fileMetadata) {
        if (this.isTransferring) {
          if (msg.lastIndex === -1) {
            console.log('[WebRTC] Receiver requested a complete reset mid-transfer.');
            this.isTransferring = false;
            this.stopStatsTracking();
            setTimeout(() => {
              this.currentChunkIndex = 0;
              this.isTransferring = true;
              this.startStatsTracking();
              this.streamChunks();
            }, 50);
            return;
          }
          console.warn('[WebRTC] Received ready message but transfer is already active. Ignoring.');
          return;
        }

        this.currentChunkIndex = msg.lastIndex + 1;
        this.isTransferring = true;
        this.startStatsTracking();
        this.streamChunks();
      }
    } else if (msg.type === 'metadata') {
      console.log('[WebRTC] Received File Metadata:', msg.metadata);
      
      // Get existing metadata from IndexedDB
      const existingMeta = await getFileMetadata(this.roomId);
      let lastIdx = -1;
      
      if (existingMeta) {
        if (
          existingMeta.name === msg.metadata.name &&
          existingMeta.size === msg.metadata.size &&
          existingMeta.type === msg.metadata.type
        ) {
          // Same file! We check indices to resume.
          const indices = await getStoredChunkIndices(this.roomId);
          lastIdx = indices.length > 0 ? indices[indices.length - 1] : -1;
          console.log(`[WebRTC] Same file detected. Resuming from chunk index: ${lastIdx + 1}`);
        } else {
          // Different file! Clear old room data.
          console.log('[WebRTC] Different file detected. Clearing IndexedDB room data.');
          await clearRoomData(this.roomId);
          this.chunkHashes = [];
        }
      } else {
        // Clear just in case there are orphaned chunks under this roomId
        await clearRoomData(this.roomId);
        this.chunkHashes = [];
      }
      
      this.fileMetadata = msg.metadata;
      this.onMetadata(msg.metadata);
      
      // Save metadata locally in IndexedDB
      await saveFileMetadata({
        ...msg.metadata,
        isComplete: false
      });
      
      this.startStatsTracking();

      // Signal ready to sender, requesting starting index
      this.dataChannel?.send(JSON.stringify({
        type: 'ready',
        lastIndex: lastIdx
      }));
    } else if (msg.type === 'completed-verification') {
      // Sender notified receiver of the expected final SHA-256 hash
      if (this.role === 'receiver' && this.fileMetadata) {
        this.fileMetadata.hash = msg.hash;
        await saveFileMetadata(this.fileMetadata);
        await this.verifyAndFinalizeDownload();
      }
    }
  }

  /**
   * Processes incoming binary chunk messages.
   */
  private async handleBinaryMessage(buffer: ArrayBuffer) {
    if (this.role !== 'receiver' || !this.fileMetadata) return;

    // Parse Binary Header: ChunkIndex (4 bytes) + Length (4 bytes)
    const view = new DataView(buffer, 0, 8);
    const chunkIndex = view.getUint32(0);
    const length = view.getUint32(4);
    
    // Extract remaining bytes as E2EE payload
    const payload = buffer.slice(8, 8 + length);
    
    try {
      let chunkData: ArrayBuffer;
      
      if (this.encryptionKey) {
        // Decrypt E2EE payload
        chunkData = await decryptChunk(payload, this.encryptionKey);
      } else {
        chunkData = payload; // Decryption skipped (non-encrypted mode)
      }

      // Hash the decrypted chunk and record it for final SHA-256 validation
      const chunkHash = await hashSingleChunk(chunkData);
      this.chunkHashes[chunkIndex] = chunkHash;

      // Save chunk locally in IndexedDB
      await saveChunk(this.roomId, chunkIndex, chunkData);
      
      // Update statistics
      this.lastTransferredBytes += chunkData.byteLength;
      this.currentChunkIndex = chunkIndex;
      
      // Check if this was the last chunk
      if (chunkIndex === this.fileMetadata.totalChunks - 1) {
        console.log('[WebRTC] All chunks received. Waiting for final hash signature.');
      }
    } catch (err: any) {
      console.error(`[WebRTC] Chunk decryption/save failed at index ${chunkIndex}:`, err);
      this.onError(`Data integrity failure: ${err.message}`);
    }
  }

  /**
   * Slices file and writes encrypted chunks to data channel with flow control.
   */
  private async streamChunks() {
    if (!this.file || !this.dataChannel || !this.isTransferring || this.isPaused) return;

    // Register flow control callback
    this.dataChannel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_THRESHOLD / 2;
    this.dataChannel.onbufferedamountlow = () => {
      this.streamChunks();
    };

    while (this.currentChunkIndex < this.fileMetadata!.totalChunks) {
      // Check backpressure buffer
      if (this.dataChannel.bufferedAmount > BUFFERED_AMOUNT_THRESHOLD) {
        return; // Pause loop, wait for onbufferedamountlow
      }

      const start = this.currentChunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, this.file.size);
      const blobSlice = this.file.slice(start, end);

      try {
        // Read file slice in memory
        const rawChunk = await this.readBlobAsArrayBuffer(blobSlice);
        
        // Compute SHA-256 hash of plaintext chunk
        const chunkHash = await hashSingleChunk(rawChunk);
        this.chunkHashes[this.currentChunkIndex] = chunkHash;

        let payload: ArrayBuffer;
        if (this.encryptionKey) {
          // Encrypt plaintext chunk (prepend 12-byte IV)
          payload = await encryptChunk(rawChunk, this.encryptionKey);
        } else {
          payload = rawChunk; // Unencrypted stream fallback
        }

        // Create 8-byte Binary Header
        const header = new ArrayBuffer(8);
        const view = new DataView(header);
        view.setUint32(0, this.currentChunkIndex);
        view.setUint32(4, payload.byteLength);

        // Pack Header + Payload into single buffer
        const message = new Uint8Array(8 + payload.byteLength);
        message.set(new Uint8Array(header), 0);
        message.set(new Uint8Array(payload), 8);

        // Send over WebRTC Data Channel
        this.dataChannel.send(message.buffer);
        
        // Update local counts
        this.lastTransferredBytes += rawChunk.byteLength;
        this.currentChunkIndex++;
      } catch (err: any) {
        console.error(`[WebRTC] Failed to send chunk ${this.currentChunkIndex}:`, err);
        this.onError(`File read/send failure: ${err.message}`);
        return;
      }
    }

    // Complete transmission
    this.isTransferring = false;
    this.stopStatsTracking();
    
    // Hash-of-hashes validation
    console.log('[WebRTC] Calculating final SHA-256 validation hash...');
    const finalHash = await hashChunks(this.chunkHashes);
    console.log('[WebRTC] Sender calculated hash:', finalHash);
    
    // Inform receiver of the official verification hash
    this.dataChannel.send(JSON.stringify({
      type: 'completed-verification',
      hash: finalHash
    }));

    // Dispatch final 100% stats update
    if (this.file) {
      this.onStats({
        progress: 100,
        speed: 0,
        eta: 0,
        transferredBytes: this.file.size,
        totalBytes: this.file.size
      });
    }

    this.onComplete(true);
  }

  /**
   * Finalizes the downloaded chunks, verifies SHA-256 hash, and initiates local download.
   */
  private async verifyAndFinalizeDownload() {
    if (!this.fileMetadata || !this.fileMetadata.hash) return;
    
    this.stopStatsTracking();
    this.onConnectionState('verifying');

    try {
      // Re-compile hashes from all indices to verify integrity
      const orderedHashes: ArrayBuffer[] = [];
      for (let i = 0; i < this.fileMetadata.totalChunks; i++) {
        if (!this.chunkHashes[i]) {
          // Retrieve chunk from IndexedDB if not in memory (e.g. after reconnection)
          const data = await getChunk(this.roomId, i);
          if (!data) throw new Error(`Missing chunk index ${i}`);
          this.chunkHashes[i] = await hashSingleChunk(data);
        }
        orderedHashes.push(this.chunkHashes[i]);
      }

      const verifiedHash = await hashChunks(orderedHashes);
      console.log(`[WebRTC] Receiver calculated hash: ${verifiedHash}`);
      console.log(`[WebRTC] Expected hash signature:  ${this.fileMetadata.hash}`);

      if (verifiedHash !== this.fileMetadata.hash) {
        throw new Error('Cryptographic signature mismatch. The file may be corrupt.');
      }

      // Mark file complete in metadata
      this.fileMetadata.isComplete = true;
      await saveFileMetadata(this.fileMetadata);

      // Dispatch final 100% stats update
      this.onStats({
        progress: 100,
        speed: 0,
        eta: 0,
        transferredBytes: this.fileMetadata.size,
        totalBytes: this.fileMetadata.size
      });
      
      // Auto-trigger browser download
      this.onConnectionState('downloading');
      await triggerFileDownload(this.roomId, this.fileMetadata);
      
      this.onComplete(false);
      
      // Clear data from IndexedDB now that download has completed
      await clearRoomData(this.roomId);
    } catch (err: any) {
      console.error('[WebRTC] Reassembly or validation failure:', err);
      this.onError(`Data integrity check failed: ${err.message}`);
    }
  }

  /**
   * Helper utility to convert a Blob/Slice to ArrayBuffer.
   */
  private readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
  }

  /**
   * Runs an interval that computes throughput (MB/s) and ETA.
   */
  private startStatsTracking() {
    this.startTime = Date.now();
    this.lastStatsTime = this.startTime;
    this.lastTransferredBytes = 0;

    const totalBytes = this.fileMetadata?.size || 0;
    
    // Average speed tracking using simple rolling filter
    let speedEMA = 0;

    this.statsInterval = setInterval(() => {
      const now = Date.now();
      const deltaT = (now - this.lastStatsTime) / 1000; // seconds
      if (deltaT <= 0) return;

      const bytesSentOrReceived = this.lastTransferredBytes;
      this.lastTransferredBytes = 0; // reset window counter
      this.lastStatsTime = now;

      // Speed in MB/s
      const currentSpeed = (bytesSentOrReceived / (1024 * 1024)) / deltaT;
      
      if (speedEMA === 0) {
        speedEMA = currentSpeed;
      } else {
        speedEMA = 0.8 * speedEMA + 0.2 * currentSpeed; // Exponential Moving Average
      }

      // Calculate progress percentage
      const totalTransferred = this.role === 'sender'
        ? Math.min(this.currentChunkIndex * CHUNK_SIZE, totalBytes)
        : Math.min((this.chunkHashes.filter(Boolean).length) * CHUNK_SIZE, totalBytes);

      const progress = totalBytes > 0 ? (totalTransferred / totalBytes) * 100 : 0;

      // Calculate ETA
      const remainingBytes = totalBytes - totalTransferred;
      const speedInBytes = speedEMA * 1024 * 1024;
      const eta = speedInBytes > 0 ? Math.ceil(remainingBytes / speedInBytes) : 9999;

      this.onStats({
        progress: Math.min(progress, 100),
        speed: parseFloat(speedEMA.toFixed(2)),
        eta: progress >= 100 ? 0 : eta,
        transferredBytes: totalTransferred,
        totalBytes
      });
    }, 1000);
  }

  /**
   * Stops statistics interval logic.
   */
  private stopStatsTracking() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  /**
   * Handles peer disconnect by resetting connections and triggers potential re-negotiation.
   */
  private handlePeerDisconnect() {
    console.log('[WebRTC] Handling connection drop. Active progress paused.');
    this.stopStatsTracking();
    this.isTransferring = false;
    this.onPeerStatus(false);
    this.onConnectionState('disconnected');
    
    // Cleanup connection
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    
    // We do NOT call clearRoomData. This allows chunks to remain saved
    // in IndexedDB. If they reconnect, we can resume!
  }

  /**
   * Fully closes the connection, socket connection, and clears all resources.
   */
  public disconnect() {
    this.stopStatsTracking();
    this.isTransferring = false;
    
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.onConnectionState('disconnected');
    this.onPeerStatus(false);
  }
}
