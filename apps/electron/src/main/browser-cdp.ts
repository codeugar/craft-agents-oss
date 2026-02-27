/**
 * Browser CDP Helpers
 *
 * Uses Electron's webContents.debugger API (Chrome DevTools Protocol) for:
 * - Accessibility tree snapshots with ref-based element identification
 * - Element interaction (click, fill, select) via CDP commands
 *
 * This is the same approach used by Playwright/Stagehand — deterministic,
 * no fragile CSS selectors needed.
 */

import type { WebContents } from 'electron'
import { mainLog } from './logger'

export interface AccessibilityNode {
  ref: string           // "@e1", "@e2", etc.
  role: string          // "button", "link", "textbox", etc.
  name: string          // Accessible name
  value?: string        // Current value (for inputs)
  description?: string  // Additional description
  focused?: boolean
  checked?: boolean
  disabled?: boolean
}

export interface AccessibilitySnapshot {
  url: string
  title: string
  nodes: AccessibilityNode[]
}

// Roles that are typically interactive or contain meaningful content
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'combobox',
  'checkbox', 'radio', 'switch', 'slider', 'spinbutton',
  'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'option', 'treeitem', 'row', 'cell', 'columnheader',
  'rowheader', 'gridcell',
])

const CONTENT_ROLES = new Set([
  'heading', 'img', 'table', 'list', 'listitem',
  'paragraph', 'blockquote', 'article', 'main',
  'navigation', 'complementary', 'contentinfo', 'banner',
  'form', 'region', 'alert', 'dialog', 'alertdialog',
  'status', 'progressbar', 'meter', 'timer',
])

export class BrowserCDP {
  private webContents: WebContents
  private attached = false
  private detachListenerRegistered = false
  // Map from "@eN" refs to backend node IDs (refreshed on each snapshot)
  private refMap: Map<string, number> = new Map()

  constructor(webContents: WebContents) {
    this.webContents = webContents
  }

  private async ensureAttached(): Promise<void> {
    if (this.attached) return
    try {
      this.webContents.debugger.attach('1.3')
      this.attached = true
    } catch (err) {
      // May already be attached
      if (String(err).includes('Already attached')) {
        this.attached = true
      } else {
        throw err
      }
    }

    if (!this.detachListenerRegistered) {
      this.detachListenerRegistered = true
      this.webContents.debugger.on('detach', () => {
        this.attached = false
      })
    }
  }

  detach(): void {
    if (this.attached) {
      try {
        this.webContents.debugger.detach()
      } catch { /* ignore */ }
      this.attached = false
    }
  }

  private async send(method: string, params?: Record<string, unknown>): Promise<any> {
    await this.ensureAttached()
    return this.webContents.debugger.sendCommand(method, params)
  }

  // ---------------------------------------------------------------------------
  // Accessibility Snapshot
  // ---------------------------------------------------------------------------

  async getAccessibilitySnapshot(): Promise<AccessibilitySnapshot> {
    const tree = await this.send('Accessibility.getFullAXTree')
    const nodes = tree.nodes as any[]

    this.refMap.clear()
    const result: AccessibilityNode[] = []
    let refCounter = 0

    for (const node of nodes) {
      const role = node.role?.value || ''
      const name = node.name?.value || ''
      const value = node.value?.value

      // Filter: only include interactive elements, content elements with names,
      // or elements with both role and name
      const isInteractive = INTERACTIVE_ROLES.has(role)
      const isContent = CONTENT_ROLES.has(role) && name
      const hasValue = value !== undefined && value !== ''

      if (!isInteractive && !isContent && !hasValue) continue

      // Skip generic roles without meaningful names
      if ((role === 'generic' || role === 'none' || !role) && !name) continue

      refCounter++
      const ref = `@e${refCounter}`

      // Store mapping from ref to backend node ID
      if (node.backendDOMNodeId) {
        this.refMap.set(ref, node.backendDOMNodeId)
      }

      const accessNode: AccessibilityNode = {
        ref,
        role,
        name,
      }

      if (hasValue) accessNode.value = String(value)
      if (node.description?.value) accessNode.description = node.description.value

      // Boolean properties
      const props = node.properties as any[] | undefined
      if (props) {
        for (const prop of props) {
          if (prop.name === 'focused' && prop.value?.value === true) accessNode.focused = true
          if (prop.name === 'checked' && prop.value?.value !== 'false') accessNode.checked = prop.value?.value === true || prop.value?.value === 'true'
          if (prop.name === 'disabled' && prop.value?.value === true) accessNode.disabled = true
        }
      }

      result.push(accessNode)

      // Cap at 500 nodes to prevent token explosion
      if (refCounter >= 500) break
    }

    return {
      url: this.webContents.getURL(),
      title: this.webContents.getTitle(),
      nodes: result,
    }
  }

  // ---------------------------------------------------------------------------
  // Element Interaction
  // ---------------------------------------------------------------------------

  async clickElement(ref: string): Promise<void> {
    const backendNodeId = this.refMap.get(ref)
    if (!backendNodeId) {
      throw new Error(`Element ${ref} not found. Run browser_snapshot first to get current element refs.`)
    }

    try {
      // Resolve node to get objectId
      const { object } = await this.send('DOM.resolveNode', { backendNodeId })

      // Scroll element into view first
      await this.send('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: 'function() { this.scrollIntoViewIfNeeded(); }',
      })

      // Get element box model after scroll for up-to-date click coordinates
      const { model } = await this.send('DOM.getBoxModel', { backendNodeId })
      const content = model.content as number[]

      // Calculate center point of the element
      const x = (content[0] + content[2] + content[4] + content[6]) / 4
      const y = (content[1] + content[3] + content[5] + content[7]) / 4

      // Dispatch mouse events (mousedown + mouseup + click)
      await this.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x, y,
        button: 'left',
        clickCount: 1,
      })
      await this.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x, y,
        button: 'left',
        clickCount: 1,
      })
    } catch (err) {
      mainLog.error(`[browser-cdp] Click failed for ${ref}:`, err)
      throw new Error(`Failed to click ${ref}: ${err}`)
    }
  }

  async fillElement(ref: string, value: string): Promise<void> {
    const backendNodeId = this.refMap.get(ref)
    if (!backendNodeId) {
      throw new Error(`Element ${ref} not found. Run browser_snapshot first to get current element refs.`)
    }

    try {
      // Focus the element first
      await this.send('DOM.focus', { backendNodeId })

      // Clear existing content
      const { object } = await this.send('DOM.resolveNode', { backendNodeId })
      await this.send('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: `function() {
          this.value = '';
          this.dispatchEvent(new Event('input', { bubbles: true }));
        }`,
      })

      // Type the new value character by character for realistic input
      for (const char of value) {
        await this.send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          text: char,
        })
        await this.send('Input.dispatchKeyEvent', {
          type: 'keyUp',
          text: char,
        })
      }

      // Dispatch change event
      await this.send('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: `function() {
          this.dispatchEvent(new Event('change', { bubbles: true }));
        }`,
      })
    } catch (err) {
      mainLog.error(`[browser-cdp] Fill failed for ${ref}:`, err)
      throw new Error(`Failed to fill ${ref}: ${err}`)
    }
  }

  async selectOption(ref: string, value: string): Promise<void> {
    const backendNodeId = this.refMap.get(ref)
    if (!backendNodeId) {
      throw new Error(`Element ${ref} not found. Run browser_snapshot first to get current element refs.`)
    }

    try {
      const { object } = await this.send('DOM.resolveNode', { backendNodeId })
      await this.send('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: `function(val) {
          this.value = val;
          this.dispatchEvent(new Event('input', { bubbles: true }));
          this.dispatchEvent(new Event('change', { bubbles: true }));
        }`,
        arguments: [{ value }],
      })
    } catch (err) {
      mainLog.error(`[browser-cdp] Select failed for ${ref}:`, err)
      throw new Error(`Failed to select option in ${ref}: ${err}`)
    }
  }
}
