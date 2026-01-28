import type { ElkNode, ElkExtendedEdge } from 'elkjs'
import type { ErDiagram, ErEntity, PositionedErDiagram, PositionedErEntity, PositionedErRelationship } from './types.ts'
import type { RenderOptions } from '../types.ts'
import { estimateTextWidth, estimateMonoTextWidth, FONT_SIZES, FONT_WEIGHTS } from '../styles.ts'

import { getElk } from '../elk-instance.ts'

// ============================================================================
// ER diagram layout engine
//
// Uses elkjs for positioning entity boxes, then sizes each box based on
// the entity name and number of attributes.
//
// Each entity box has:
//   1. Header (entity name)
//   2. Attribute rows (type, name, keys)
// ============================================================================

/** Layout constants for ER diagrams */
const ER = {
  padding: 40,
  boxPadX: 12,
  headerHeight: 32,
  rowHeight: 22,
  minWidth: 140,
  attrFontSize: 11,
  attrFontWeight: 400,
  nodeSpacing: 50,
  layerSpacing: 70,
} as const

/**
 * Lay out a parsed ER diagram using elkjs.
 * Returns positioned entity boxes and relationship paths.
 */
export async function layoutErDiagram(
  diagram: ErDiagram,
  _options: RenderOptions = {}
): Promise<PositionedErDiagram> {
  if (diagram.entities.length === 0) {
    return { width: 0, height: 0, entities: [], relationships: [] }
  }

  // 1. Calculate box dimensions for each entity
  const entitySizes = new Map<string, { width: number; height: number }>()

  for (const entity of diagram.entities) {
    // Header width from entity label
    const headerTextW = estimateTextWidth(entity.label, FONT_SIZES.nodeLabel, FONT_WEIGHTS.nodeLabel)

    // Max attribute row width: "type  name  PK FK"
    // Attribute text renders in monospace — use mono width estimation for accurate box sizing
    let maxAttrW = 0
    for (const attr of entity.attributes) {
      const attrText = `${attr.type}  ${attr.name}${attr.keys.length > 0 ? '  ' + attr.keys.join(',') : ''}`
      const w = estimateMonoTextWidth(attrText, ER.attrFontSize)
      if (w > maxAttrW) maxAttrW = w
    }

    const width = Math.max(ER.minWidth, headerTextW + ER.boxPadX * 2, maxAttrW + ER.boxPadX * 2)
    const height = ER.headerHeight + Math.max(entity.attributes.length, 1) * ER.rowHeight

    entitySizes.set(entity.id, { width, height })
  }

  // 2. Build ELK graph
  const elkNodes: ElkNode[] = diagram.entities.map(entity => {
    const size = entitySizes.get(entity.id)!
    return { id: entity.id, width: size.width, height: size.height }
  })

  const elkEdges: ElkExtendedEdge[] = diagram.relationships.map((rel, i) => ({
    id: `e${i}`,
    sources: [rel.entity1],
    targets: [rel.entity2],
    labels: [{
      text: rel.label,
      width: estimateTextWidth(rel.label, FONT_SIZES.edgeLabel, FONT_WEIGHTS.edgeLabel) + 8,
      height: FONT_SIZES.edgeLabel + 6,
    }],
  }))

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': String(ER.nodeSpacing),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(ER.layerSpacing),
      'elk.padding': `[top=${ER.padding},left=${ER.padding},bottom=${ER.padding},right=${ER.padding}]`,
    },
    children: elkNodes,
    edges: elkEdges,
  }

  // 3. Run ELK layout
  const layoutResult = await getElk().layout(elkGraph)

  // 4. Extract positioned entities
  const entityLookup = new Map<string, ErEntity>()
  for (const entity of diagram.entities) entityLookup.set(entity.id, entity)

  const positionedEntities: PositionedErEntity[] = (layoutResult.children ?? []).map(elkNode => {
    const entity = entityLookup.get(elkNode.id)!
    return {
      id: entity.id,
      label: entity.label,
      attributes: entity.attributes,
      x: elkNode.x ?? 0,
      y: elkNode.y ?? 0,
      width: elkNode.width ?? entitySizes.get(entity.id)!.width,
      height: elkNode.height ?? entitySizes.get(entity.id)!.height,
      headerHeight: ER.headerHeight,
      rowHeight: ER.rowHeight,
    }
  })

  // 5. Extract relationship paths
  const relationships: PositionedErRelationship[] = (layoutResult.edges ?? []).map((elkEdge, i) => {
    const rel = diagram.relationships[i]!
    const points = extractEdgePoints(elkEdge as ElkExtendedEdge)
    return {
      entity1: rel.entity1,
      entity2: rel.entity2,
      cardinality1: rel.cardinality1,
      cardinality2: rel.cardinality2,
      label: rel.label,
      identifying: rel.identifying,
      points,
    }
  })

  return {
    width: layoutResult.width ?? 600,
    height: layoutResult.height ?? 400,
    entities: positionedEntities,
    relationships,
  }
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
