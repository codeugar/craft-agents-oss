/**
 * PDFPreviewOverlay - In-app PDF preview for the link interceptor.
 *
 * Renders Chromium's built-in PDF viewer via a file:// URL in an <embed> element.
 * Uses the standard PreviewOverlay → FullscreenOverlayBase pipeline.
 *
 * Sizing note: The embed wrapper uses h-full (not min-h-full + flex-1) to get a
 * definite height from the scroll container's content box. This gives the embed
 * a concrete pixel size so the PDF viewer renders at the correct dimensions.
 * The PDF viewer handles its own internal scrolling.
 */

import { FileText } from 'lucide-react'
import { PreviewOverlay } from './PreviewOverlay'
import { CopyButton } from './CopyButton'

export interface PDFPreviewOverlayProps {
  isOpen: boolean
  onClose: () => void
  /** Absolute file path for the PDF */
  filePath: string
  theme?: 'light' | 'dark'
}

export function PDFPreviewOverlay({
  isOpen,
  onClose,
  filePath,
  theme = 'light',
}: PDFPreviewOverlayProps) {
  const headerActions = (
    <CopyButton content={filePath} title="Copy path" />
  )

  // file:// URL — Chromium's PDF viewer only supports http:, https:, file:, and blob: schemes
  // (data: URLs are silently ignored).
  const fileUrl = `file://${filePath}`

  return (
    <PreviewOverlay
      isOpen={isOpen}
      onClose={onClose}
      theme={theme}
      typeBadge={{
        icon: FileText,
        label: 'PDF',
        variant: 'orange',
      }}
      filePath={filePath}
      headerActions={headerActions}
    >
      {/* h-full gives a definite height from the scroll container's content box.
          The embed fills it completely; the PDF viewer scrolls internally. */}
      <div className="h-full">
        <embed
          src={fileUrl}
          type="application/pdf"
          className="w-full h-full"
        />
      </div>
    </PreviewOverlay>
  )
}
