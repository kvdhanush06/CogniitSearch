import { Readable } from 'stream';
import { groqHttpClient, withRetry, handleGroqError } from './groq.client.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type {
  GroqChatCompletionParams,
  GroqChatCompletionResponse,
  GroqStreamChunk,
} from './groq.types.js';

export class GroqChatClient {
  async complete(params: GroqChatCompletionParams): Promise<GroqChatCompletionResponse> {
    const requestPayload = this.buildRequestPayload(params, false);

    try {
      const response = await withRetry(
        () => groqHttpClient.post<GroqChatCompletionResponse>('/chat/completions', requestPayload),
        `chat complete model="${params.model ?? env.GROQ_MODEL}"`,
      );

      logger.debug(
        {
          model: response.data.model,
          usage: response.data.usage,
          finishReason: response.data.choices[0]?.finishReason,
        },
        'Groq chat completion completed',
      );

      return response.data;
    } catch (error: unknown) {
      handleGroqError(error);
    }
  }

  async *streamComplete(params: GroqChatCompletionParams): AsyncIterableIterator<GroqStreamChunk> {
    const requestPayload = this.buildRequestPayload(params, true);

    try {
      const response = await withRetry(
        () =>
          groqHttpClient.post('/chat/completions', requestPayload, {
            responseType: 'stream',
          }),
        `chat stream complete model="${params.model ?? env.GROQ_MODEL}"`,
      );

      const stream = response.data as Readable;

      for await (const chunk of this.parseStream(stream)) {
        yield chunk;
      }
    } catch (error: unknown) {
      handleGroqError(error);
    }
  }

  private buildRequestPayload(
    params: GroqChatCompletionParams,
    stream: boolean,
  ): Record<string, unknown> {
    return {
      model: params.model ?? env.GROQ_MODEL,
      messages: params.messages,
      temperature: params.temperature ?? env.GROQ_TEMPERATURE,
      max_tokens: params.maxTokens ?? env.GROQ_MAX_TOKENS,
      top_p: params.topP,
      stream,
      stop: params.stop,
      frequency_penalty: params.frequencyPenalty,
      presence_penalty: params.presencePenalty,
      tools: params.tools,
      tool_choice: params.toolChoice,
      response_format: params.responseFormat,
    };
  }

  private async *parseStream(stream: Readable): AsyncIterableIterator<GroqStreamChunk> {
    let buffer = '';

    for await (const chunk of stream) {
      buffer += chunk.toString();

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmed.slice(6)) as GroqStreamChunk;
            yield parsed;
          } catch (error) {
            logger.warn({ chunk: trimmed }, 'Failed to parse Groq stream chunk');
          }
        }
      }
    }
  }
}

export const groqChatClient = new GroqChatClient();
