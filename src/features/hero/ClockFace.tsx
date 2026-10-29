interface ClockFaceProps {
  now: Date
  /** Highlight the stretch of the dial between two times, in minutes after midnight. */
  arc?: { from: number; to: number } | null
  className?: string
}

const CX = 120
const CY = 120

function point(deg: number, r: number): [number, number] {
  const rad = (deg * Math.PI) / 180
  return [CX + r * Math.sin(rad), CY - r * Math.cos(rad)]
}

const dial = (minutes: number) => ((minutes % 720) / 720) * 360

/** A clock that bleeds off the corner of the hero. Hands show the time and the arc marks a class. */
export function ClockFace({ now, arc, className }: ClockFaceProps) {
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
  const hour = point(dial(nowMin), 60)
  const minute = point((nowMin % 60) * 6, 90)

  let arcPath: string | null = null
  if (arc) {
    const a1 = dial(arc.from)
    const sweep = (dial(arc.to) - a1 + 360) % 360
    if (sweep > 0.5) {
      const [x1, y1] = point(a1, 104)
      const [x2, y2] = point(dial(arc.to), 104)
      arcPath = `M${x1.toFixed(2)} ${y1.toFixed(2)} A104 104 0 ${sweep > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
    }
  }

  return (
    <svg viewBox="0 0 240 240" aria-hidden="true" className={className}>
      <circle cx={CX} cy={CY} r={104} fill="none" stroke="rgb(0 0 0 / 0.26)" strokeWidth={12} />
      {Array.from({ length: 12 }, (_, i) => {
        const [x1, y1] = point(i * 30, 88)
        const [x2, y2] = point(i * 30, i % 3 === 0 ? 76 : 82)
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgb(0 0 0 / 0.28)" strokeWidth={4} strokeLinecap="round" />
        )
      })}
      {arcPath ? (
        <path d={arcPath} fill="none" stroke="#a58bff" strokeWidth={12} strokeLinecap="round" opacity={0.85} />
      ) : null}
      <line x1={CX} y1={CY} x2={hour[0]} y2={hour[1]} stroke="rgb(0 0 0 / 0.34)" strokeWidth={11} strokeLinecap="round" />
      <line x1={CX} y1={CY} x2={minute[0]} y2={minute[1]} stroke="rgb(0 0 0 / 0.34)" strokeWidth={8} strokeLinecap="round" />
      <circle cx={CX} cy={CY} r={9} fill="rgb(0 0 0 / 0.4)" />
    </svg>
  )
}
