import type { ElkNode, ElkExtendedEdge } from 'elkjs'
import type { ClassDiagram, ClassNode, ClassMember, PositionedClassDiagram, PositionedClassNode, PositionedClassRelationship } from './types.ts'
import type { RenderOptions } from '../types.ts'
import { estimateTextWidth, estimateMonoTextWidth, FONT_SIZES, FONT_WEIGHTS } from '../styles.ts'

import { getElk } from '../elk-instance.ts'

// ============================================================================
// Class diagram layout engine
//
// Uses elkjs for positioning class boxes, then sizes each box based on
// the number of attributes and methods it contains.
//
// Each class box has 3 compartments:
//   1. Header (class name + optional annotation)
//   2. Attributes section
//   3. Methods section
// ============================================================================

/** Layout constants for class diagrams */
export const CLS = {
  /** Padding around the diagram */
  padding: 40,
  /** Horizontal padding inside class boxes — used by both layout and renderer */
  boxPadX: 16,
  /** Header height (class name + annotation) */
  headerBaseHeight: 32,
  /** Extra height when annotation is present */
  annotationHeight: 16,
  /** Height per member row (attribute or method) */
  memberRowHeight: 20,
  /** Minimum empty section height (when no attrs or no methods) */
  emptySectionHeight: 8,
  /** Minimum box width */
  minWidth: 120,
  /** Font size for member text */
  memberFontSize: 11,
  /** Font weight for member text */
  memberFontWeight: 400,
  /** Spacing between class nodes */
  nodeSpacing: 40,
  /** Spacing between layers */
  layerSpacing: 60,
} as const

/**
 * Lay out a parsed class diagram using elkjs.
 * Returns positioned class nodes and relationship paths.
 */
export async function layoutClassDiagram(
  diagram: ClassDiagram,
  _options: RenderOptions = {}
): Promise<PositionedClassDiagram> {
  if (diagram.classes.length === 0) {
    return { width: 0, height: 0, classes: [], relationships: [] }
  }

  // 1. Calculate box dimensions for each class
  const classSizes = new Map<string, { width: number; height: number; headerHeight: number; attrHeight: number; methodHeight: number }>()

  for (const cls of diagram.classes) {
    const headerHeight = cls.annotation
      ? CLS.headerBaseHeight + CLS.annotationHeight
      : CLS.headerBaseHeight

    const attrHeight = cls.attributes.length > 0
      ? cls.attributes.length * CLS.memberRowHeight
      : CLS.emptySectionHeight

    const methodHeight = cls.methods.length > 0
      ? cls.methods.length * CLS.memberRowHeight
      : CLS.emptySectionHeight

    // Width: max of header text, widest attribute, widest method
    const headerTextW = estimateTextWidth(cls.label, FONT_SIZES.nodeLabel, FONT_WEIGHTS.nodeLabel)
    const maxAttrW = maxMemberWidth(cls.attributes)
    const maxMethodW = maxMemberWidth(cls.methods)
    const width = Math.max(CLS.minWidth, headerTextW + CLS.boxPadX * 2, maxAttrW + CLS.boxPadX * 2, maxMethodW + CLS.boxPadX * 2)

    const height = headerHeight + attrHeight + methodHeight

    classSizes.set(cls.id, { width, height, headerHeight, attrHeight, methodHeight })
  }

  // 2. Build ELK graph
  const elkNodes: ElkNode[] = diagram.classes.map(cls => {
    const size = classSizes.get(cls.id)!
    return { id: cls.id, width: size.width, height: size.height }
  })

  // Attach label dimensions to edges so ELK can compute collision-free label positions
  // (same approach used by the flowchart layout in layout.ts)
  const elkEdges: ElkExtendedEdge[] = diagram.relationships.map((rel, i) => {
    const edge: ElkExtendedEdge = {
      id: `e${i}`,
      sources: [rel.from],
      targets: [rel.to],
    }
    if (rel.label) {
      edge.labels = [{
        text: rel.label,
        width: estimateTextWidth(rel.label, FONT_SIZES.edgeLabel, FONT_WEIGHTS.edgeLabel) + 8,
        height: FONT_SIZES.edgeLabel + 6,
      }]
    }
    return edge
  })

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': String(CLS.nodeSpacing),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(CLS.layerSpacing),
      'elk.padding': `[top=${CLS.padding},left=${CLS.padding},bottom=${CLS.padding},right=${CLS.padding}]`,
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      // Let ELK place edge labels to avoid overlaps between nearby edges
      'elk.edgeLabels.placement': 'CENTER',
    },
    children: elkNodes,
    edges: elkEdges,
  }

  // 3. Run ELK layout
  const layoutResult = await getElk().layout(elkGraph)

  // 4. Extract positioned classes
  const classLookup = new Map<string, ClassNode>()
  for (const cls of diagram.classes) classLookup.set(cls.id, cls)

  const positionedClasses: PositionedClassNode[] = (layoutResult.children ?? []).map(elkNode => {
    const cls = classLookup.get(elkNode.id)!
    const size = classSizes.get(elkNode.id)!
    return {
      id: cls.id,
      label: cls.label,
      annotation: cls.annotation,
      attributes: cls.attributes,
      methods: cls.methods,
      x: elkNode.x ?? 0,
      y: elkNode.y ?? 0,
      width: elkNode.width ?? size.width,
      height: elkNode.height ?? size.height,
      headerHeight: size.headerHeight,
      attrHeight: size.attrHeight,
      methodHeight: size.methodHeight,
    }
  })

  // 5. Extract relationship paths and ELK-computed label positions
  const relationships: PositionedClassRelationship[] = (layoutResult.edges ?? []).map((elkEdge, i) => {
    const rel = diagram.relationships[i]!
    const points = extractEdgePoints(elkEdge as ElkExtendedEdge)

    // Extract ELK-computed label center position if available.
    // ELK returns label (x, y) as the top-left corner of the label bounding box.
    // Convert to center so the renderer can place text with text-anchor="middle".
    let labelPosition: { x: number; y: number } | undefined
    const elkLabel = (elkEdge as ElkExtendedEdge).labels?.[0]
    if (elkLabel && elkLabel.x != null && elkLabel.y != null) {
      labelPosition = {
        x: elkLabel.x + (elkLabel.width ?? 0) / 2,
        y: elkLabel.y + (elkLabel.height ?? 0) / 2,
      }
    }

    return {
      from: rel.from,
      to: rel.to,
      type: rel.type,
      markerAt: rel.markerAt,
      label: rel.label,
      fromCardinality: rel.fromCardinality,
      toCardinality: rel.toCardinality,
      points,
      labelPosition,
    }
  })

  return {
    width: layoutResult.width ?? 600,
    height: layoutResult.height ?? 400,
    classes: positionedClasses,
    relationships,
  }
}

/** Calculate the max width of a list of class members (uses mono metrics) */
function maxMemberWidth(members: ClassMember[]): number {
  if (members.length === 0) return 0
  let maxW = 0
  for (const m of members) {
    const text = memberToString(m)
    // Members render in monospace — use mono width estimation for accurate box sizing
    const w = estimateMonoTextWidth(text, CLS.memberFontSize)
    if (w > maxW) maxW = w
  }
  return maxW
}

/** Convert a class member to its display string */
export function memberToString(m: ClassMember): string {
  const vis = m.visibility ? `${m.visibility} ` : ''
  const type = m.type ? `: ${m.type}` : ''
  return `${vis}${m.name}${type}`
}

/** Extract points from an ELK edge */
function extractEdgePoints(elkEdge: ElkExtendedEdge): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = []
  for (const section of elkEdge.sections ?? []) {
    points.push({ x: section.startPoint.x, y: section.startPoint.y })
    for (const bp of section.bendPoints ?? []) {
      points.push({ x: bp.x, y: bp.y })
    }
    points.push({ x: section.endPoint.x, y: section.endPoint.y })
  }
  return points
}
