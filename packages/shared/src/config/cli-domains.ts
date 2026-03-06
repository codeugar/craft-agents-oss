export type CliDomainNamespace = 'label' | 'source' | 'skill' | 'automation'

export interface CliDomainPolicy {
  namespace: CliDomainNamespace
  helpCommand: string
  workspacePathScopes: string[]
  readActions: string[]
  quickExamples: string[]
  /** Optional workspace-relative paths guarded for direct Bash operations */
  bashGuardPaths?: string[]
}

const POLICIES: Record<CliDomainNamespace, CliDomainPolicy> = {
  label: {
    namespace: 'label',
    helpCommand: 'craft-agent label --help',
    workspacePathScopes: ['labels/**'],
    readActions: ['list', 'get'],
    quickExamples: [
      'craft-agent label list',
      'craft-agent label create --name "Bug" --color "accent"',
      'craft-agent label update bug --json \'{"name":"Bug Report"}\'',
    ],
    bashGuardPaths: ['labels/**'],
  },
  source: {
    namespace: 'source',
    helpCommand: 'craft-agent source --help',
    workspacePathScopes: ['sources/**'],
    readActions: ['list', 'get', 'validate', 'test'],
    quickExamples: [
      'craft-agent source list',
      'craft-agent source get <slug>',
      'craft-agent source update <slug> --json "{...}"',
      'craft-agent source validate <slug>',
    ],
  },
  skill: {
    namespace: 'skill',
    helpCommand: 'craft-agent skill --help',
    workspacePathScopes: ['skills/**'],
    readActions: ['list', 'get', 'validate', 'where'],
    quickExamples: [
      'craft-agent skill list',
      'craft-agent skill get <slug>',
      'craft-agent skill update <slug> --json "{...}"',
      'craft-agent skill validate <slug>',
    ],
  },
  automation: {
    namespace: 'automation',
    helpCommand: 'craft-agent automation --help',
    workspacePathScopes: ['automations.json', 'automations-history.jsonl'],
    readActions: ['list', 'get', 'validate', 'history', 'last-executed', 'test', 'lint'],
    quickExamples: [
      'craft-agent automation list',
      'craft-agent automation create --event UserPromptSubmit --prompt "Summarize this prompt"',
      'craft-agent automation update <id> --json "{\"enabled\":false}"',
      'craft-agent automation history <id> --limit 20',
      'craft-agent automation validate',
    ],
    bashGuardPaths: ['automations.json', 'automations-history.jsonl'],
  },
}

export const CLI_DOMAIN_POLICIES = POLICIES

export interface BashPatternRule {
  pattern: string
  comment: string
}

/**
 * Derive the canonical Explore-mode read-only craft-agent bash patterns from
 * CLI domain policies. Keeps permissions regexes aligned with command metadata.
 */
export function getCraftAgentReadOnlyBashPatterns(): BashPatternRule[] {
  const namespaces = Object.keys(POLICIES) as CliDomainNamespace[]
  const namespaceAlternation = namespaces.join('|')

  const rules: BashPatternRule[] = namespaces.map((namespace) => {
    const policy = POLICIES[namespace]
    const actions = policy.readActions.join('|')
    return {
      pattern: `^craft-agent\\s+${namespace}\\s+(${actions})\\b`,
      comment: `craft-agent ${namespace} read-only operations`,
    }
  })

  rules.push(
    { pattern: '^craft-agent\\s*$', comment: 'craft-agent bare invocation (prints help)' },
    { pattern: `^craft-agent\\s+(${namespaceAlternation})\\s*$`, comment: 'craft-agent entity help' },
    { pattern: `^craft-agent\\s+(${namespaceAlternation})\\s+--help\\b`, comment: 'craft-agent entity help flags' },
    { pattern: '^craft-agent\\s+--(help|version|discover)\\b', comment: 'craft-agent global flags' },
  )

  return rules
}

export function getCliDomainPolicy(namespace: CliDomainNamespace): CliDomainPolicy {
  return POLICIES[namespace]
}
