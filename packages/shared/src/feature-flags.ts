/**
 * Feature flags for controlling experimental or in-development features.
 */

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value == null) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

const developerFeedbackOverride = parseBooleanEnv(process.env.CRAFT_FEATURE_DEVELOPER_FEEDBACK);
const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
const isDevRuntime = nodeEnv === 'development' || nodeEnv === 'dev' || process.env.CRAFT_DEBUG === '1';

export const FEATURE_FLAGS = {
  /** Enable Opus 4.6 fast mode (speed:"fast" + beta header). 6x pricing. */
  fastMode: false,
  /**
   * Enable agent developer feedback tool.
   *
   * Defaults to enabled in explicit development runtimes; disabled otherwise.
   * Override with CRAFT_FEATURE_DEVELOPER_FEEDBACK=1|0.
   */
  developerFeedback: developerFeedbackOverride ?? isDevRuntime,
} as const;
