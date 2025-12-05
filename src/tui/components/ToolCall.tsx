import React, { useState, memo } from 'react';
import { Box, Text } from 'ink';
import { formatDuration, truncateText } from '../utils/markdown.ts';

export interface ToolCallProps {
  toolName: string;
  status: 'pending' | 'executing' | 'completed' | 'error';
  input?: Record<string, unknown>;
  result?: string;
  isError?: boolean;
  duration?: number;
  compact?: boolean;
}

// Generate a human-readable description for a tool call
const getToolDescription = (toolName: string, input?: Record<string, unknown>): string => {
  const get = (key: string): string => {
    const val = input?.[key];
    if (val === undefined || val === null) return '';
    return typeof val === 'string' ? val : JSON.stringify(val);
  };

  const shorten = (path: string, maxLen = 40): string => {
    if (path.length <= maxLen) return path;
    // Show last part of path
    const parts = path.split('/');
    let result = parts[parts.length - 1] || path;
    if (result.length < maxLen && parts.length > 1) {
      result = '…/' + result;
    }
    return truncateText(result, maxLen);
  };

  switch (toolName.toLowerCase()) {
    // File operations
    case 'read':
      return `Read ${shorten(get('file_path'))}`;
    case 'write':
      return `Write ${shorten(get('file_path'))}`;
    case 'edit':
      return `Edit ${shorten(get('file_path'))}`;
    case 'notebookedit':
      return `Edit notebook ${shorten(get('notebook_path'))}`;

    // Search operations
    case 'glob':
      return `Find files matching ${truncateText(get('pattern'), 30)}`;
    case 'grep':
      const pattern = get('pattern');
      const glob = get('glob');
      return glob
        ? `Search "${truncateText(pattern, 20)}" in ${glob}`
        : `Search "${truncateText(pattern, 30)}"`;

    // Shell operations
    case 'bash':
      const cmd = get('command');
      return `Run ${truncateText(cmd, 50)}`;
    case 'bashoutput':
      return `Check command output`;
    case 'killshell':
      return `Stop background process`;

    // Web operations
    case 'webfetch':
      const url = get('url');
      try {
        const hostname = new URL(url).hostname;
        return `Fetch ${hostname}`;
      } catch {
        return `Fetch URL`;
      }
    case 'websearch':
      return `Search web: "${truncateText(get('query'), 35)}"`;

    // Task/agent operations
    case 'task':
      return `${get('description') || 'Run agent task'}`;

    // Other operations
    case 'todowrite':
      return `Update task list`;
    case 'askuserquestion':
      return `Ask question`;

    // MCP tools (prefixed with mcp__)
    default:
      if (toolName.startsWith('mcp__')) {
        const parts = toolName.split('__');
        const server = parts[1] || 'mcp';
        const tool = parts[2] || parts[1] || toolName;
        return `${server}: ${tool.replace(/_/g, ' ')}`;
      }
      // Fallback: format tool name nicely
      const displayName = toolName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      return displayName;
  }
};

export const ToolCall: React.FC<ToolCallProps> = memo(({
  toolName,
  status,
  input,
  result,
  isError = false,
  duration,
  compact = true,
}) => {
  const [expanded, setExpanded] = useState(false);

  // Get appropriate icon and color
  const getStatusDisplay = () => {
    switch (status) {
      case 'pending':
        return { icon: '○', color: 'gray' as const };
      case 'executing':
        return { icon: null, color: 'yellow' as const }; // spinner
      case 'completed':
        return { icon: '✓', color: 'green' as const };
      case 'error':
        return { icon: '✗', color: 'red' as const };
    }
  };

  const { icon, color } = getStatusDisplay();

  // Get human-readable description
  const description = getToolDescription(toolName, input);

  // Format tool name for display (snake_case to readable) - used in expanded view
  const displayName = toolName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  // Get result summary (only for expanded or error display)
  const getResultSummary = (): string => {
    if (!result) return '';
    // Clean up result text
    const cleaned = result.replace(/\n/g, ' ').trim();
    return truncateText(cleaned, 80);
  };

  const resultSummary = getResultSummary();

  // Compact view (single line)
  if (compact && !expanded) {
    return (
      <Box paddingLeft={1}>
        <Box>
          {status === 'executing' ? (
            <Text color="yellow">◐ </Text>
          ) : (
            <Text color={color}>{icon} </Text>
          )}
          <Text dimColor>{description}</Text>
          {status === 'completed' && duration !== undefined && (
            <Text dimColor> ({formatDuration(duration)})</Text>
          )}
          {status === 'error' && result && (
            <Text color="red"> — {truncateText(result.replace(/\n/g, ' '), 50)}</Text>
          )}
        </Box>
      </Box>
    );
  }

  // Expanded view
  return (
    <Box flexDirection="column" paddingLeft={1} marginY={1}>
      {/* Header */}
      <Box>
        {status === 'executing' ? (
          <Text color="yellow">◐</Text>
        ) : (
          <Text color={color}>{icon}</Text>
        )}
        <Text> </Text>
        <Text color="magenta" bold>{displayName}</Text>
        {duration !== undefined && (
          <Text dimColor> ({formatDuration(duration)})</Text>
        )}
      </Box>

      {/* Input */}
      {input && Object.keys(input).length > 0 && (
        <Box flexDirection="column" paddingLeft={2} marginTop={1}>
          <Text dimColor bold>Input:</Text>
          <Box paddingLeft={2} flexDirection="column">
            {Object.entries(input).map(([key, value]) => (
              <Box key={key}>
                <Text color="cyan">{key}</Text>
                <Text dimColor>: </Text>
                <Text wrap="truncate-end">
                  {typeof value === 'string'
                    ? truncateText(value, 100)
                    : JSON.stringify(value)}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Result */}
      {result && (
        <Box flexDirection="column" paddingLeft={2} marginTop={1}>
          <Text color={isError ? 'red' : 'green'} bold>
            {isError ? 'Error:' : 'Result:'}
          </Text>
          <Box paddingLeft={2}>
            <Text color={isError ? 'red' : 'gray'} wrap="wrap">
              {truncateText(result, 500)}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
});

/**
 * A group of tool calls with expand/collapse functionality
 */
export interface ToolCallGroupProps {
  tools: Array<{
    id: string;
    toolName: string;
    status: 'pending' | 'executing' | 'completed' | 'error';
    input?: Record<string, unknown>;
    result?: string;
    isError?: boolean;
    duration?: number;
  }>;
  compact?: boolean;
}

export const ToolCallGroup: React.FC<ToolCallGroupProps> = memo(({ tools, compact = true }) => {
  return (
    <Box flexDirection="column">
      {tools.map((tool) => (
        <ToolCall
          key={tool.id}
          toolName={tool.toolName}
          status={tool.status}
          input={tool.input}
          result={tool.result}
          isError={tool.isError}
          duration={tool.duration}
          compact={compact}
        />
      ))}
    </Box>
  );
});
