/**
 * Header - App header with branding and controls
 */

import { Sun, Moon, X } from 'lucide-react'

interface HeaderProps {
  hasSession: boolean
  isDark: boolean
  onToggleTheme: () => void
  onClear: () => void
}

export function Header({ hasSession, isDark, onToggleTheme, onClear }: HeaderProps) {
  return (
    <header className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-foreground/5">
      <div className="flex items-center gap-3">
        {/* Logo / Branding */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center">
            <span className="text-xs font-bold text-white">C</span>
          </div>
          <span className="font-medium text-foreground">Session Viewer</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Clear button (when session is loaded) */}
        {hasSession && (
          <button
            onClick={onClear}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md
                       text-foreground/60 hover:text-foreground hover:bg-foreground/5
                       transition-colors"
          >
            <X className="w-4 h-4" />
            <span>Clear</span>
          </button>
        )}

        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          className="p-2 rounded-md text-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>
      </div>
    </header>
  )
}
