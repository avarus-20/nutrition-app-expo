/**
 * Design tokens. Components read colors from the active theme only; raw hex
 * values must not appear outside this file. Contrast of text/background
 * pairs is at least 4.5:1 (WCAG AA) in both schemes.
 */
export interface ColorTokens {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryText: string;
  primarySoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  success: string;
  focus: string;
  overlay: string;
  protein: string;
  carbs: string;
  fat: string;
  water: string;
  calories: string;
}

export const lightColors: ColorTokens = {
  background: '#F5F7F5',
  surface: '#FFFFFF',
  surfaceAlt: '#EDF1EE',
  border: '#D5DDD7',
  text: '#16201A',
  textMuted: '#55635A',
  primary: '#1F7A3D',
  primaryText: '#FFFFFF',
  primarySoft: '#DDF0E3',
  danger: '#B3261E',
  dangerSoft: '#FBE4E2',
  warning: '#8A5A00',
  success: '#1F7A3D',
  focus: '#2A5BD7',
  overlay: 'rgba(0,0,0,0.45)',
  protein: '#3559C7',
  carbs: '#B26A00',
  fat: '#A8327A',
  water: '#1F78B4',
  calories: '#1F7A3D',
};

export const darkColors: ColorTokens = {
  background: '#0F1411',
  surface: '#18201B',
  surfaceAlt: '#212B25',
  border: '#33413A',
  text: '#E9EFEA',
  textMuted: '#A3B1A8',
  primary: '#5CC27E',
  primaryText: '#08130C',
  primarySoft: '#1E3A28',
  danger: '#FF8A80',
  dangerSoft: '#3D1E1C',
  warning: '#F2C14E',
  success: '#5CC27E',
  focus: '#8AB4FF',
  overlay: 'rgba(0,0,0,0.6)',
  protein: '#8EA8FF',
  carbs: '#F2B35B',
  fat: '#F08BC8',
  water: '#6BC0F5',
  calories: '#5CC27E',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

export const typography = {
  title: { fontSize: 26, fontWeight: '700', lineHeight: 32 },
  heading: { fontSize: 20, fontWeight: '700', lineHeight: 26 },
  subheading: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 21 },
  small: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  number: { fontSize: 32, fontWeight: '700', lineHeight: 38 },
} as const;

/** Layout breakpoints (dp / CSS px). */
export const breakpoints = { tablet: 700, desktop: 1000 } as const;

/** Minimum touch target (WCAG 2.5.5 / platform guidelines). */
export const MIN_TOUCH = 44;

export interface Theme {
  scheme: 'light' | 'dark';
  colors: ColorTokens;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
}

export const lightTheme: Theme = { scheme: 'light', colors: lightColors, spacing, radius, typography };
export const darkTheme: Theme = { scheme: 'dark', colors: darkColors, spacing, radius, typography };
