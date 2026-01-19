/**
 * ScannerBeam - Simple CSS vertical separator line
 *
 * A thin gradient line in the center of the viewport.
 * No canvas needed - just a styled div.
 */
export function ScannerBeam() {
  return (
    <div
      className="scanner-beam"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '2px',
        height: '100%',
        // Muted violet gradient with vertical fade at top/bottom
        background: `linear-gradient(
          to bottom,
          rgba(165, 148, 205, 0) 0%,
          rgba(165, 148, 205, 0.6) 15%,
          rgba(185, 172, 220, 0.8) 50%,
          rgba(165, 148, 205, 0.6) 85%,
          rgba(165, 148, 205, 0) 100%
        )`,
        zIndex: 15,
        pointerEvents: 'none',
      }}
    />
  )
}
