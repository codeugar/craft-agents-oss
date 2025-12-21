/**
 * Playground Adapters for Input Components
 *
 * Provides mock data generators and wrapper components that allow
 * the main app's input components to work in the playground context.
 */

import * as React from 'react'
import type { PermissionRequest } from '../../../../shared/types'
import type {
  ClarificationQuestion,
  PlanReview,
  PermissionResponse,
  ClarificationResponse,
  PlanReviewResponse,
} from '@/components/chat/input/structured/types'

// ============================================================================
// Mock Data Generators
// ============================================================================

/**
 * Generate mock PermissionRequest data for playground
 */
export function mockPermissionRequest(overrides?: Partial<PermissionRequest>): PermissionRequest {
  return {
    id: 'mock-permission-1',
    sessionId: 'mock-session',
    toolName: 'Bash',
    description: 'Execute a shell command to list files in the current directory',
    command: 'ls -la /Users/demo/projects',
    ...overrides,
  }
}

/**
 * Generate mock ClarificationQuestion data for playground
 */
export function mockClarificationQuestion(overrides?: Partial<ClarificationQuestion>): ClarificationQuestion {
  return {
    id: 'mock-clarification-1',
    question: "What's your budget for this trip?",
    header: 'Budget',
    options: [
      { label: 'Under €500', description: 'Budget-friendly options' },
      { label: '€500-1000', description: 'Mid-range options' },
      { label: '€1000+', description: 'Premium options' },
    ],
    multiSelect: false,
    ...overrides,
  }
}

/**
 * Generate mock PlanReview data for playground
 */
export function mockPlanReview(overrides?: Partial<PlanReview>): PlanReview {
  return {
    id: 'mock-plan-1',
    title: 'Trip Planning Workflow',
    summary: 'Search for flights and hotels, compare options, and create a detailed itinerary document.',
    steps: [
      { description: 'Search for available flights to Barcelona', tools: ['WebSearch', 'WebFetch'] },
      { description: 'Compare hotel options near the city center', tools: ['WebSearch'] },
      { description: 'Create itinerary document in Craft', tools: ['mcp__craft__documents_create', 'mcp__craft__blocks_add'] },
      { description: 'Add flight and hotel details to the document' },
    ],
    questions: [],
    ...overrides,
  }
}

// ============================================================================
// Playground Wrapper Props
// ============================================================================

/**
 * Props for PermissionRequest in playground context
 */
export interface PermissionRequestPlaygroundProps {
  toolName?: string
  description?: string
  command?: string
  onAction?: () => void
  unstyled?: boolean
}

/**
 * Props for ClarificationQuestion in playground context
 */
export interface ClarificationQuestionPlaygroundProps {
  header?: string
  question?: string
  options?: Array<{ label: string; description: string }>
  multiSelect?: boolean
  onAction?: () => void
  unstyled?: boolean
}

/**
 * Props for PlanReview in playground context
 */
export interface PlanReviewPlaygroundProps {
  title?: string
  summary?: string
  steps?: Array<{ description: string; tools?: string[] }>
  questions?: string[]
  onAction?: () => void
  unstyled?: boolean
}

// ============================================================================
// Adapter Functions
// ============================================================================

/**
 * Convert playground props to PermissionRequest type
 */
export function toPermissionRequest(props: PermissionRequestPlaygroundProps): PermissionRequest {
  return mockPermissionRequest({
    toolName: props.toolName,
    description: props.description,
    command: props.command,
  })
}

/**
 * Convert playground props to ClarificationQuestion type
 */
export function toClarificationQuestion(props: ClarificationQuestionPlaygroundProps): ClarificationQuestion {
  return mockClarificationQuestion({
    header: props.header,
    question: props.question,
    options: props.options,
    multiSelect: props.multiSelect,
  })
}

/**
 * Convert playground props to PlanReview type
 */
export function toPlanReview(props: PlanReviewPlaygroundProps): PlanReview {
  return mockPlanReview({
    title: props.title,
    summary: props.summary,
    steps: props.steps,
    questions: props.questions,
  })
}

/**
 * Create a no-op response handler that calls onAction
 */
export function createNoOpHandler<T>(onAction?: () => void): (response: T) => void {
  return () => {
    onAction?.()
  }
}
