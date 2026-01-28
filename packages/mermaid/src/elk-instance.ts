// ============================================================================
// Shared ELK layout engine singleton
//
// All diagram layout modules (flowchart, class, ER) share a single ELK
// instance to avoid creating multiple FakeWorker instances. The FakeWorker
// inside elkjs communicates via setTimeout-based message passing — having
// three separate instances tripled initialization overhead and increased
// the risk of browser setTimeout throttling stalling the rendering pipeline.
//
// NOTE on ELK initialization: elk-worker.min.js checks for `self` to detect
// web worker context. In Bun, `self === globalThis`, so it wrongly takes the
// worker path and doesn't export FakeWorker. We temporarily remove `self`
// during construction to force the Node/module.exports code path.
// ============================================================================

import type { ElkNode } from 'elkjs'

// Required for dynamic import of elkjs bundled version (Bun compat workaround)
declare const require: {
  (id: string): unknown
  resolve(id: string): string
  cache: Record<string, unknown>
}

export type ElkLayoutEngine = { layout: (graph: ElkNode) => Promise<ElkNode> }

let elkInstance: ElkLayoutEngine | null = null

/** Get or create the shared ELK layout engine instance */
export function getElk(): ElkLayoutEngine {
  if (!elkInstance) {
    // Temporarily hide `self` so elk-worker.min.js takes the module.exports path
    const savedSelf = (globalThis as Record<string, unknown>)['self']
    try {
      delete (globalThis as Record<string, unknown>)['self']
      // Clear cached module so it re-evaluates without `self`
      try { delete require.cache[require.resolve('elkjs/lib/elk.bundled.js')] } catch {}
      const ELK = require('elkjs/lib/elk.bundled.js') as Record<string, unknown>
      const Ctor = (ELK.default ?? ELK) as new () => ElkLayoutEngine
      elkInstance = new Ctor()
    } finally {
      if (savedSelf !== undefined) {
        ;(globalThis as Record<string, unknown>)['self'] = savedSelf
      }
    }
  }
  return elkInstance!
}
