import { ShareRoom } from './components/ShareRoom'

function App() {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#09090B]">
      {/* Header */}
      <header className="w-full py-4 px-6 border-b border-neutral-900 bg-black flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="px-2 py-0.5 rounded bg-white flex items-center justify-center font-bold text-black text-[10px] font-mono">
            P2P
          </div>
          <span className="font-bold tracking-wider text-neutral-200 text-xs font-mono">SHARE</span>
        </div>
        <div className="text-[10px] text-neutral-500 font-medium font-mono uppercase tracking-wider">
          Direct & Encrypted
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex items-center justify-center bg-black/20">
        <ShareRoom />
      </main>

      {/* Footer */}
      <footer className="w-full py-4 border-t border-neutral-900 bg-black text-center text-[9px] text-neutral-600 font-mono tracking-wider uppercase">
        P2P Share &bull; Browser to Browser &bull; Zero Server Storage
      </footer>
    </div>
  )
}

export default App
