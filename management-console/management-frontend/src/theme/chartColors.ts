// Literal hex/rgba strings for Recharts SVG props (CSS custom properties
// aren't reliably readable by every Recharts internal). Kept in lockstep
// with theme/tokens.ts and index.css — do not drift these apart.
//
// The fraud/transaction "outcome" triad needs a third color beyond mobile's
// success/error pair. Brand yellow (#FFCB05) is too close to itself in hue to
// double as both the brand accent and a status color, and fails contrast/CVD
// checks against the error red. #B8860B (dark goldenrod) is used instead for
// "review" — always paired with a text label/legend, never color alone.

export const ChartColors = {
  outcome: {
    approved: '#27AE60', // = Colors.success
    review: '#B8860B', // new: not in mobile palette, see note above
    rejected: '#C0392B', // = Colors.error
  },
  riskLine: '#101114', // = Colors.secondary
  volumeBar: '#FFCB05', // = Colors.primary
  grid: '#E0DDD6', // = Colors.border
  axisText: '#5C574E', // = Colors.textSecondary

  riskBand: {
    low: 'rgba(39,174,96,0.08)',
    medium: 'rgba(184,134,11,0.08)',
    high: 'rgba(192,57,43,0.08)',
  },
} as const
