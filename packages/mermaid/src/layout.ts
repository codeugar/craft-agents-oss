import type { ElkNode, ElkExtendedEdge, ElkLabel } from 'elkjs'
import type { MermaidGraph, MermaidSubgraph, PositionedGraph, PositionedNode, PositionedEdge, PositionedGroup, Point, RenderOptions } from './types.ts'
import { estimateTextWidth, FONT_SIZES, FONT_WEIGHTS, NODE_PADDING } from './styles.ts'
import { getElk } from './elk-instance.ts'

// ============================================================================
// Layout engine — converts MermaidGraph to PositionedGraph via elkjs
//
// Pipeline:
//   1. Estimate node sizes from label text + shape padding
//   2. Build ELK graph JSON (nodes, edges, compound nodes for subgraphs)
//   3. Run elk.layout() with orthogonal edge routing
//   4. Extract positions back into our PositionedGraph format
// ============================================================================

/** Default render options (layout-only — color defaults are in theme.ts) */
const DEFAULTS: Required<Pick<RenderOptions, 'font' | 'padding' | 'nodeSpacing' | 'layerSpacing'>> = {
  font: 'Inter',
  padding: 40,
  nodeSpacing: 24,
  layerSpacing: 40,
}

/**
 * Lay out a parsed mermaid graph using elkjs.
 * Returns a fully positioned graph ready for SVG rendering.
 */
export async function layoutGraph(
  graph: MermaidGraph,
  options: RenderOptions = {}
): Promise<PositionedGraph> {
  const opts = { ...DEFAULTS, ...options }

  // Determine elk direction from mermaid direction
  const elkDirection = directionToElk(graph.direction)

  // Collect node IDs that belong to subgraphs (to exclude from root children).
  // Also exclude the subgraph IDs themselves — in state diagrams, a composite
  // state like "Processing" exists as both a node (from transition references)
  // and a subgraph (from the composite definition). Without this exclusion,
  // ELK receives a duplicate: a plain node and a compound node with the same ID.
  const subgraphNodeIds = new Set<string>()
  for (const sg of graph.subgraphs) {
    subgraphNodeIds.add(sg.id)
    collectSubgraphNodeIds(sg, subgraphNodeIds)
  }

  // Build lookup maps for top-level ELK nodes and subgraphs
  const topLevelNodeMap = new Map<string, ElkNode>()
  for (const [id, node] of graph.nodes) {
    if (!subgraphNodeIds.has(id)) {
      topLevelNodeMap.set(id, buildElkNode(id, node.label, node.shape))
    }
  }

  const elkSubgraphMap = new Map<string, ElkNode>()
  for (const sg of graph.subgraphs) {
    elkSubgraphMap.set(sg.id, buildElkSubgraph(sg, graph))
  }

  // Build root children in source order so ELK's layered algorithm
  // respects the author's intended visual ordering (e.g. subgraphs defined
  // first in the source appear at the top of a TD graph).
  const rootChildren: ElkNode[] = []
  const placed = new Set<string>()
  for (const entry of graph.sourceOrder) {
    const elkNode = entry.type === 'node'
      ? topLevelNodeMap.get(entry.id)
      : elkSubgraphMap.get(entry.id)
    if (elkNode) {
      rootChildren.push(elkNode)
      placed.add(entry.id)
    }
  }
  // Defensive fallback: add any elements not captured by sourceOrder
  for (const [id, elkNode] of topLevelNodeMap) {
    if (!placed.has(id)) rootChildren.push(elkNode)
  }
  for (const [id, elkNode] of elkSubgraphMap) {
    if (!placed.has(id)) rootChildren.push(elkNode)
  }

  // Build ELK edges
  const elkEdges: ElkExtendedEdge[] = graph.edges.map((edge, i) => {
    const elkEdge: ElkExtendedEdge = {
      id: `e${i}`,
      sources: [edge.source],
      targets: [edge.target],
    }
    if (edge.label) {
      elkEdge.labels = [{
        text: edge.label,
        width: estimateTextWidth(edge.label, FONT_SIZES.edgeLabel, FONT_WEIGHTS.edgeLabel) + 8,
        height: FONT_SIZES.edgeLabel + 6,
      } as ElkLabel]
    }
    return elkEdge
  })

  // Build the root ELK graph
  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': elkDirection,
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': String(opts.nodeSpacing),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(opts.layerSpacing),
      'elk.padding': `[top=${opts.padding},left=${opts.padding},bottom=${opts.padding},right=${opts.padding}]`,
      // Allow edges between nodes inside compound children to be routed at root level
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      // Improve edge label placement
      'elk.edgeLabels.placement': 'CENTER',
    },
    children: rootChildren,
    edges: elkEdges,
  }

  // Run layout (lazy-init the ELK instance on first use)
  const layoutResult = await getElk().layout(elkGraph)

  // Extract positioned graph from layout result
  return extractPositionedGraph(layoutResult, graph)
}

// ============================================================================
// ELK graph construction helpers
// ============================================================================

/** Convert mermaid direction to elk direction value */
function directionToElk(dir: MermaidGraph['direction']): string {
  switch (dir) {
    case 'LR': return 'RIGHT'
    case 'RL': return 'LEFT'
    case 'BT': return 'UP'
    case 'TD':
    case 'TB':
    default: return 'DOWN'
  }
}

/** Build an ELK node from a mermaid node, sizing based on label + shape */
function buildElkNode(id: string, label: string, shape: string): ElkNode {
  const textWidth = estimateTextWidth(label, FONT_SIZES.nodeLabel, FONT_WEIGHTS.nodeLabel)

  let width = textWidth + NODE_PADDING.horizontal * 2
  let height = FONT_SIZES.nodeLabel + NODE_PADDING.vertical * 2

  // Diamonds need extra space because text is inside a rotated square
  if (shape === 'diamond') {
    const side = Math.max(width, height) + NODE_PADDING.diamondExtra
    width = side
    height = side
  }

  // Circles and double circles: the bounding box must be square, and the diameter
  // must be large enough for the text rectangle to be inscribed inside the circle.
  // For a rect of (w × h) inscribed in a circle: diameter ≥ √(w² + h²)
  if (shape === 'circle' || shape === 'doublecircle') {
    const diameter = Math.ceil(Math.sqrt(width * width + height * height)) + 8
    // Double circle needs extra space for the outer ring (~6px gap)
    width = shape === 'doublecircle' ? diameter + 12 : diameter
    height = width
  }

  // Hexagons need extra horizontal padding for the angled sides
  if (shape === 'hexagon') {
    width += NODE_PADDING.horizontal
  }

  // Trapezoids need extra horizontal padding for angled edges
  if (shape === 'trapezoid' || shape === 'trapezoid-alt') {
    width += NODE_PADDING.horizontal
  }

  // Asymmetric flag shape needs left padding for the pointed end
  if (shape === 'asymmetric') {
    width += 12
  }

  // Cylinder needs extra vertical space for the ellipse cap
  if (shape === 'cylinder') {
    height += 14
  }

  // State diagram pseudostates — small fixed-size circles
  if (shape === 'state-start' || shape === 'state-end') {
    width = 28
    height = 28
  }

  // Minimum sizes for aesthetics
  width = Math.max(width, 60)
  height = Math.max(height, 36)

  return { id, width, height }
}

/** Recursively build an ELK compound node for a subgraph */
function buildElkSubgraph(sg: MermaidSubgraph, graph: MermaidGraph): ElkNode {
  // Header label height for the subgraph title
  const headerHeight = FONT_SIZES.groupHeader + 16

  const children: ElkNode[] = []

  // Add direct child nodes
  for (const nodeId of sg.nodeIds) {
    const node = graph.nodes.get(nodeId)
    if (node) {
      children.push(buildElkNode(nodeId, node.label, node.shape))
    }
  }

  // Add nested subgraphs
  for (const child of sg.children) {
    children.push(buildElkSubgraph(child, graph))
  }

  // Build layout options, including optional direction override
  const layoutOptions: Record<string, string> = {
    'elk.padding': `[top=${headerHeight + 12},left=16,bottom=16,right=16]`,
  }
  if (sg.direction) {
    layoutOptions['elk.direction'] = directionToElk(sg.direction)
  }

  return {
    id: sg.id,
    children,
    layoutOptions,
    // ELK needs width/height hints for compound nodes — it will resize to fit children
    labels: [{
      text: sg.label,
      width: estimateTextWidth(sg.label, FONT_SIZES.groupHeader, FONT_WEIGHTS.groupHeader),
      height: FONT_SIZES.groupHeader,
    }],
  }
}

/** Recursively collect all node IDs that belong to any subgraph */
function collectSubgraphNodeIds(sg: MermaidSubgraph, out: Set<string>): void {
  for (const id of sg.nodeIds) {
    out.add(id)
  }
  for (const child of sg.children) {
    collectSubgraphNodeIds(child, out)
  }
}

// ============================================================================
// Position extraction — convert ELK layout results to our PositionedGraph
// ============================================================================

function extractPositionedGraph(
  root: ElkNode,
  graph: MermaidGraph,
): PositionedGraph {
  const nodes: PositionedNode[] = []
  const groups: PositionedGroup[] = []

  // Walk the ELK tree and extract positions.
  // We need to handle both flat nodes and compound (subgraph) nodes.
  extractNodesAndGroups(root, graph, 0, 0, nodes, groups)

  // Build a map of compound node ID → absolute position.
  // Used to resolve edge coordinates, since ELK's `container` field tells us
  // which compound node's coordinate space the edge section points use.
  const containerOffsets = new Map<string, Point>()
  containerOffsets.set('root', { x: 0, y: 0 })
  buildContainerOffsets(root, 0, 0, containerOffsets)

  // Extract edges — all edges are in root.edges, but their section point
  // coordinates are relative to the compound node specified in `container`.
  const edges: PositionedEdge[] = (root.edges ?? []).map((elkEdge, i) => {
    const originalEdge = graph.edges[i]!
    const rawPoints = extractEdgePoints(elkEdge as ElkExtendedEdge)

    // Resolve the container's offset for correct absolute coordinates
    // eslint-disable-next-line -- ELK adds `container` to edges with INCLUDE_CHILDREN but it's not in the types
    const container = (elkEdge as unknown as Record<string, unknown>).container as string | undefined
    const offset = containerOffsets.get(container ?? 'root') ?? { x: 0, y: 0 }
    const points = rawPoints.map(p => ({ x: p.x + offset.x, y: p.y + offset.y }))

    // Extract ELK-computed label center position if available.
    // ELK returns label (x, y) as the top-left corner of the label bounding box
    // relative to the container. Convert to center and apply container offset so
    // the renderer can place the label without recalculating (avoids label collisions).
    let labelPosition: Point | undefined
    const elkLabel = (elkEdge as ElkExtendedEdge).labels?.[0]
    if (elkLabel && elkLabel.x != null && elkLabel.y != null) {
      labelPosition = {
        x: elkLabel.x + (elkLabel.width ?? 0) / 2 + offset.x,
        y: elkLabel.y + (elkLabel.height ?? 0) / 2 + offset.y,
      }
    }

    return {
      source: originalEdge.source,
      target: originalEdge.target,
      label: originalEdge.label,
      style: originalEdge.style,
      hasArrowStart: originalEdge.hasArrowStart,
      hasArrowEnd: originalEdge.hasArrowEnd,
      points,
      labelPosition,
    }
  })

  return {
    width: root.width ?? 800,
    height: root.height ?? 600,
    nodes,
    edges,
    groups,
  }
}

/**
 * Recursively build a map of compound node ID → absolute offset.
 * ELK edges have a `container` field indicating which compound node's
 * coordinate space their section points are in. We need the absolute
 * offset of each container to convert to root coordinates.
 */
function buildContainerOffsets(
  elkNode: ElkNode,
  offsetX: number,
  offsetY: number,
  out: Map<string, Point>
): void {
  for (const child of elkNode.children ?? []) {
    const absX = (child.x ?? 0) + offsetX
    const absY = (child.y ?? 0) + offsetY
    if (child.children && child.children.length > 0) {
      out.set(child.id, { x: absX, y: absY })
      buildContainerOffsets(child, absX, absY, out)
    }
  }
}

/**
 * Recursively walk ELK children, extracting positioned nodes and groups.
 * offsetX/offsetY accumulate from compound node positions.
 */
function extractNodesAndGroups(
  elkNode: ElkNode,
  graph: MermaidGraph,
  offsetX: number,
  offsetY: number,
  outNodes: PositionedNode[],
  outGroups: PositionedGroup[]
): void {
  for (const child of elkNode.children ?? []) {
    const x = (child.x ?? 0) + offsetX
    const y = (child.y ?? 0) + offsetY
    const w = child.width ?? 0
    const h = child.height ?? 0

    if (child.children && child.children.length > 0) {
      // This is a compound node (subgraph) — extract as a group
      const group: PositionedGroup = {
        id: child.id,
        label: child.labels?.[0]?.text ?? child.id,
        x, y,
        width: w,
        height: h,
        children: [],
      }

      // Recursively extract children within this group
      const childNodes: PositionedNode[] = []
      const childGroups: PositionedGroup[] = []
      extractNodesAndGroups(child, graph, x, y, childNodes, childGroups)
      outNodes.push(...childNodes)
      group.children = childGroups
      outGroups.push(group)
    } else {
      // Leaf node — extract as a positioned node
      const mNode = graph.nodes.get(child.id)
      if (mNode) {
        const cssClass = graph.classAssignments.get(child.id)
        const inlineStyle = graph.nodeStyles.get(child.id)
        outNodes.push({
          id: child.id,
          label: mNode.label,
          shape: mNode.shape,
          x, y,
          width: w,
          height: h,
          cssClass,
          inlineStyle,
        })
      }
    }
  }
}

/** Extract a flat array of points from an ELK edge (sections → points) */
function extractEdgePoints(elkEdge: ElkExtendedEdge): Point[] {
  const points: Point[] = []
  for (const section of elkEdge.sections ?? []) {
    points.push({ x: section.startPoint.x, y: section.startPoint.y })
    for (const bp of section.bendPoints ?? []) {
      points.push({ x: bp.x, y: bp.y })
    }
    points.push({ x: section.endPoint.x, y: section.endPoint.y })
  }
  return points
}
