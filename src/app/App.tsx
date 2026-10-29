import { GraduationCap } from 'lucide-react'

export default function App() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-slate-50 p-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="max-w-md text-center">
        <GraduationCap className="mx-auto mb-4 h-12 w-12 text-indigo-500" aria-hidden="true" />
        <h1 className="text-3xl font-semibold tracking-tight">College Hub</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Scaffold is ready. Hero banner comes next.
        </p>
      </div>
    </main>
  )
}
