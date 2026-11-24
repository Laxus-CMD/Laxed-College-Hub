import type { MouseEvent } from 'react'
import { ArrowRight, Play } from 'lucide-react'
import type { NextClass } from '@/types'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Chip'
import { navigate } from '@/lib/route'
import { dayDiff, describeDay, formatClock, formatDuration, formatShortDate, toMinutes, WEEKDAY_NAMES } from '@/lib/time'
import { useFocusLauncher, type LaunchOptions } from '@/features/pomodoro/focusLauncher'
import { useLastSession, type StudySession } from '@/features/study/studyLog'
import { useCourseMap } from '@/store/selectors'
import { useTaskStore } from '@/store/useTaskStore'

/** When a past session ended, in words: "Today at 3:40 PM", "Yesterday at…", "Monday at…", "Oct 3". */
function whenEnded(at: Date, now: Date): string {
  const days = dayDiff(now, at)
  const time = formatClock(at.getHours() * 60 + at.getMinutes())
  if (days <= 0) return `Today at ${time}`
  if (days === 1) return `Yesterday at ${time}`
  if (days < 7) return `${WEEKDAY_NAMES[at.getDay()]} at ${time}`
  return formatShortDate(at)
}

/**
 * The hero's study mode: a calm place to start studying, pick up the last session, or,
 * once every task is done, permission to rest. Tasks, the schedule and study history are
 * read separately and never inferred from one another.
 */
export function StudyLaunchpad({ now, next }: { now: Date; next: NextClass | null }) {
  const courses = useCourseMap()
  const tasks = useTaskStore((s) => s.tasks)
  const last = useLastSession()
  const launch = useFocusLauncher((s) => s.launch)

  // "All done" needs tasks to have existed. Nobody has finished an empty list.
  const rest = tasks.length > 0 && tasks.every((t) => t.done)
  const study = (options: Omit<LaunchOptions, 'returnTo'>) => (e: MouseEvent<HTMLButtonElement>) =>
    launch?.({ ...options, returnTo: e.currentTarget })
  const nextCourse = next ? courses.get(next.session.courseId) : undefined

  return (
    <section
      aria-label="Right now"
      className="@container relative flex min-h-[248px] flex-col rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6"
    >
      <div className="grid flex-1 gap-5 @xl:grid-cols-[minmax(0,1.3fr)_minmax(15rem,1fr)] @xl:gap-0">
        {/* Start, or rest. */}
        <div key={rest ? 'rest' : 'study'} className="flex min-w-0 flex-col motion-safe:animate-[fade-in_.45s_var(--ease-apple)] @xl:pr-8">
          <p className="text-[11.5px] font-semibold tracking-[0.14em] text-accent uppercase">Study mode</p>
          {rest ? (
            <>
              <h2 className="mt-4 text-[clamp(26px,5.4cqi,34px)] leading-[1.1] font-semibold tracking-[-0.03em]">Great job! Get some rest.</h2>
              <p className="mt-2 max-w-[34ch] text-[15px] text-muted">Every task on your list is done. A break now makes tomorrow easier.</p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <Button disabled={!launch} onClick={study({})}>
                  Study anyway
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2 className="mt-4 text-[clamp(26px,5.4cqi,34px)] leading-[1.1] font-semibold tracking-[-0.03em]">A little time for yourself.</h2>
              <p className="mt-2 max-w-[34ch] text-[15px] text-muted">Pick up where you left off or start something new.</p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <Button variant="primary" size="lg" className="px-5" disabled={!launch} onClick={study({})}>
                  <Play className="size-4" fill="currentColor" aria-hidden="true" />
                  Start studying
                </Button>
                <Button size="lg" className="px-5" onClick={() => navigate('assignments')}>
                  Open tasks
                </Button>
              </div>
            </>
          )}
          {/* The schedule, exactly as before: the next class, or none this week. */}
          <p className="mt-auto flex flex-wrap items-center gap-2.5 pt-6 text-[13px] text-muted">
            {next ? (
              <>
                <Pill>{nextCourse?.code ?? 'Class'}</Pill>
                <span>
                  Next class {describeDay(next.start, now).toLowerCase()} at {formatClock(toMinutes(next.session.start))}
                </span>
              </>
            ) : (
              <span>No classes on the schedule this week.</span>
            )}
          </p>
        </div>

        {/* Continue, from real history only. */}
        <div className="flex min-w-0 flex-col border-t border-line pt-5 @xl:border-t-0 @xl:border-l @xl:pt-0 @xl:pl-8">
          {last ? <LastSession session={last} now={now} onContinue={study({ task: last.task })} canContinue={!!launch} /> : <FirstSession />}
        </div>
      </div>
    </section>
  )
}

function LastSession({ session, now, onContinue, canContinue }: { session: StudySession; now: Date; onContinue: (e: MouseEvent<HTMLButtonElement>) => void; canContinue: boolean }) {
  const minutes = Math.max(1, Math.round(session.focusMs / 60_000))
  return (
    <>
      <h3 className="text-[11.5px] font-semibold tracking-[0.14em] text-muted uppercase">Continue where you left off</h3>
      <p className="mt-4 line-clamp-2 text-[17px] leading-snug font-semibold tracking-[-0.01em] break-words">{session.task ?? 'Focus session'}</p>
      <p className="mt-1.5 text-[13px] text-muted">
        {formatDuration(minutes)} of focus · {whenEnded(new Date(session.endedAt), now)}
      </p>
      <div className="mt-auto pt-5">
        <Button variant="ghost" className="group" disabled={!canContinue} onClick={onContinue} aria-label={`Continue: ${session.task ?? 'focus session'}`}>
          Continue
          <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
        </Button>
      </div>
    </>
  )
}

function FirstSession() {
  return (
    <>
      <h3 className="text-[11.5px] font-semibold tracking-[0.14em] text-muted uppercase">Your study sessions</h3>
      <p className="mt-4 text-[17px] leading-snug font-semibold tracking-[-0.01em]">Nothing to pick up yet</p>
      <p className="mt-1.5 max-w-[30ch] text-[13px] text-muted">
        Finish a focus session and it will wait here, so you can continue where you left off.
      </p>
    </>
  )
}
