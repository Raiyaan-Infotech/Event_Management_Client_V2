/**
 * Features that are built but switched off.
 *
 * VIDEO_EDITOR — Gallery "Edit Video / Shorts" (web gallery design 03, 2026-11-06). A full
 * server re-encode with text drawn into the picture; too heavy for Render's free plan.
 * Off = nothing of it is shown anywhere. To switch it on (paid server): set
 * `NEXT_PUBLIC_VIDEO_EDITOR_ENABLED=true` here (Vercel) AND `VIDEO_EDITOR_ENABLED=true` on the
 * backend (Render), add the fonts (backend assets/fonts/README.md), redeploy both. session.md 8g.
 */
export const VIDEO_EDITOR_ENABLED = process.env.NEXT_PUBLIC_VIDEO_EDITOR_ENABLED === 'true';
