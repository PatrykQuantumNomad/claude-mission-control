// Pure helper for ActivityHeatmap — maps a (value, max) pair to one of five
// color buckets used to tint individual heatmap cells. Bucket thresholds are
// percentage-of-max so the panel auto-scales to whatever cadence of session
// activity the operator currently produces.
//
// Token choice: styles.css defines a single var(--cmc-accent-blue) (no
// status-green-2..5 token ladder). Per implementation §Step 1, fall back to the
// blue accent with progressive opacity. Zero-value cells use the surface-2
// neutral so the calendar negative space stays visually quiet.

const ZERO_BG = 'var(--cmc-surface-2)'

// Progressive opacity steps — kept as RGBA literals (no opacity token in
// styles.css) so the bucket math stays inside this single helper. Mirrors
// the GitHub-contribution-graph 4-tone gradient.
const BLUE_LOW = 'rgba(77, 124, 255, 0.25)'
const BLUE_MID = 'rgba(77, 124, 255, 0.45)'
const BLUE_HIGH = 'rgba(77, 124, 255, 0.7)'
const BLUE_TOP = 'rgba(77, 124, 255, 1)'

/**
 * Returns a CSS color string for a heatmap cell given its value and the grid
 * max. Buckets: 0 / 1-25% / 25-50% / 50-75% / 75-100% of max. Max=0 returns
 * the zero color regardless of value (defensive — a true zero-everywhere
 * grid renders flat surface).
 */
export function heatmapColorScale(value: number, max: number): string {
  if (value <= 0 || max <= 0) return ZERO_BG
  const pct = value / max
  if (pct <= 0.25) return BLUE_LOW
  if (pct <= 0.5) return BLUE_MID
  if (pct <= 0.75) return BLUE_HIGH
  return BLUE_TOP
}
