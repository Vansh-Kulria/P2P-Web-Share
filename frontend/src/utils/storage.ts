// IndexedDB-based local chunk storage for supporting large files (>500MB) and connection resumption

const DB_NAME = 'P2PWebShareDB';
const DB_VERSION = 1;

export interface FileMetadata {
  roomId: string;
  name: string;
  size: number;
  type: string;
  totalChunks: number;
  hash?: string;
  isComplete: boolean;
}

/**
 * Initializes the IndexedDB database.
 */
function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = () => {
      const db = request.result;
      
      // Store file metadata
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'roomId' });
      }
      
      // Store file chunks
      if (!db.objectStoreNames.contains('chunks')) {
        // Compound key [roomId, chunkIndex]
        const chunkStore = db.createObjectStore('chunks', { keyPath: ['roomId', 'chunkIndex'] });
        chunkStore.createIndex('roomId', 'roomId', { unique: false });
      }
    };
  });
}

/**
 * Saves file metadata.
 */
export async function saveFileMetadata(metadata: FileMetadata): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('metadata', 'readwrite');
    const store = transaction.objectStore('metadata');
    const request = store.put(metadata);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieves file metadata.
 */
export async function getFileMetadata(roomId: string): Promise<FileMetadata | null> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('metadata', 'readonly');
    const store = transaction.objectStore('metadata');
    const request = store.get(roomId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves a decrypted file chunk.
 */
export async function saveChunk(
  roomId: string,
  chunkIndex: number,
  chunkData: ArrayBuffer
): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chunks', 'readwrite');
    const store = transaction.objectStore('chunks');
    const request = store.put({
      roomId,
      chunkIndex,
      data: chunkData,
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieves a specific file chunk.
 */
export async function getChunk(
  roomId: string,
  chunkIndex: number
): Promise<ArrayBuffer | null> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chunks', 'readonly');
    const store = transaction.objectStore('chunks');
    const request = store.get([roomId, chunkIndex]);

    request.onsuccess = () => {
      resolve(request.result ? request.result.data : null);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Gets the list of stored chunk indices for a room (for resumption checks).
 */
export async function getStoredChunkIndices(roomId: string): Promise<number[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chunks', 'readonly');
    const store = transaction.objectStore('chunks');
    const index = store.index('roomId');
    const request = index.getAll(roomId); // Get all chunks for this roomId

    request.onsuccess = () => {
      const chunks = request.result || [];
      const indices = chunks.map((c: any) => c.chunkIndex);
      resolve(indices.sort((a, b) => a - b));
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Deletes all chunks and metadata associated with a room.
 */
export async function clearRoomData(roomId: string): Promise<void> {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(['metadata', 'chunks'], 'readwrite');
    
    // Clear metadata
    transaction.objectStore('metadata').delete(roomId);
    
    // Clear chunks
    const chunkStore = transaction.objectStore('chunks');
    const index = chunkStore.index('roomId');
    const request = index.openCursor(IDBKeyRange.only(roomId));
    
    request.onsuccess = (event: any) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Reassembles chunks from IndexedDB and triggers browser file download.
 */
export async function triggerFileDownload(
  roomId: string,
  metadata: FileMetadata
): Promise<void> {
  // 1. Gather all chunks
  const chunks: BlobPart[] = [];
  for (let i = 0; i < metadata.totalChunks; i++) {
    const chunk = await getChunk(roomId, i);
    if (!chunk) {
      throw new Error(`Missing chunk ${i} during reassembly`);
    }
    chunks.push(chunk);
  }
  
  // 2. Assemble Blob and download
  const blob = new Blob(chunks, { type: metadata.type || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = metadata.name;
  document.body.appendChild(a);
  a.click();
  
  // Cleanup
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Checks if File System Access API is supported.
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}
