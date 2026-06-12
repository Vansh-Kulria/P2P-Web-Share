# P2P Web Share

A lightweight, decentralized, and secure peer-to-peer (P2P) file sharing web application. Files are streamed directly from browser-to-browser via WebRTC data channels with zero server-side storage.

## Deployed Links
* **Frontend Client (Vercel):** [https://p2p-web-share.vercel.app](https://p2p-web-share.vercel.app)
* **Signaling Backend (Render/Heroku/etc.):** [https://p2p-web-share-backend.onrender.com](https://p2p-web-share-backend.onrender.com) (or your signaling URL)

---

## Architecture & Technical Features

### 1. Zero-Knowledge E2EE (AES-GCM)
* Files are encrypted client-side using the Web Crypto API.
* The 256-bit AES-GCM encryption key is appended to the room URL as a hash fragment (`#key=...`).
* **Security:** Browser hash fragments are never sent to the signaling server, guaranteeing that the central hub has zero knowledge of the file content, file metadata, or decryption keys.

### 2. Large File Transfers & Local Storage (IndexedDB)
* Slices files into 64KB chunks and buffers them locally using an IndexedDB schema (`metadata` and `chunks` object stores).
* Prevents browser memory exhaustion, allowing transfers of files larger than 500MB.

### 3. Handshake Flow (Race-Free Pull Model)
To avoid standard WebRTC handshake races where metadata is sent before data channel event listeners bind on the receiver side:
1. **Connection established:** The data channel opens.
2. **Metadata Request:** The receiver sends a `request-metadata` signal to the sender.
3. **Metadata Transmission:** The sender responds with the metadata object.
4. **Collision Check:** The receiver compares the metadata with any existing metadata in IndexedDB. If the room is being reused for a new file, it clears old chunks (`clearRoomData`) and signals `ready` from index `0`. Otherwise, it resumes from the last stored chunk index.
5. **Stream:** Chunks are read, encrypted, and streamed over WebRTC with flow-control backpressure limits.

### 4. Minimalist Interface
* High-contrast monochromatic layout following a clean Swiss editorial aesthetic.
* Fully collapsible debug console log viewer.
* Real-time transfer statistics (throughput via exponential moving average, ETA, progress).

---

<img width="3837" height="1662" alt="image" src="https://github.com/user-attachments/assets/a1827e6c-10d0-4a8b-b614-c00ef696fe91" />


## Local Development Setup

### Prerequisite
* [Node.js](https://nodejs.org/) (v16+ recommended)
* npm

### Step 1: Install Dependencies
Run the install command in both directories:
```bash
# Install backend signaling dependencies
cd backend
npm install

# Install frontend UI dependencies
cd ../frontend
npm install
```

### Step 2: Configure Environment Variables
Create a `.env` file in the `frontend` directory:
```env
VITE_SIGNALING_URL=http://localhost:4000
```

### Step 3: Run the Servers
Start both servers in development mode:

**Terminal 1 (Backend signaling server):**
```bash
cd backend
npm run dev
# Server will run on http://localhost:4000
```

**Terminal 2 (Frontend Client):**
```bash
cd frontend
npm run dev
# Client will run on http://localhost:5173
```

---

## Production Build
To generate a production-ready client build:
```bash
cd frontend
npm run build
```
This builds static assets into `frontend/dist`, which can be deployed to Vercel, Netlify, or similar platforms.
