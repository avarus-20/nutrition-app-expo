/** Longest edge after compression: enough for review and AI estimation, ~150–400 KB as JPEG. */
export const MAX_PHOTO_EDGE = 1600;
export const PHOTO_QUALITY = 0.7;

/** Size that fits within `maxEdge` keeping the aspect ratio; never upscales. */
export function targetSize(width: number, height: number, maxEdge = MAX_PHOTO_EDGE): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: maxEdge, height: maxEdge };
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
