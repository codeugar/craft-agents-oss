import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { ToolCall } from './ToolCall.tsx';
import { ThinkingIndicator } from './Spinner.tsx';

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
  compact?: boolean;
}

export const Messages: React.FC<MessagesProps> = memo(({
  messages,
  isProcessing,
  streamingText,
  status,
  compact = true,
}) => {
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
        <ThinkingIndicator status={status} />
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

// Assistant message - plain text for consistency with streaming
const AssistantMessage: React.FC<{ content: string }> = memo(({ content }) => {
  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Text>{content}</Text>
    </Box>
  );
});

// Streaming message - same style as assistant message with cursor
const StreamingMessage: React.FC<{ content: string }> = ({ content }) => {
  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Text>{content}<Text color="blue">▌</Text></Text>
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
