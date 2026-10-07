import { useWindowDimensions } from 'react-native';

import { breakpoints } from '@/theme/tokens';

export interface LayoutInfo {
  width: number;
  /** Tablet / small desktop: two-column content where useful. */
  isTablet: boolean;
  /** Desktop: sidebar navigation and multi-column layouts. */
  isDesktop: boolean;
}

export function useLayout(): LayoutInfo {
  const { width } = useWindowDimensions();
  return { width, isTablet: width >= breakpoints.tablet, isDesktop: width >= breakpoints.desktop };
}

/** Maximum width of the main content column on large screens. */
export const CONTENT_MAX_WIDTH = 1180;
