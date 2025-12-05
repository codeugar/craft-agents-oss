import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { saveConfig, getConfigPath, type StoredConfig } from '../../config/storage.ts';
import { CraftOAuth, getMcpBaseUrl } from '../../auth/oauth.ts';

// Simple text input without cursor animation
const SimpleTextInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  mask?: string;
}> = ({ value, onChange, onSubmit, placeholder = '', mask }) => {
  useInput((input, key) => {
    if (key.return) {
      onSubmit(value);
      return;
    }

    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
      return;
    }

    // Ignore control characters
    if (key.ctrl || key.meta || key.escape || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
      return;
    }

    // Add printable characters
    if (input && input.length === 1 && input.charCodeAt(0) >= 32) {
      onChange(value + input);
    }
  });

  const displayValue = mask ? mask.repeat(value.length) : value;
  const showPlaceholder = value.length === 0;

  return (
    <Text>
      {showPlaceholder ? (
        <Text dimColor>{placeholder}</Text>
      ) : (
        <Text>{displayValue}</Text>
      )}
      <Text color="green">▌</Text>
    </Text>
  );
};

type SetupStep = 'welcome' | 'api-key' | 'mcp-url' | 'checking-auth' | 'oauth-auth' | 'confirm' | 'testing' | 'complete' | 'error';

export interface SetupProps {
  onComplete: (config: StoredConfig) => void;
  onCancel: () => void;
}

export const Setup: React.FC<SetupProps> = ({ onComplete, onCancel }) => {
  const { exit } = useApp();
  const [step, setStep] = useState<SetupStep>('welcome');
  const [apiKey, setApiKey] = useState('');
  const [mcpUrl, setMcpUrl] = useState('');
  const [oauthStatus, setOauthStatus] = useState('');
  const [oauthResult, setOauthResult] = useState<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    clientId: string;
    tokenType: string;
  } | null>(null);
  const [isPublicServer, setIsPublicServer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [oauthClient, setOauthClient] = useState<CraftOAuth | null>(null);

  // Handle Ctrl+C to cancel
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      if (step === 'welcome') {
        exit();
      } else {
        // Cancel OAuth flow if in progress
        if (oauthClient) {
          oauthClient.cancel();
          setOauthClient(null);
        }
        onCancel();
      }
    }

    // Toggle visibility for sensitive fields
    if (key.ctrl && input === 'v') {
      if (step === 'api-key') setShowApiKey(!showApiKey);
    }
  });

  const handleWelcome = useCallback(() => {
    setStep('api-key');
  }, []);

  const handleApiKey = useCallback((value: string) => {
    if (!value.trim()) return;
    setApiKey(value.trim());
    setStep('mcp-url');
  }, []);

  const handleMcpUrl = useCallback((value: string) => {
    if (!value.trim()) return;

    // Basic URL validation
    try {
      new URL(value.trim());
      setMcpUrl(value.trim());
      setStep('checking-auth');
    } catch {
      setError('Please enter a valid URL');
    }
  }, []);

  // Check if OAuth is required when entering checking-auth step
  useEffect(() => {
    if (step !== 'checking-auth' || !mcpUrl) return;

    const mcpBaseUrl = getMcpBaseUrl(mcpUrl);
    const oauth = new CraftOAuth(
      { mcpBaseUrl },
      {
        onStatus: (message) => setOauthStatus(message),
        onError: () => {},
      }
    );

    setOauthStatus('Checking server authentication requirements...');

    oauth.checkAuthRequired()
      .then((authRequired) => {
        if (authRequired) {
          setIsPublicServer(false);
          setStep('oauth-auth');
        } else {
          setIsPublicServer(true);
          setOauthStatus('Server is public - no authentication required');
          setStep('confirm');
        }
      })
      .catch(() => {
        // If we can't check, assume it's public
        setIsPublicServer(true);
        setOauthStatus('Could not verify - assuming public server');
        setStep('confirm');
      });
  }, [step, mcpUrl]);

  // Start OAuth flow when entering oauth-auth step
  useEffect(() => {
    if (step !== 'oauth-auth' || !mcpUrl) return;

    const mcpBaseUrl = getMcpBaseUrl(mcpUrl);
    const oauth = new CraftOAuth(
      { mcpBaseUrl },
      {
        onStatus: (message) => setOauthStatus(message),
        onError: (errorMsg) => {
          setError(errorMsg);
          setStep('error');
        },
      }
    );

    setOauthClient(oauth);

    oauth.authenticate()
      .then(({ tokens, clientId }) => {
        setOauthResult({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          clientId,
          tokenType: tokens.tokenType,
        });
        setOauthClient(null);
        setStep('confirm');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'OAuth authentication failed');
        setOauthClient(null);
        setStep('error');
      });

    return () => {
      oauth.cancel();
    };
  }, [step, mcpUrl]);

  const handleConfirm = useCallback(() => {
    // For OAuth servers, we need oauthResult
    if (!isPublicServer && !oauthResult) {
      setError('OAuth authentication not completed');
      setStep('error');
      return;
    }

    setStep('testing');

    // Build config based on whether it's public or OAuth
    const config: StoredConfig = {
      anthropicApiKey: apiKey,
      craftMcpUrl: mcpUrl,
      isPublic: isPublicServer,
      ...(oauthResult && {
        oauth: {
          accessToken: oauthResult.accessToken,
          refreshToken: oauthResult.refreshToken,
          expiresAt: oauthResult.expiresAt,
          clientId: oauthResult.clientId,
          tokenType: oauthResult.tokenType,
        },
      }),
    };

    try {
      saveConfig(config);
      setStep('complete');

      // Give user a moment to see success message
      setTimeout(() => {
        onComplete(config);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
      setStep('error');
    }
  }, [apiKey, mcpUrl, oauthResult, isPublicServer, onComplete]);

  const handleBack = useCallback(() => {
    setError(null);
    // Cancel any ongoing OAuth flow
    if (oauthClient) {
      oauthClient.cancel();
      setOauthClient(null);
    }
    switch (step) {
      case 'api-key':
        setStep('welcome');
        break;
      case 'mcp-url':
        setStep('api-key');
        break;
      case 'checking-auth':
      case 'oauth-auth':
        setStep('mcp-url');
        break;
      case 'confirm':
        setStep('mcp-url'); // Go back to URL, will re-check auth
        setOauthResult(null);
        setIsPublicServer(false);
        break;
      case 'error':
        setStep('mcp-url');
        setOauthResult(null);
        setIsPublicServer(false);
        break;
    }
  }, [step, oauthClient]);

  const maskValue = (value: string, show: boolean): string => {
    if (show || !value) return value;
    if (value.length <= 8) return '*'.repeat(value.length);
    return value.slice(0, 4) + '*'.repeat(value.length - 8) + value.slice(-4);
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
        paddingY={1}
        marginBottom={1}
      >
        <Text bold color="cyan">Craft TUI Agent - Setup</Text>
      </Box>

      {/* Progress indicator */}
      <Box marginBottom={1}>
        <Text dimColor>
          Step {getStepNumber(step)} of 4:{' '}
        </Text>
        <Text>{getStepName(step)}</Text>
      </Box>

      {/* Step content */}
      <Box flexDirection="column" marginY={1}>
        {step === 'welcome' && (
          <WelcomeStep onContinue={handleWelcome} />
        )}

        {step === 'api-key' && (
          <InputStep
            title="Anthropic API Key"
            description="Enter your Anthropic API key. You can get one from https://console.anthropic.com/"
            placeholder="sk-ant-..."
            value={apiKey}
            masked={!showApiKey}
            onSubmit={handleApiKey}
            onBack={handleBack}
            hint="Press Ctrl+V to toggle visibility"
          />
        )}

        {step === 'mcp-url' && (
          <InputStep
            title="Craft MCP Server URL"
            description="Enter the URL of your Craft MCP server."
            placeholder="https://mcp.craft.do/links/YOUR_LINK_ID"
            value={mcpUrl}
            onSubmit={handleMcpUrl}
            onBack={handleBack}
            error={error}
          />
        )}

        {step === 'checking-auth' && (
          <Box flexDirection="column">
            <Text bold>Checking Server</Text>
            <Box marginY={1}>
              <Text color="cyan">●</Text>
              <Text> {oauthStatus || 'Connecting to server...'}</Text>
            </Box>
          </Box>
        )}

        {step === 'oauth-auth' && (
          <OAuthStep
            status={oauthStatus}
            onBack={handleBack}
          />
        )}

        {step === 'confirm' && (
          <ConfirmStep
            apiKey={maskValue(apiKey, false)}
            mcpUrl={mcpUrl}
            isPublic={isPublicServer}
            oauthAuthenticated={!!oauthResult}
            onConfirm={handleConfirm}
            onBack={handleBack}
          />
        )}

        {step === 'testing' && (
          <Box flexDirection="column">
            <Box>
              <Text color="cyan">●</Text>
              <Text> Saving configuration...</Text>
            </Box>
          </Box>
        )}

        {step === 'complete' && (
          <Box flexDirection="column">
            <Text color="green" bold>✓ Configuration saved successfully!</Text>
            <Text dimColor>Config stored at: {getConfigPath()}</Text>
            <Box marginTop={1}>
              <Text>Starting Craft TUI Agent...</Text>
            </Box>
          </Box>
        )}

        {step === 'error' && (
          <Box flexDirection="column">
            <Text color="red" bold>✗ Setup failed</Text>
            <Text color="red">{error}</Text>
            <Box marginTop={1}>
              <Text dimColor>Press Enter to retry, or Ctrl+C to exit</Text>
            </Box>
          </Box>
        )}
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>
          Press Ctrl+C to cancel | Esc to go back
        </Text>
      </Box>
    </Box>
  );
};

function getStepNumber(step: SetupStep): number {
  switch (step) {
    case 'welcome': return 1;
    case 'api-key': return 1;
    case 'mcp-url': return 2;
    case 'checking-auth': return 3;
    case 'oauth-auth': return 3;
    case 'confirm':
    case 'testing':
    case 'complete':
    case 'error':
      return 4;
  }
}

function getStepName(step: SetupStep): string {
  switch (step) {
    case 'welcome': return 'Welcome';
    case 'api-key': return 'API Key';
    case 'mcp-url': return 'MCP URL';
    case 'checking-auth': return 'Checking...';
    case 'oauth-auth': return 'Authorization';
    case 'confirm': return 'Confirm';
    case 'testing': return 'Saving...';
    case 'complete': return 'Complete';
    case 'error': return 'Error';
  }
}

// Sub-components

interface WelcomeStepProps {
  onContinue: () => void;
}

const WelcomeStep: React.FC<WelcomeStepProps> = ({ onContinue }) => {
  useInput((input, key) => {
    if (key.return) {
      onContinue();
    }
  });

  return (
    <Box flexDirection="column">
      <Text>Welcome to <Text bold color="cyan">Craft TUI Agent</Text>!</Text>
      <Box marginY={1}>
        <Text>
          This setup will help you configure your connection to Claude and your Craft MCP server.
        </Text>
      </Box>
      <Box marginY={1}>
        <Text>You'll need:</Text>
      </Box>
      <Box flexDirection="column" marginLeft={2}>
        <Text>• An Anthropic API key (from console.anthropic.com)</Text>
        <Text>• Your Craft MCP server URL (workflow link)</Text>
        <Text>• A browser to complete OAuth authorization</Text>
      </Box>
      <Box marginTop={2}>
        <Text color="green" bold>Press Enter to continue...</Text>
      </Box>
    </Box>
  );
};

interface InputStepProps {
  title: string;
  description: string;
  placeholder: string;
  value: string;
  masked?: boolean;
  onSubmit: (value: string) => void;
  onBack: () => void;
  hint?: string;
  error?: string | null;
}

const InputStep: React.FC<InputStepProps> = ({
  title,
  description,
  placeholder,
  value: initialValue,
  masked = false,
  onSubmit,
  onBack,
  hint,
  error,
}) => {
  const [value, setValue] = useState(initialValue);

  useInput((input, key) => {
    if (key.escape) {
      onBack();
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold>{title}</Text>
      <Box marginY={1}>
        <Text dimColor>{description}</Text>
      </Box>
      {error && (
        <Box marginBottom={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}
      <Box>
        <Text color="green">&gt; </Text>
        <SimpleTextInput
          value={value}
          onChange={setValue}
          onSubmit={onSubmit}
          placeholder={placeholder}
          mask={masked ? '*' : undefined}
        />
      </Box>
      {hint && (
        <Box marginTop={1}>
          <Text dimColor>{hint}</Text>
        </Box>
      )}
    </Box>
  );
};

interface OAuthStepProps {
  status: string;
  onBack: () => void;
}

const OAuthStep: React.FC<OAuthStepProps> = ({ status, onBack }) => {
  useInput((input, key) => {
    if (key.escape) {
      onBack();
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold>OAuth Authorization</Text>
      <Box marginY={1}>
        <Text dimColor>
          A browser window will open for you to authorize access to your Craft documents.
        </Text>
      </Box>
      <Box marginY={1}>
        <Text color="cyan">●</Text>
        <Text> {status}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Complete the authorization in your browser, then return here.</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press Esc to go back and cancel</Text>
      </Box>
    </Box>
  );
};

interface ConfirmStepProps {
  apiKey: string;
  mcpUrl: string;
  isPublic: boolean;
  oauthAuthenticated: boolean;
  onConfirm: () => void;
  onBack: () => void;
}

const ConfirmStep: React.FC<ConfirmStepProps> = ({
  apiKey,
  mcpUrl,
  isPublic,
  oauthAuthenticated,
  onConfirm,
  onBack,
}) => {
  useInput((input, key) => {
    if (key.return) {
      onConfirm();
    }
    if (key.escape) {
      onBack();
    }
  });

  const getAuthStatus = () => {
    if (isPublic) {
      return { color: 'blue' as const, text: '○ Public (no auth required)' };
    }
    if (oauthAuthenticated) {
      return { color: 'green' as const, text: '✓ OAuth authenticated' };
    }
    return { color: 'red' as const, text: '✗ Not authenticated' };
  };

  const authStatus = getAuthStatus();

  return (
    <Box flexDirection="column">
      <Text bold>Please confirm your settings:</Text>
      <Box flexDirection="column" marginY={1} marginLeft={2}>
        <Box>
          <Text dimColor>API Key: </Text>
          <Text>{apiKey}</Text>
        </Box>
        <Box>
          <Text dimColor>MCP URL: </Text>
          <Text>{mcpUrl}</Text>
        </Box>
        <Box>
          <Text dimColor>Auth: </Text>
          <Text color={authStatus.color}>{authStatus.text}</Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Configuration will be saved to: </Text>
        <Text>{getConfigPath()}</Text>
      </Box>
      <Box marginTop={2}>
        <Text color="green" bold>Press Enter to save, or Esc to go back</Text>
      </Box>
    </Box>
  );
};
