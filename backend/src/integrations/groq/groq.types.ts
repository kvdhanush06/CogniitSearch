// Message roles
export type GroqRole = 'system' | 'user' | 'assistant' | 'tool';

// Chat message
export interface GroqMessage {
  role: GroqRole;
  content: string;
  name?: string;
  toolCalls?: GroqToolCall[];
  toolCallId?: string;
}

// Request params for chat completion
export interface GroqChatCompletionParams {
  messages: GroqMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stream?: boolean;
  stop?: string[];
  frequencyPenalty?: number;
  presencePenalty?: number;
  tools?: GroqTool[];
  toolChoice?: 'auto' | 'none' | GroqToolChoice;
  /**
   * OpenAI-compatible response format. Use `{ type: 'json_object' }` to
   * force valid JSON output (used by the follow-ups service).
   */
  responseFormat?: { type: 'json_object' | 'text' };
}

// Non-streaming response
export interface GroqChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: GroqChoice[];
  usage: GroqUsage;
}

export interface GroqChoice {
  index: number;
  message: GroqMessage;
  finishReason: 'stop' | 'length' | 'content_filter' | null;
}

export interface GroqUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// Streaming response chunk
export interface GroqStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: GroqStreamChoice[];
}

export interface GroqStreamChoice {
  index: number;
  delta: GroqDelta;
  finishReason: 'stop' | 'length' | 'content_filter' | null;
}

export interface GroqDelta {
  role?: GroqRole;
  content?: string;
}

// Error type
export interface GroqApiError {
  error: {
    message: string;
    type: string;
    code: string;
  };
}

// Tool definitions
export interface GroqTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface GroqToolChoice {
  type: 'function';
  function: {
    name: string;
  };
}

export interface GroqToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}
