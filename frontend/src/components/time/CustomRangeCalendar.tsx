// CustomRangeCalendar — Phase 26 Plan 03 (TIME-01).
//
// Dual-month range calendar at the bottom of the TimePicker Popover.
// Uses react-day-picker mode="range" (RESEARCH §"Don't Hand-Roll" — native
// <input type="date"> doesn't support range selection and the dual-month
// affordance can't be done without RDP). Outputs ABSOLUTE ISO timestamps
// on apply, NOT Grafana tokens — the user picked a specific window, not
// a rolling range.

import { useState } from 'react'
import { DayPicker, type DateRange } from 'react-day-picker'
import 'react-day-picker/style.css'

interface Props {
  onApply: (timeFrom: string, timeTo: string) => void
}

export function CustomRangeCalendar({ onApply }: Props) {
  const [range, setRange] = useState<DateRange | undefined>(undefined)

  function apply() {
    if (!range?.from || !range?.to) return
    onApply(range.from.toISOString(), range.to.toISOString())
  }

  return (
    <div className="cmc-time-picker__calendar" data-testid="time-picker-calendar">
      <DayPicker
        mode="range"
        numberOfMonths={2}
        selected={range}
        onSelect={setRange}
      />
      <button
        type="button"
        className="cmc-btn cmc-time-picker__custom-apply"
        data-testid="time-picker-custom-apply"
        onClick={apply}
        disabled={!range?.from || !range?.to}
      >
        Apply custom range
      </button>
    </div>
  )
}
