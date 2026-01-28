/**
 * Generates samples.html showcasing all @craft-agent/mermaid rendering capabilities.
 *
 * Usage: bun run packages/mermaid/samples.ts
 *
 * This file doubles as a **visual test suite** — every supported feature,
 * shape, edge type, block construct, and theme variant is exercised by at
 * least one sample. If a rendering change causes regressions, it will be
 * visible in the generated HTML.
 *
 * The generated HTML is **dynamic** — it includes a bundled copy of the
 * mermaid renderer and renders all diagrams client-side in real time,
 * showing progressive loading and per-diagram render timing.
 *
 * Sample definitions live in samples-data.ts (shared with bench.ts).
 */

import { samples } from './samples-data.ts'

// ============================================================================
// HTML generation — dynamic version
//
// Instead of pre-rendering SVGs at build time, we:
//   1. Bundle the mermaid renderer for the browser via Bun.build()
//   2. Embed sample definitions as inline JSON
//   3. Emit client-side JS that renders each diagram on page load
// ============================================================================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function generateHtml(): Promise<string> {
  // Step 1: Bundle the mermaid renderer for the browser
  const buildResult = await Bun.build({
    entrypoints: [new URL('./src/browser.ts', import.meta.url).pathname],
    target: 'browser',
    format: 'esm',
    minify: true,
  })
  if (!buildResult.success) {
    console.error('Bundle build failed:', buildResult.logs)
    process.exit(1)
  }
  const bundleJs = await buildResult.outputs[0]!.text()
  console.log(`Browser bundle: ${(bundleJs.length / 1024).toFixed(1)} KB`)

  // Step 2: Build sample JSON (only serializable fields needed by client)
  const samplesJson = JSON.stringify(samples.map(s => ({
    title: s.title,
    description: s.description,
    source: s.source,
    category: s.category ?? 'Other',
    options: s.options ?? {},
  })))

  // Step 3: Group samples by category for TOC (done at build time since it's static)
  const categories = new Map<string, number[]>()
  samples.forEach((sample, i) => {
    const cat = sample.category ?? 'Other'
    if (!categories.has(cat)) categories.set(cat, [])
    categories.get(cat)!.push(i)
  })

  const categoryBadgeColors: Record<string, string> = {
    Flowchart: '#3b82f6',
    State: '#8b5cf6',
    Sequence: '#10b981',
    Class: '#f59e0b',
    ER: '#ef4444',
    'Theme Showcase': '#06b6d4',
  }

  const tocSections = [...categories.entries()].map(([cat, indices]) => {
    const badgeColor = categoryBadgeColors[cat] ?? '#71717a'
    const items = indices.map(i => {
      return `<li><a href="#sample-${i}">${i + 1}. ${escapeHtml(samples[i]!.title)}</a></li>`
    }).join('\n            ')
    return `
        <div class="toc-category">
          <h3><span class="badge" style="background:${badgeColor}">${escapeHtml(cat)}</span> (${indices.length} samples)</h3>
          <ol start="${indices[0]! + 1}">
            ${items}
          </ol>
        </div>`
  }).join('\n')

  // Step 4: Build sample card HTML shells (SVG + ASCII are empty, filled client-side)
  const sampleCards = samples.map((sample, i) => {
    // Detect dark background: check if the bg hex color is dark (red channel < 0x80)
    const bg = sample.options?.bg
    const dark = bg ? parseInt(bg.replace('#', '').slice(0, 2), 16) < 0x80 : false
    return `
    <section class="sample" id="sample-${i}">
      <div class="sample-header">
        <h2>${i + 1}. ${escapeHtml(sample.title)}</h2>
        <p class="description">${escapeHtml(sample.description)}</p>
      </div>
      <div class="sample-content">
        <div class="source-panel">
          <h3>Mermaid Source</h3>
          <pre><code>${escapeHtml(sample.source.trim())}</code></pre>
          ${sample.options ? `<div class="options"><strong>Options:</strong> <code>${escapeHtml(JSON.stringify(sample.options))}</code></div>` : ''}
        </div>
        <div class="svg-panel${dark ? ' dark-bg' : ''}"${bg ? ` style="background:${bg}"` : ''} id="svg-panel-${i}">
          <h3>Rendered SVG <span class="timing" id="timing-svg-${i}"></span></h3>
          <div class="svg-container" id="svg-${i}">
            <div class="loading-spinner"></div>
          </div>
        </div>
        <div class="ascii-panel" id="ascii-panel-${i}">
          <h3>ASCII Output <span class="timing" id="timing-ascii-${i}"></span></h3>
          <pre class="ascii-output"><code id="ascii-${i}">Rendering\u2026</code></pre>
        </div>
      </div>
    </section>`
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>@craft-agent/mermaid — Visual Test Suite</title>
  <style>
    /* -- Reset & base -- */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: #fafafa;
      color: #27272a;
      line-height: 1.6;
      padding: 2rem;
      max-width: 1800px;
      margin: 0 auto;
    }

    /* -- Header -- */
    .page-header {
      text-align: center;
      margin-bottom: 3rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid #e4e4e7;
    }
    .page-header h1 {
      font-size: 2rem;
      font-weight: 700;
      color: #18181b;
      margin-bottom: 0.5rem;
    }
    .page-header p {
      color: #71717a;
      font-size: 1rem;
    }
    .page-header .meta {
      margin-top: 0.75rem;
      font-size: 0.85rem;
      color: #a1a1aa;
    }
    .page-header .stats {
      margin-top: 0.5rem;
      display: flex;
      gap: 1rem;
      justify-content: center;
      flex-wrap: wrap;
    }
    .page-header .stat {
      font-size: 0.85rem;
      color: #52525b;
      background: #fff;
      border: 1px solid #e4e4e7;
      border-radius: 6px;
      padding: 0.25rem 0.75rem;
    }

    /* -- Table of contents -- */
    .toc {
      background: #fff;
      border: 1px solid #e4e4e7;
      border-radius: 8px;
      padding: 1.5rem 2rem;
      margin-bottom: 3rem;
    }
    .toc > h2 {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 1rem;
      color: #52525b;
    }
    .toc-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1.5rem;
    }
    .toc-category h3 {
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: #3f3f46;
    }
    .toc-category ol {
      padding-left: 1.25rem;
      font-size: 0.85rem;
    }
    .toc-category li { margin-bottom: 0.15rem; }
    .toc a { color: #3b82f6; text-decoration: none; }
    .toc a:hover { text-decoration: underline; }
    .badge {
      display: inline-block;
      color: white;
      font-size: 0.7rem;
      font-weight: 600;
      padding: 0.1rem 0.5rem;
      border-radius: 4px;
      vertical-align: middle;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    /* -- Sample card -- */
    .sample {
      background: #fff;
      border: 1px solid #e4e4e7;
      border-radius: 8px;
      margin-bottom: 2rem;
      overflow: hidden;
    }
    .sample-header {
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid #f4f4f5;
    }
    .sample-header h2 {
      font-size: 1.15rem;
      font-weight: 600;
      color: #18181b;
    }
    .description {
      color: #71717a;
      font-size: 0.9rem;
      margin-top: 0.25rem;
    }

    .sample-content {
      display: grid;
      /* Three-column row: source | SVG | ASCII, each with sensible min/max */
      grid-template-columns:
        minmax(200px, 1fr)
        minmax(250px, 2fr)
        minmax(250px, 2fr);
      min-height: 200px;
    }
    @media (max-width: 900px) {
      .sample-content { grid-template-columns: 1fr; }
      .ascii-panel { border-left: none !important; border-top: 1px solid #f4f4f5 !important; }
    }

    /* -- Source panel -- */
    .source-panel {
      padding: 1.25rem 1.5rem;
      border-right: 1px solid #f4f4f5;
      background: #fafafa;
    }
    .source-panel h3 {
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #a1a1aa;
      margin-bottom: 0.75rem;
    }
    .source-panel pre {
      background: #18181b;
      color: #e4e4e7;
      padding: 1rem;
      border-radius: 6px;
      font-size: 0.8rem;
      line-height: 1.5;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .source-panel code {
      font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
    }
    .options {
      margin-top: 0.75rem;
      font-size: 0.8rem;
      color: #71717a;
    }
    .options code {
      background: #f4f4f5;
      padding: 0.15rem 0.4rem;
      border-radius: 3px;
      font-size: 0.75rem;
    }

    /* -- SVG panel -- */
    .svg-panel {
      padding: 1.25rem 1.5rem;
      display: flex;
      flex-direction: column;
    }
    .svg-panel h3 {
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #a1a1aa;
      margin-bottom: 0.75rem;
    }
    .svg-panel.dark-bg {
      background: #27272a;
    }
    .svg-panel.dark-bg h3 {
      color: #71717a;
    }
    .svg-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: auto;
    }
    .svg-container svg {
      max-width: 100%;
      height: auto;
    }

    /* -- ASCII panel -- */
    .ascii-panel {
      padding: 1.25rem 1.5rem;
      border-left: 1px solid #f4f4f5;
      background: #fafafa;
      display: flex;
      flex-direction: column;
    }
    .ascii-panel h3 {
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #a1a1aa;
      margin-bottom: 0.75rem;
    }
    .ascii-output {
      background: #18181b;
      color: #a1f0a1;
      padding: 1rem;
      border-radius: 6px;
      font-size: 0.7rem;
      line-height: 1.3;
      overflow-x: auto;
      white-space: pre;
      flex: 1;
      font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
    }

    /* -- Loading spinner -- */
    .loading-spinner {
      width: 24px;
      height: 24px;
      border: 2px solid #e4e4e7;
      border-top-color: #a1a1aa;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* -- Timing badge -- */
    .timing {
      font-size: 0.7rem;
      font-weight: 400;
      color: #a1a1aa;
      margin-left: 0.5rem;
      text-transform: none;
      letter-spacing: normal;
    }

    /* -- Progress bar -- */
    .progress-bar-container {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: #e4e4e7;
      z-index: 1000;
    }
    .progress-bar {
      height: 100%;
      background: #3b82f6;
      transition: width 0.15s ease-out;
      width: 0%;
    }

    /* -- Error state -- */
    .render-error {
      color: #ef4444;
      font-size: 0.85rem;
      font-family: 'JetBrains Mono', monospace;
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <div class="progress-bar-container"><div class="progress-bar" id="progress-bar"></div></div>

  <header class="page-header">
    <h1>@craft-agent/mermaid — Visual Test Suite</h1>
    <p>Mermaid diagram renderer — SVG with zinc monochrome palette + ASCII/Unicode text output</p>
    <p style="margin-top: 0.5rem; color: #52525b; font-size: 0.9rem;">
      Supports: <strong>Flowcharts</strong>, <strong>State Diagrams</strong>,
      <strong>Sequence Diagrams</strong>, <strong>Class Diagrams</strong>, and
      <strong>ER Diagrams</strong>
    </p>
    <div class="stats">
      <span class="stat">${samples.length} total samples</span>
      ${[...categories.entries()].map(([cat, indices]) =>
        `<span class="stat"><span class="badge" style="background:${categoryBadgeColors[cat] ?? '#71717a'}">${cat}</span> ${indices.length}</span>`
      ).join('\n      ')}
      <span class="stat" id="total-timing">Rendering\u2026</span>
    </div>
    <div class="meta">Generated by <code>samples.ts</code> &middot; Diagrams rendered client-side in real time</div>
  </header>

  <nav class="toc">
    <h2>Table of Contents</h2>
    <div class="toc-grid">
      ${tocSections}
    </div>
  </nav>

${sampleCards}

  <!-- Bundled mermaid renderer — exposes window.__mermaid.renderMermaid/renderMermaidAscii -->
  <script type="module">
${bundleJs}

  // Sample definitions embedded as JSON
  const samples = ${samplesJson};

  // Progressive rendering — render each diagram sequentially so the page
  // remains responsive and users can see diagrams appearing one by one.
  const { renderMermaid, renderMermaidAscii } = window.__mermaid;
  const progressBar = document.getElementById('progress-bar');
  const totalTimingEl = document.getElementById('total-timing');
  const totalStart = performance.now();

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const svgContainer = document.getElementById('svg-' + i);
    const asciiContainer = document.getElementById('ascii-' + i);
    const svgTiming = document.getElementById('timing-svg-' + i);
    const asciiTiming = document.getElementById('timing-ascii-' + i);

    // Render SVG — wrapped in a timeout guard so a stalled elkjs layout()
    // (caused by browser setTimeout throttling in FakeWorker) doesn't block
    // all remaining diagrams from rendering.
    try {
      const t0 = performance.now();
      const TIMEOUT_MS = 10000;
      const svg = await Promise.race([
        renderMermaid(sample.source, sample.options),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Render timed out after ' + TIMEOUT_MS + 'ms')), TIMEOUT_MS)),
      ]);
      const ms = (performance.now() - t0).toFixed(1);
      svgContainer.innerHTML = svg;
      svgTiming.textContent = '(' + ms + ' ms)';
    } catch (err) {
      svgContainer.innerHTML = '<div class="render-error">SVG Error: ' + escapeHtml(String(err)) + '</div>';
    }

    // Render ASCII
    try {
      const t0 = performance.now();
      const ascii = renderMermaidAscii(sample.source);
      const ms = (performance.now() - t0).toFixed(1);
      asciiContainer.textContent = ascii;
      asciiTiming.textContent = '(' + ms + ' ms)';
    } catch {
      asciiContainer.textContent = '(ASCII rendering not supported for this diagram type)';
    }

    // Update progress bar
    progressBar.style.width = ((i + 1) / samples.length * 100).toFixed(1) + '%';

    // Yield to the browser so the page stays responsive.
    // requestAnimationFrame is used instead of setTimeout(0) because browsers
    // aggressively throttle setTimeout in background tabs, which can stall the
    // elkjs FakeWorker's message-passing loop and freeze rendering.
    await new Promise(r => requestAnimationFrame(r));
  }

  // Done — show total time and hide progress bar
  const totalMs = (performance.now() - totalStart).toFixed(0);
  totalTimingEl.textContent = 'All ' + samples.length + ' rendered in ' + totalMs + ' ms';
  progressBar.style.background = '#10b981';
  setTimeout(() => {
    document.querySelector('.progress-bar-container').style.opacity = '0';
    document.querySelector('.progress-bar-container').style.transition = 'opacity 0.5s';
  }, 1000);

  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  </script>
</body>
</html>`
}

// ============================================================================
// Main
// ============================================================================

const html = await generateHtml()
const outPath = new URL('./samples.html', import.meta.url).pathname
await Bun.write(outPath, html)
console.log(`Written to ${outPath} (${(html.length / 1024).toFixed(1)} KB)`)
