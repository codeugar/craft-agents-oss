import React, { useCallback, useState } from 'react';
import { Box, useApp, useInput, Text } from 'ink';
import { Header, WelcomeBanner } from './components/Header.tsx';
import { Messages, type Message } from './components/Messages.tsx';
import { Input, InputHint } from './components/Input.tsx';
import { ModelSelector, type Model } from './components/ModelSelector.tsx';
import { useAgent } from './hooks/useAgent.ts';
import { useHistory } from './hooks/useHistory.ts';
import { useResize } from './hooks/useResize.ts';
import { formatToolsHelp } from '../mcp/tools.ts';
import { getConfigPath } from '../config/storage.ts';
import { formatPreferencesDisplay, getPreferencesPath } from '../config/preferences.ts';
import { formatTokens, estimateCost } from './utils/markdown.ts';
import { processInputWithFiles, formatAttachmentDisplay, readClipboardImage, type FileAttachment } from './utils/files.ts';
import type { CraftAgentConfig } from '../agent/craft-agent.ts';

export interface AppProps {
  config: CraftAgentConfig;
  onRequestSetup?: () => void;
}

const HELP_TEXT = `
**Craft Document Assistant** - Commands

**Chat**
  Just type your message and press Enter to chat with Claude.

**Commands**
  /help      Show this help message
  /clear     Clear conversation history
  /paste     Paste image from clipboard
  /tools     List available Craft MCP tools
  /config    Show current configuration
  /prefs     Show user preferences
  /setup     Reconfigure API keys and MCP settings
  /compact   Toggle compact/expanded tool output
  /cost      Show token usage and estimated cost
  /model     Show or change model (e.g., /model opus)
  /web       Toggle web search capability
  /fetch     Toggle web fetch capability
  /code      Toggle code execution capability
  /exit      Exit the application (or Ctrl+C)

**Keyboard Shortcuts**
  Enter      Send message
  ↑/↓        Navigate command history
  Ctrl+C     Interrupt / Exit
  Ctrl+U     Clear input line
  Esc        Interrupt current operation

**Examples**
  "Show me today's daily note"
  "Search for meeting notes about project X"
  "What's the weather in NYC?" (uses web search)
  "Fetch and summarize https://example.com" (uses web fetch)
  "Calculate the sum of 1 to 100" (uses code execution)
`.trim();

export const App: React.FC<AppProps> = ({ config, onRequestSetup }) => {
  const { exit } = useApp();

  // Handle terminal resize - clears screen to prevent artifacts
  useResize();

  const {
    messages,
    isProcessing,
    streamingText,
    status,
    connected,
    tokenUsage,
    sendMessage,
    clearMessages,
    interrupt,
    getModel,
    setModel,
    isWebSearchEnabled,
    setWebSearchEnabled,
    isWebFetchEnabled,
    setWebFetchEnabled,
    isCodeExecutionEnabled,
    setCodeExecutionEnabled,
  } = useAgent(config);

  const { history, addToHistory } = useHistory();
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [compactMode, setCompactMode] = useState(true);
  const [showWelcome, setShowWelcome] = useState(true);
  const [pendingAttachments, setPendingAttachments] = useState<FileAttachment[]>([]);
  const [showModelSelector, setShowModelSelector] = useState(false);

  // Models list
  const models: Model[] = [
    { id: 'claude-opus-4-5-20251101', name: 'Opus 4.5', desc: 'Most capable' },
    { id: 'claude-sonnet-4-5-20250929', name: 'Sonnet 4.5', desc: 'Balanced' },
    { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5', desc: 'Fast & efficient' },
  ];

  const addLocalMessage = useCallback((content: string, type: Message['type'] = 'status') => {
    setLocalMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, type, content, timestamp: Date.now() },
    ]);
  }, []);

  const handleModelSelect = useCallback((modelId: string) => {
    setShowModelSelector(false);
    setModel(modelId);
  }, [setModel]);

  const handleModelCancel = useCallback(() => {
    setShowModelSelector(false);
  }, []);

  const handlePaste = useCallback(() => {
    const clipboardImage = readClipboardImage();
    if (clipboardImage) {
      setPendingAttachments(prev => [...prev, clipboardImage]);
      addLocalMessage(`📎 Image from clipboard (${Math.round(clipboardImage.size / 1024)}KB)`, 'system');
    }
  }, [addLocalMessage]);

  const handleSubmit = useCallback(
    async (input: string) => {
      // Hide welcome on first interaction
      if (showWelcome) {
        setShowWelcome(false);
      }

      // Handle slash commands
      if (input.startsWith('/')) {
        const parts = input.toLowerCase().trim().split(/\s+/);
        const command = parts[0];

        switch (command) {
          case '/exit':
          case '/quit':
          case '/q':
            exit();
            return;

          case '/clear':
            // Clear the terminal screen
            process.stdout.write('\x1b[2J\x1b[H');
            clearMessages();
            setLocalMessages([]);
            setPendingAttachments([]);
            return;

          case '/paste':
          case '/image': {
            const clipboardImage = readClipboardImage();
            if (clipboardImage) {
              setPendingAttachments(prev => [...prev, clipboardImage]);
              addLocalMessage(`📎 Image from clipboard attached (${Math.round(clipboardImage.size / 1024)}KB)`, 'system');
            } else {
              addLocalMessage('No image found in clipboard. Copy an image first (Cmd+C on a screenshot or image).', 'error');
            }
            return;
          }

          case '/help':
          case '/?':
            addLocalMessage(HELP_TEXT, 'assistant');
            return;

          case '/tools':
            addLocalMessage(formatToolsHelp(), 'assistant');
            return;

          case '/setup':
            if (onRequestSetup) {
              onRequestSetup();
            } else {
              addLocalMessage('Setup not available. Run with --setup flag to reconfigure.', 'status');
            }
            return;

          case '/config':
            addLocalMessage(
              `**Configuration**

- Config file: \`${getConfigPath()}\`
- MCP URL: \`${config.mcpUrl}\`
- Model: \`${getModel()}\`
- Compact mode: ${compactMode ? 'On' : 'Off'}
- Web search: ${isWebSearchEnabled() ? 'On' : 'Off'}
- Web fetch: ${isWebFetchEnabled() ? 'On' : 'Off'}
- Code execution: ${isCodeExecutionEnabled() ? 'On' : 'Off'}`,
              'assistant'
            );
            return;

          case '/prefs':
          case '/preferences':
            addLocalMessage(formatPreferencesDisplay(), 'assistant');
            return;

          case '/compact':
            setCompactMode(!compactMode);
            addLocalMessage(
              `Compact mode: ${!compactMode ? 'On' : 'Off'}`,
              'system'
            );
            return;

          case '/cost':
            const cost = estimateCost(tokenUsage.inputTokens, tokenUsage.outputTokens);
            addLocalMessage(
              `**Token Usage (this session)**

- Input tokens: ${formatTokens(tokenUsage.inputTokens)}
- Output tokens: ${formatTokens(tokenUsage.outputTokens)}
- Total tokens: ${formatTokens(tokenUsage.totalTokens)}
- Estimated cost: ${cost}`,
              'assistant'
            );
            return;

          case '/model': {
            const modelArg = parts[1];

            if (modelArg) {
              // Parse number selection
              const num = parseInt(modelArg, 10);
              if (num >= 1 && num <= models.length) {
                const selected = models[num - 1];
                if (selected) {
                  setModel(selected.id);
                  addLocalMessage(`Model: ${selected.name}`, 'system');
                }
                return;
              }

              // Find matching model (partial match)
              const matchedModel = models.find(m =>
                m.id.toLowerCase().includes(modelArg.toLowerCase()) ||
                m.name.toLowerCase().includes(modelArg.toLowerCase())
              );

              if (matchedModel) {
                setModel(matchedModel.id);
                addLocalMessage(`Model: ${matchedModel.name}`, 'system');
              } else {
                addLocalMessage(`Unknown model: ${modelArg}`, 'error');
              }
            } else {
              // Show interactive selector
              setShowModelSelector(true);
            }
            return;
          }

          case '/web':
          case '/websearch': {
            const newState = !isWebSearchEnabled();
            setWebSearchEnabled(newState);
            addLocalMessage(
              `Web search: ${newState ? 'Enabled' : 'Disabled'}`,
              'system'
            );
            return;
          }

          case '/fetch':
          case '/webfetch': {
            const newState = !isWebFetchEnabled();
            setWebFetchEnabled(newState);
            addLocalMessage(
              `Web fetch: ${newState ? 'Enabled' : 'Disabled'}`,
              'system'
            );
            return;
          }

          case '/code':
          case '/codeexec':
          case '/execute': {
            const newState = !isCodeExecutionEnabled();
            setCodeExecutionEnabled(newState);
            addLocalMessage(
              `Code execution: ${newState ? 'Enabled' : 'Disabled'}`,
              'system'
            );
            return;
          }

          default:
            addLocalMessage(`Unknown command: ${command}. Type /help for available commands.`, 'error');
            return;
        }
      }

      // Clear local messages when sending a real message
      setLocalMessages([]);

      // Process input for file attachments
      const { text, attachments: fileAttachments, errors } = processInputWithFiles(input);

      // Combine file attachments with pending clipboard attachments
      const allAttachments = [...pendingAttachments, ...fileAttachments];

      // Clear pending attachments
      setPendingAttachments([]);

      // Show any file processing errors
      for (const error of errors) {
        addLocalMessage(error, 'error');
      }

      // Show what files are being attached
      if (allAttachments.length > 0) {
        const attachmentList = allAttachments.map(formatAttachmentDisplay).join('\n');
        addLocalMessage(`Attaching:\n${attachmentList}`, 'system');
      }

      // Regular message - add to history and send with attachments
      addToHistory(input);
      await sendMessage(text || input, allAttachments.length > 0 ? allAttachments : undefined);
    },
    [
      exit,
      clearMessages,
      sendMessage,
      addToHistory,
      addLocalMessage,
      onRequestSetup,
      config,
      compactMode,
      tokenUsage,
      showWelcome,
      getModel,
      setModel,
      isWebSearchEnabled,
      setWebSearchEnabled,
      isWebFetchEnabled,
      setWebFetchEnabled,
      isCodeExecutionEnabled,
      setCodeExecutionEnabled,
      pendingAttachments,
    ]
  );

  // Handle Ctrl+C to interrupt or exit
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      if (isProcessing) {
        interrupt();
      } else {
        exit();
      }
    }

    // Handle Escape to interrupt
    if (key.escape && isProcessing) {
      interrupt();
    }
  });

  // Combine agent messages with local messages
  const allMessages = [...messages, ...localMessages];

  return (
    <Box flexDirection="column" width="100%" minHeight={20}>
      {/* Welcome banner (shown once) */}
      {showWelcome && allMessages.length === 0 && (
        <Box flexDirection="column" paddingX={1}>
          <WelcomeBanner />
          <Box marginTop={1}>
            <Text dimColor>
              Type a message to get started, or /help for commands.
            </Text>
          </Box>
        </Box>
      )}

      {/* Messages area */}
      <Box flexDirection="column" paddingX={1}>
        <Messages
          messages={allMessages}
          isProcessing={isProcessing}
          streamingText={streamingText}
          status={status}
          compact={compactMode}
        />
      </Box>

      {/* Model selector overlay */}
      {showModelSelector && (
        <ModelSelector
          models={models}
          currentModelId={getModel()}
          onSelect={handleModelSelect}
          onCancel={handleModelCancel}
        />
      )}

      {/* Input + Status bar + Header together at bottom */}
      <Box flexDirection="column" width="100%" paddingX={1}>
        {!showModelSelector && (
          <Input
            onSubmit={handleSubmit}
            onPaste={handlePaste}
            disabled={isProcessing}
            history={history}
            attachmentCount={pendingAttachments.length}
          />
        )}
        <Header
          connected={connected}
          model={config.model}
          mcpUrl={config.mcpUrl}
          inputTokens={tokenUsage.inputTokens}
          outputTokens={tokenUsage.outputTokens}
        />
      </Box>
    </Box>
  );
};
