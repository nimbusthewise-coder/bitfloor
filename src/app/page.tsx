import AvatarGenerator from "@/components/AvatarGenerator";

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white font-mono">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-white">
        <div className="flex gap-4 text-sm">
          <span>File</span>
          <span>Edit</span>
          <span>About</span>
        </div>
        <div className="text-sm">
          {new Date().toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })}
        </div>
      </header>

      {/* Main content */}
      <main className="flex flex-col items-center justify-center py-16 gap-8">
        <h1 className="text-2xl tracking-wider">BITFLOOR</h1>
        <p className="text-sm text-gray-400 max-w-md text-center">
          A pixel-art digital office where humans and AI agents coexist.
        </p>

        {/* Avatar Generator */}
        <div className="bg-white text-black p-6 border border-white">
          <div className="text-center mb-4 text-sm tracking-wider">
            IDENTITY GENERATOR
          </div>
          <AvatarGenerator size={192} />
        </div>

        <p className="text-xs text-gray-500">Click the avatar or buttons to generate</p>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 px-4 py-2 border-t border-white/20 text-xs text-gray-500 text-center">
        bitfloor.ai — coming soon
      </footer>
    </div>
  );
}
