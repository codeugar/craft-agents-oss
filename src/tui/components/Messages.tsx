import React, { memo, useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { ToolCall } from './ToolCall.tsx';
import { ThinkingIndicator } from './Spinner.tsx';
import { useElapsedTime } from '../hooks/useElapsedTime.ts';
import { renderMarkdown } from '../utils/markdown.ts';

export interface Message {
  id: string;
  type: 'user' | 'assistant' | 'tool' | 'error' | 'status' | 'system';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolStatus?: 'pending' | 'executing' | 'completed' | 'error';
  toolDuration?: number;
  isError?: boolean;
  isStreaming?: boolean;
  timestamp?: number;
}

export interface MessagesProps {
  messages: Message[];
  isProcessing: boolean;
  streamingText?: string;
  status?: string;
  processingStartTime?: number | null;
  compact?: boolean;
}

export const Messages: React.FC<MessagesProps> = memo(({
  messages,
  isProcessing,
  streamingText,
  status,
  processingStartTime,
  compact = true,
}) => {
  // Track elapsed time since processing started
  const elapsed = useElapsedTime({
    startTime: processingStartTime ?? null,
    enabled: isProcessing && !streamingText,
  });

  return (
    <Box flexDirection="column">
      {/* Render all messages */}
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          compact={compact}
        />
      ))}

      {/* Show streaming text */}
      {streamingText && (
        <StreamingMessage content={streamingText} />
      )}

      {/* Show thinking indicator when processing but no streaming text yet */}
      {isProcessing && !streamingText && (
        <ThinkingIndicator status={status} elapsedMs={elapsed ?? undefined} />
      )}
    </Box>
  );
});

interface MessageItemProps {
  message: Message;
  compact?: boolean;
}

const MessageItem: React.FC<MessageItemProps> = memo(({ message, compact = true }) => {
  switch (message.type) {
    case 'user':
      return <UserMessage content={message.content} />;

    case 'assistant':
      return <AssistantMessage content={message.content} />;

    case 'tool':
      return (
        <ToolCall
          toolName={message.toolName || 'unknown'}
          status={message.toolStatus || 'completed'}
          input={message.toolInput}
          result={message.content}
          isError={message.isError}
          duration={message.toolDuration}
          startTime={message.timestamp}
          compact={compact}
        />
      );

    case 'error':
      return <ErrorMessage content={message.content} />;

    case 'status':
      return <StatusMessage content={message.content} />;

    case 'system':
      return <SystemMessage content={message.content} />;

    default:
      return null;
  }
});

// User message with blue styling
const UserMessage: React.FC<{ content: string }> = memo(({ content }) => {
  return (
    <Box marginTop={1} marginBottom={1}>
      <Box>
        <Text color="blue" bold>{'> '}</Text>
        <Text color="white" bold>{content}</Text>
      </Box>
    </Box>
  );
});

// Assistant message - renders markdown with Tokyo Night theme
const AssistantMessage: React.FC<{ content: string }> = memo(({ content }) => {
  const rendered = renderMarkdown(content);
  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Text>{rendered}</Text>
    </Box>
  );
});

// Streaming message - debounced markdown rendering (max 5 times per second)
const RENDER_DEBOUNCE_MS = 200;

const StreamingMessage: React.FC<{ content: string }> = ({ content }) => {
  const [renderedContent, setRenderedContent] = useState('');
  const lastRenderTime = useRef(0);
  const pendingContent = useRef(content);

  useEffect(() => {
    pendingContent.current = content;

    const now = Date.now();
    const timeSinceLastRender = now - lastRenderTime.current;

    if (timeSinceLastRender >= RENDER_DEBOUNCE_MS) {
      // Render immediately if enough time has passed
      lastRenderTime.current = now;
      setRenderedContent(renderMarkdown(content));
    } else {
      // Schedule a render after the remaining debounce time
      const timeoutId = setTimeout(() => {
        lastRenderTime.current = Date.now();
        setRenderedContent(renderMarkdown(pendingContent.current));
      }, RENDER_DEBOUNCE_MS - timeSinceLastRender);

      return () => clearTimeout(timeoutId);
    }
  }, [content]);

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Text>{renderedContent}<Text color="blue">▌</Text></Text>
    </Box>
  );
};

// Error message with red styling
const ErrorMessage: React.FC<{ content: string }> = memo(({ content }) => {
  return (
    <Box marginTop={1} marginBottom={1}>
      <Box borderStyle="round" borderColor="red" paddingX={1}>
        <Text color="red" bold>Error: </Text>
        <Text color="red">{content}</Text>
      </Box>
    </Box>
  );
});

// Status message (dimmed)
const StatusMessage: React.FC<{ content: string }> = memo(({ content }) => {
  return (
    <Box marginY={1}>
      <Text dimColor>{content}</Text>
    </Box>
  );
});

// System message (for internal notifications)
const SystemMessage: React.FC<{ content: string }> = memo(({ content }) => {
  return (
    <Box marginY={1} paddingX={1}>
      <Text color="yellow" dimColor>{'─ '}</Text>
      <Text dimColor italic>{content}</Text>
      <Text color="yellow" dimColor>{' ─'}</Text>
    </Box>
  );
});

// Separator component
export const MessageSeparator: React.FC = () => {
  return (
    <Box marginY={1}>
      <Text dimColor>{'─'.repeat(40)}</Text>
    </Box>
  );
};
