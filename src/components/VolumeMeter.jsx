export default function VolumeMeter({ level }) {
  // level ~ 0..1 (RMS). Scale to look responsive.
  const pct = Math.min(100, level * 250)
  const bars = 20
  const active = Math.round((pct / 100) * bars)
  return (
    <div className="flex items-center gap-1 h-6">
      {Array.from({ length: bars }).map((_, i) => {
        const on = i < active
        const color = i < bars * 0.6 ? 'bg-green-500' : i < bars * 0.85 ? 'bg-yellow-500' : 'bg-red-500'
        return (
          <div
            key={i}
            className={`w-2 h-full rounded-sm transition-opacity ${on ? color : 'bg-slate-200'}`}
            style={{ opacity: on ? 1 : 0.4 }}
          />
        )
      })}
    </div>
  )
}
