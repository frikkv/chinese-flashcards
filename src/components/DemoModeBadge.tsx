import { DEMO_AUTH } from '#/lib/demo-auth'

export function DemoModeBadge() {
  if (!DEMO_AUTH) return null

  return (
    <div className="fixed top-3 right-3 z-50 flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-white shadow-lg">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-200" />
      </span>
      Demo Mode
    </div>
  )
}
