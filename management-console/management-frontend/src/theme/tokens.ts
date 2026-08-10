// Ported from mobile/src/theme/{colors,typography,spacing}.ts so the
// management console shares the mobile app's MTN visual identity.

export const Colors = {
  primary: '#FFCB05',
  primaryHover: '#F2BF00',
  primaryShadow: 'rgba(255,203,5, 0.42)',
  secondary: '#101114',
  background: '#FBF7EE',
  surface: '#FFFFFF',
  text: '#14110C',
  textSecondary: '#5C574E',
  textLight: '#8B9099',
  border: '#E0DDD6',
  borderLight: '#F0DE9C',
  error: '#C0392B',
  errorBg: '#FEE9E7',
  success: '#27AE60',
} as const

export const Typography = {
  fontFamily: 'Figtree, system-ui, sans-serif',
  sizes: { xs: 12, sm: 14, md: 16, lg: 20, xl: 24, xxl: 32 },
  weights: { regular: 400, medium: 500, semibold: 600, bold: 700, black: 800 },
  lineHeights: { tight: 1.15, normal: 1.35, relaxed: 1.45 },
} as const

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const

export const Radius = {
  pill: 27,
  card: 16,
  input: 10,
} as const
