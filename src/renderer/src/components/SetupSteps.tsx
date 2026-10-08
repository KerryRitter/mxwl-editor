import { Check } from 'lucide-react'

export function SetupSteps({
  steps,
  current
}: {
  steps: string[]
  current: number
}): JSX.Element {
  return (
    <ol
      aria-label="Setup progress"
      className="mb-5 flex gap-2 border-b border-neutral-800 pb-4"
    >
      {steps.map((label, index) => (
        <li
          key={label}
          aria-current={index === current ? 'step' : undefined}
          className={`flex min-w-0 flex-1 items-center gap-2 text-[11px] ${index === current ? 'text-emerald-300' : 'text-neutral-600'}`}
        >
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${index <= current ? 'border-emerald-600/70 bg-emerald-500/10' : 'border-neutral-700'}`}
          >
            {index < current ? <Check size={11} /> : index + 1}
          </span>
          <span className="truncate">{label}</span>
        </li>
      ))}
    </ol>
  )
}
