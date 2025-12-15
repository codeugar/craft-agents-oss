import React, { useState, useEffect, useRef, useCallback } from 'react'

interface RightSidebarProps {
  content: { type: 'markdown' | 'browser'; url: string }
  onClose: () => void
}

/**
 * Validates and normalizes a URL for the webview.
 * Only allows http/https URLs to prevent javascript: or file: protocol attacks.
 */
function sanitizeUrl(url: string): string {
  let sanitized = url.trim()

  // Add https:// if no protocol specified
  if (!sanitized.startsWith('http://') && !sanitized.startsWith('https://')) {
    sanitized = 'https://' + sanitized
  }

  // Only allow http and https protocols
  try {
    const parsed = new URL(sanitized)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'https://craft.do' // Default to safe URL
    }
    return sanitized
  } catch {
    return 'https://craft.do' // Invalid URL, return default
  }
}

export default function RightSidebar({ content, onClose }: RightSidebarProps) {
  const [activeTab, setActiveTab] = useState<'markdown' | 'browser'>(content.type)
  const [markdownContent, setMarkdownContent] = useState<string>('')
  const [markdownPath, setMarkdownPath] = useState<string>(content.type === 'markdown' ? content.url : '')
  const [browserUrl, setBrowserUrl] = useState<string>(content.type === 'browser' ? sanitizeUrl(content.url) : 'https://craft.do')
  const [displayUrl, setDisplayUrl] = useState<string>(browserUrl)
  const [isLoading, setIsLoading] = useState(false)
  const [webviewError, setWebviewError] = useState<string | null>(null)
  const webviewRef = useRef<Electron.WebviewTag>(null)

  // Update state when content prop changes
  useEffect(() => {
    if (content.type === 'markdown') {
      setActiveTab('markdown')
      setMarkdownPath(content.url)
      loadMarkdownFile(content.url)
    } else {
      setActiveTab('browser')
      const sanitized = sanitizeUrl(content.url)
      setBrowserUrl(sanitized)
      setDisplayUrl(sanitized)
      setWebviewError(null)
    }
  }, [content])

  // Set up webview event listeners for navigation tracking and error handling
  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const handleDidNavigate = (event: Electron.DidNavigateEvent) => {
      setDisplayUrl(event.url)
      setWebviewError(null)
    }

    const handleDidFailLoad = (event: Electron.DidFailLoadEvent) => {
      // Ignore aborted loads (user navigated away)
      if (event.errorCode === -3) return
      setWebviewError(`Failed to load: ${event.errorDescription}`)
    }

    const handleDidStartLoading = () => {
      setWebviewError(null)
    }

    webview.addEventListener('did-navigate', handleDidNavigate)
    webview.addEventListener('did-navigate-in-page', handleDidNavigate as any)
    webview.addEventListener('did-fail-load', handleDidFailLoad)
    webview.addEventListener('did-start-loading', handleDidStartLoading)

    return () => {
      webview.removeEventListener('did-navigate', handleDidNavigate)
      webview.removeEventListener('did-navigate-in-page', handleDidNavigate as any)
      webview.removeEventListener('did-fail-load', handleDidFailLoad)
      webview.removeEventListener('did-start-loading', handleDidStartLoading)
    }
  }, [activeTab]) // Re-attach when tab changes since webview might remount

  const loadMarkdownFile = async (path: string) => {
    setIsLoading(true)
    try {
      const fileContent = await window.electronAPI.readFile(path)
      setMarkdownContent(fileContent)
    } catch (error) {
      setMarkdownContent(`Error loading file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with tabs */}
      <div className="flex items-center justify-between border-b border-[#2a2a2a]">
        <div className="flex">
          <button
            onClick={() => setActiveTab('markdown')}
            className={`px-4 py-3 text-sm transition-colors ${
              activeTab === 'markdown'
                ? 'text-craft-purple border-b-2 border-craft-purple'
                : 'text-[#888] hover:text-white'
            }`}
          >
            Files
          </button>
          <button
            onClick={() => setActiveTab('browser')}
            className={`px-4 py-3 text-sm transition-colors ${
              activeTab === 'browser'
                ? 'text-craft-purple border-b-2 border-craft-purple'
                : 'text-[#888] hover:text-white'
            }`}
          >
            Browser
          </button>
        </div>
        <button
          onClick={onClose}
          className="p-2 mr-2 rounded hover:bg-[#2a2a2a] transition-colors"
          title="Close sidebar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'markdown' ? (
          <div className="h-full flex flex-col">
            {/* File path display */}
            {markdownPath && (
              <div className="px-4 py-2 bg-[#222] border-b border-[#2a2a2a]">
                <p className="text-xs text-[#888] truncate" title={markdownPath}>
                  {markdownPath}
                </p>
              </div>
            )}
            {/* Markdown content */}
            <div className="flex-1 overflow-auto p-4">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <span className="text-[#888]">Loading...</span>
                </div>
              ) : markdownContent ? (
                <pre className="text-sm whitespace-pre-wrap font-mono text-[#ccc]">
                  {markdownContent}
                </pre>
              ) : (
                <div className="flex items-center justify-center h-full text-[#666]">
                  <p>No file selected</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {/* URL bar */}
            <div className="px-2 py-2 bg-[#222] border-b border-[#2a2a2a]">
              <input
                type="text"
                value={displayUrl}
                onChange={(e) => setDisplayUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && webviewRef.current) {
                    const sanitized = sanitizeUrl(displayUrl)
                    setBrowserUrl(sanitized)
                    setDisplayUrl(sanitized)
                    setWebviewError(null)
                    webviewRef.current.src = sanitized
                  }
                }}
                className="w-full bg-[#2a2a2a] rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-craft-purple"
                placeholder="Enter URL..."
              />
            </div>
            {/* Error display */}
            {webviewError && (
              <div className="px-4 py-2 bg-[#2a1e1e] border-b border-[#4a2a2a] text-sm text-[#ff6b6b]">
                {webviewError}
              </div>
            )}
            {/* Webview with security sandbox */}
            <div className="flex-1">
              <webview
                ref={webviewRef}
                src={browserUrl}
                className="w-full h-full"
                style={{ display: 'flex' }}
                // Security: Use isolated partition to prevent cookie/storage leakage
                partition="persist:browser-panel"
                // Security: Disable plugins and enable only essential features
                // @ts-expect-error - These are valid webview attributes but not in types
                allowpopups={false}
                disablewebsecurity={false}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
