'use client'

export default function Ticker({ items }) {
  if (!items || items.length === 0) return null

  // Duplicate the list so the scroll loops seamlessly.
  const loop = [...items, ...items]

  return (
    <div className="w-full bg-green-800 text-white overflow-hidden">
      <div className="ticker-track whitespace-nowrap py-2 text-sm">
        {loop.map((item, i) => (
          <span key={i} className="inline-block px-6">
            <span className="font-medium">{item.product}</span>
            <span className="opacity-70"> · {item.market} · </span>
            <span className="font-semibold">{item.price}</span>
          </span>
        ))}
      </div>

      <style>{`
        .ticker-track {
          display: inline-block;
          animation: ticker-scroll 80s linear infinite;
        }
        .ticker-track:hover {
          animation-play-state: paused;
        }
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}