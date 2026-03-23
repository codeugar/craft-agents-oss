import { describe, it, expect } from 'bun:test'
import '../../../tests/setup/register-pi-model-resolver.ts'
import {
  getDefaultModelsForConnection,
  getDefaultModelForConnection,
  isCompatProvider,
  isAnthropicProvider,
  isPiProvider,
  toBedrockNativeId,
  fromBedrockNativeId,
  normalizeBedrockModelId,
} from '../llm-connections'
import { ANTHROPIC_MODELS, getModelDisplayName, getModelContextWindow, getModelShortName, isClaudeModel } from '../models'

// ============================================================
// getDefaultModelsForConnection
// ============================================================

describe('getDefaultModelsForConnection', () => {
  it('anthropic returns ANTHROPIC_MODELS (ModelDefinition[])', () => {
    const models = getDefaultModelsForConnection('anthropic')
    expect(models).toEqual(ANTHROPIC_MODELS)
    expect(models.length).toBeGreaterThan(0)
    // Verify they are ModelDefinition objects, not strings
    const first = models[0]!
    expect(typeof first).toBe('object')
    expect(typeof (first as any).id).toBe('string')
  })

  it('bedrock returns bare Anthropic models (same as anthropic)', () => {
    // providerType==='bedrock' is not the Pi SDK Bedrock path — it keeps bare IDs
    expect(getDefaultModelsForConnection('bedrock')).toEqual(ANTHROPIC_MODELS)
  })

  it('vertex returns same models as anthropic', () => {
    expect(getDefaultModelsForConnection('vertex')).toEqual(ANTHROPIC_MODELS)
  })

  it('pi with piAuthProvider returns filtered models', () => {
    const models = getDefaultModelsForConnection('pi', 'anthropic')
    expect(models.length).toBeGreaterThan(0)
    // All should have pi/ prefix in their id
    for (const m of models) {
      const id = typeof m === 'string' ? m : m.id
      expect(id.startsWith('pi/')).toBe(true)
    }
  })

  it('pi without piAuthProvider returns all Pi models', () => {
    const models = getDefaultModelsForConnection('pi')
    expect(models.length).toBeGreaterThan(0)
  })

  it('anthropic_compat returns empty list (dynamic provider)', () => {
    const models = getDefaultModelsForConnection('anthropic_compat')
    expect(models).toEqual([])
  })
})

// ============================================================
// getDefaultModelForConnection
// ============================================================

describe('getDefaultModelForConnection', () => {
  it('returns first model ID for anthropic', () => {
    const modelId = getDefaultModelForConnection('anthropic')
    expect(typeof modelId).toBe('string')
    expect(modelId.length).toBeGreaterThan(0)
    // Should match the first ANTHROPIC_MODELS entry
    expect(modelId).toBe(ANTHROPIC_MODELS[0]!.id)
  })

  // Regression: Pi 'anthropic' default must be present in its own model list
  it('regression: Pi anthropic default is in its own model list', () => {
    const defaultModel = getDefaultModelForConnection('pi', 'anthropic')
    const models = getDefaultModelsForConnection('pi', 'anthropic')
    const modelIds = models.map(m => typeof m === 'string' ? m : m.id)
    expect(modelIds).toContain(defaultModel)
  })

  it('Pi openai default is in its own model list', () => {
    const defaultModel = getDefaultModelForConnection('pi', 'openai')
    const models = getDefaultModelsForConnection('pi', 'openai')
    const modelIds = models.map(m => typeof m === 'string' ? m : m.id)
    expect(modelIds).toContain(defaultModel)
  })

  it('returns empty string for anthropic_compat (dynamic provider)', () => {
    const defaultModel = getDefaultModelForConnection('anthropic_compat')
    expect(defaultModel).toBe('')
  })

  it('returns empty string for pi_compat (dynamic provider)', () => {
    const defaultModel = getDefaultModelForConnection('pi_compat')
    expect(defaultModel).toBe('')
  })
})

// ============================================================
// Provider type guards
// ============================================================

describe('isCompatProvider', () => {
  it('returns true for anthropic_compat', () => {
    expect(isCompatProvider('anthropic_compat')).toBe(true)
  })

  it('returns true for pi_compat', () => {
    expect(isCompatProvider('pi_compat')).toBe(true)
  })

  it('returns false for anthropic', () => {
    expect(isCompatProvider('anthropic')).toBe(false)
  })

  it('returns false for pi', () => {
    expect(isCompatProvider('pi')).toBe(false)
  })
})

describe('isAnthropicProvider', () => {
  it('returns true for anthropic', () => {
    expect(isAnthropicProvider('anthropic')).toBe(true)
  })

  it('returns true for anthropic_compat', () => {
    expect(isAnthropicProvider('anthropic_compat')).toBe(true)
  })

  it('returns true for bedrock', () => {
    expect(isAnthropicProvider('bedrock')).toBe(true)
  })

  it('returns true for vertex', () => {
    expect(isAnthropicProvider('vertex')).toBe(true)
  })

  it('returns false for pi', () => {
    expect(isAnthropicProvider('pi')).toBe(false)
  })
})

describe('isPiProvider', () => {
  it('returns true for pi', () => {
    expect(isPiProvider('pi')).toBe(true)
  })

  it('returns true for pi_compat', () => {
    expect(isPiProvider('pi_compat')).toBe(true)
  })

  it('returns false for anthropic', () => {
    expect(isPiProvider('anthropic')).toBe(false)
  })
})

// ============================================================
// Bedrock model ID mapping
// ============================================================

describe('toBedrockNativeId', () => {
  it('maps bare Anthropic IDs to Bedrock-native', () => {
    expect(toBedrockNativeId('claude-opus-4-6')).toBe('anthropic.claude-opus-4-6-v1')
    expect(toBedrockNativeId('claude-sonnet-4-6')).toBe('anthropic.claude-sonnet-4-6')
    expect(toBedrockNativeId('claude-haiku-4-5-20251001')).toBe('anthropic.claude-haiku-4-5-20251001-v1:0')
  })

  it('passes through already-native IDs', () => {
    expect(toBedrockNativeId('anthropic.claude-opus-4-6-v1')).toBe('anthropic.claude-opus-4-6-v1')
    expect(toBedrockNativeId('anthropic.claude-sonnet-4-6')).toBe('anthropic.claude-sonnet-4-6')
  })

  it('passes through unknown IDs', () => {
    expect(toBedrockNativeId('some-custom-model')).toBe('some-custom-model')
    expect(toBedrockNativeId('gpt-5')).toBe('gpt-5')
  })
})

describe('fromBedrockNativeId', () => {
  it('maps Bedrock-native back to bare Anthropic', () => {
    expect(fromBedrockNativeId('anthropic.claude-opus-4-6-v1')).toBe('claude-opus-4-6')
    expect(fromBedrockNativeId('anthropic.claude-sonnet-4-6')).toBe('claude-sonnet-4-6')
    expect(fromBedrockNativeId('anthropic.claude-haiku-4-5-20251001-v1:0')).toBe('claude-haiku-4-5-20251001')
  })

  it('passes through bare IDs', () => {
    expect(fromBedrockNativeId('claude-opus-4-6')).toBe('claude-opus-4-6')
  })
})

describe('normalizeBedrockModelId', () => {
  it('strips pi/ prefix and maps to Bedrock-native', () => {
    expect(normalizeBedrockModelId('pi/claude-opus-4-6')).toBe('anthropic.claude-opus-4-6-v1')
    expect(normalizeBedrockModelId('pi/claude-sonnet-4-6')).toBe('anthropic.claude-sonnet-4-6')
  })

  it('maps bare IDs to Bedrock-native', () => {
    expect(normalizeBedrockModelId('claude-opus-4-6')).toBe('anthropic.claude-opus-4-6-v1')
  })

  it('is idempotent for already-native IDs', () => {
    expect(normalizeBedrockModelId('anthropic.claude-opus-4-6-v1')).toBe('anthropic.claude-opus-4-6-v1')
  })

  it('handles empty/undefined', () => {
    expect(normalizeBedrockModelId(undefined)).toBe('')
    expect(normalizeBedrockModelId('')).toBe('')
  })
})

// ============================================================
// Bedrock-aware display and lookup
// ============================================================

describe('Bedrock-native model display', () => {
  it('getModelDisplayName resolves Bedrock-native IDs', () => {
    expect(getModelDisplayName('anthropic.claude-opus-4-6-v1')).toBe('Opus 4.6')
    expect(getModelDisplayName('anthropic.claude-sonnet-4-6')).toBe('Sonnet 4.6')
    expect(getModelDisplayName('anthropic.claude-haiku-4-5-20251001-v1:0')).toBe('Haiku 4.5')
  })

  it('getModelShortName resolves Bedrock-native IDs', () => {
    expect(getModelShortName('anthropic.claude-opus-4-6-v1')).toBe('Opus')
    expect(getModelShortName('anthropic.claude-sonnet-4-6')).toBe('Sonnet')
  })

  it('getModelContextWindow resolves Bedrock-native IDs', () => {
    expect(getModelContextWindow('anthropic.claude-opus-4-6-v1')).toBe(1_000_000)
    expect(getModelContextWindow('anthropic.claude-sonnet-4-6')).toBe(200_000)
  })

  it('isClaudeModel recognizes Bedrock-native IDs', () => {
    expect(isClaudeModel('anthropic.claude-opus-4-6-v1')).toBe(true)
    expect(isClaudeModel('anthropic.claude-sonnet-4-6')).toBe(true)
    expect(isClaudeModel('anthropic.claude-haiku-4-5-20251001-v1:0')).toBe(true)
  })
})
