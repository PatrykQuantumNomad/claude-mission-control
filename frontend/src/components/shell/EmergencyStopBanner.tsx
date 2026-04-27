// EmergencyStopBanner — TPNL-05. Inline 2-step arm-and-confirm button mounted
// globally in NavBar (visible from boot on every route).
//
// State machine (Pitfall 1 — RESEARCH §Pattern 3):
//   idle    -> click -> armed     (start 5_000ms re-disarm timer)
//   armed   -> click -> firing    (POST /api/system/emergency-stop)
//   armed   -> 5_000ms timer fires -> idle (auto-rearm; user must reconfirm intent)
//   firing  -> mutation onSettled -> idle
//   engaged (server flag === '1') -> click -> POST /api/system/emergency-resume
//
// React 19 StrictMode double-invoke (Pitfall: STATE.md L196):
//   - All setTimeout calls go through armTimerRef.current
//   - useEffect cleanup ALWAYS clears the ref on unmount
//   - The armTimer is reset on every transition INTO armed (re-arming would
//     leak the prior timer otherwise)
//
// Reads /api/system/state?key=emergency_stop at 5_000ms via useSystemState
// (cadence locked in lib/queries.ts; banner does NOT inline refetchInterval).
// Writes go through useEmergencyStop / useEmergencyResume mutations which
// invalidate the system_state key on settle so the banner reflects remote
// truth within one polling tick.

import { useEffect, useRef, useState } from 'react'
import {
  useEmergencyResume,
  useEmergencyStop,
  useSystemState,
} from '../../lib/queries'

type EstopState = 'idle' | 'armed' | 'firing'

export function EmergencyStopBanner() {
  const [state, setState] = useState<EstopState>('idle')
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flag = useSystemState('emergency_stop')
  const stopMut = useEmergencyStop()
  const resumeMut = useEmergencyResume()

  // SystemStateResponse.items is Record<string, unknown>; the backend returns
  // emergency_stop as the literal '1' / '0' string per Plan 04-01 schema.
  const engaged =
    (flag.data?.items?.emergency_stop as unknown as string | undefined) === '1'

  function clearArmTimer() {
    if (armTimerRef.current !== null) {
      clearTimeout(armTimerRef.current)
      armTimerRef.current = null
    }
  }

  // Cleanup on unmount — Pitfall: StrictMode double-mount in dev would leak
  // a stray timer from the first mount otherwise.
  useEffect(() => {
    return clearArmTimer
  }, [])

  function handleClick() {
    if (engaged) {
      // Engaged path: clicking the banner resumes (clears the kill flag).
      resumeMut.mutate()
      return
    }
    if (state === 'idle') {
      setState('armed')
      clearArmTimer()
      armTimerRef.current = setTimeout(() => {
        setState('idle')
        armTimerRef.current = null
      }, 5_000)
      return
    }
    if (state === 'armed') {
      clearArmTimer()
      setState('firing')
      stopMut.mutate(undefined, {
        onSettled: () => setState('idle'),
      })
      return
    }
    // state === 'firing' — already in flight; ignore additional clicks.
  }

  // Visual state class composition. `engaged` overrides the local state
  // machine because the server flag is the source of truth.
  const variantClass = engaged
    ? 'cmc-estop--engaged'
    : state === 'armed'
      ? 'cmc-estop--armed'
      : state === 'firing'
        ? 'cmc-estop--firing'
        : 'cmc-estop--idle'

  const label = engaged
    ? 'Emergency stop ENGAGED — click to resume'
    : state === 'idle'
      ? 'Emergency stop'
      : state === 'armed'
        ? 'Click again to confirm'
        : 'Stopping…'

  // Disable while the firing mutation is in flight OR while the resume
  // mutation is in flight (engaged path).
  const disabled =
    state === 'firing' || stopMut.isPending || resumeMut.isPending

  return (
    <button
      type="button"
      className={`cmc-estop ${variantClass}`}
      aria-pressed={engaged}
      aria-label={
        engaged
          ? 'Emergency stop is engaged. Click to resume.'
          : state === 'armed'
            ? 'Emergency stop armed. Click again to confirm.'
            : 'Emergency stop'
      }
      onClick={handleClick}
      disabled={disabled}
      data-state={state}
      data-engaged={engaged ? 'true' : 'false'}
    >
      {label}
    </button>
  )
}
