import { logger } from '../config/logger.js';
import { groqChatClient } from '../integrations/groq/groq.chat.js';
import { GroqClientError } from '../integrations/groq/groq.client.js';
import type { GroqStreamChunk, GroqChatCompletionResponse } from '../integrations/groq/groq.types.js';
import { citationService } from './citation.service.js';
import { buildAnswerMessages } from './prompts/answer.prompt.js';
import type { BuiltContext } from './search.types.js';
import type { CitationAnalysis, SourceAttribution } from './citation.service.js';

export interface AnswerEngineConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  enableStreaming?: boolean;
  enableCitationValidation?: boolean;
}

export interface AnswerResult {
  query: string;
  answer: string;
  citations: CitationAnalysis;
  sources: SourceAttribution[];
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata: {
    generateDuration: number;
    citationDuration: number;
    totalDuration: number;
    streamed: boolean;
  };
}

export interface StreamChunk {
  type: 'content' | 'done' | 'error';
  content?: string;
  error?: string;
}

export class AnswerService {
  /**
   * Generate answer with full context and citations (non-streaming)
   */
  async generateAnswer(
    query: string,
    context: BuiltContext,
    config: AnswerEngineConfig = {},
    conversationHistory?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  ): Promise<AnswerResult> {
    const totalStartTime = Date.now();
    const { enableCitationValidation = true } = config;

    logger.info(
      {
        query,
        sourceCount: context.sources.length,
        model: config.model ?? 'default',
      },
      'Answer generation started',
    );

    // Build messages
    const messages = buildAnswerMessages({
      query,
      context,
      conversationHistory,
    });

    // Generate answer via Groq
    const { response, duration: generateDuration } = await this.callGroq(messages, config);

    const answer = response.choices[0]?.message.content ?? '';

    // Extract and validate citations
    let citations: CitationAnalysis;
    let sources: SourceAttribution[];
    let citationDuration = 0;

    if (enableCitationValidation) {
      const citationStartTime = Date.now();
      citations = citationService.extractCitations(answer, context);
      sources = citationService.buildSourceAttribution(context, citations);
      citationDuration = Date.now() - citationStartTime;
    } else {
      citations = {
        citations: [],
        uncitedClaims: [],
        invalidCitations: [],
        totalCitations: 0,
        uniqueSources: 0,
        citationDensity: 0,
      };
      sources = [];
    }

    const totalDuration = Date.now() - totalStartTime;

    const result: AnswerResult = {
      query,
      answer,
      citations,
      sources,
      model: response.model,
      usage: response.usage,
      metadata: {
        generateDuration,
        citationDuration,
        totalDuration,
        streamed: false,
      },
    };

    logger.info(
      {
        query,
        answerLength: answer.length,
        totalCitations: citations.totalCitations,
        uniqueSources: citations.uniqueSources,
        totalDuration,
      },
      'Answer generation completed',
    );

    return result;
  }

  /**
   * Generate answer with streaming support
   */
  async *generateAnswerStream(
    query: string,
    context: BuiltContext,
    config: AnswerEngineConfig = {},
    conversationHistory?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  ): AsyncIterableIterator<StreamChunk> {
    const totalStartTime = Date.now();

    logger.info(
      {
        query,
        sourceCount: context.sources.length,
        streaming: true,
      },
      'Answer streaming started',
    );

    // Build messages
    const messages = buildAnswerMessages({
      query,
      context,
      conversationHistory,
    });

    let fullAnswer = '';

    try {
      // Stream from Groq
      for await (const chunk of this.streamFromGroq(messages, config)) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          fullAnswer += content;
          yield {
            type: 'content',
            content,
          };
        }
      }

      // Extract citations after stream completes
      const citationStartTime = Date.now();
      const citations = citationService.extractCitations(fullAnswer, context);
      const sources = citationService.buildSourceAttribution(context, citations);
      const citationDuration = Date.now() - citationStartTime;

      const totalDuration = Date.now() - totalStartTime;

      logger.info(
        {
          query,
          answerLength: fullAnswer.length,
          totalCitations: citations.totalCitations,
          totalDuration,
        },
        'Answer streaming completed',
      );

      // Send completion metadata
      yield {
        type: 'done',
        content: JSON.stringify({
          citations,
          sources,
          metadata: {
            generateDuration: totalDuration - citationDuration,
            citationDuration,
            totalDuration,
            streamed: true,
          },
        }),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ query, error: errorMessage }, 'Answer streaming failed');
      yield {
        type: 'error',
        error: errorMessage,
      };
    }
  }

  /**
   * Call Groq API for non-streaming answer
   */
  private async callGroq(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    config: AnswerEngineConfig,
  ): Promise<{ response: GroqChatCompletionResponse; duration: number }> {
    const startTime = Date.now();

    try {
      const response = await groqChatClient.complete({
        messages,
        model: config.model,
        temperature: config.temperature ?? 0.7,
        maxTokens: config.maxTokens ?? 4096,
      });

      const duration = Date.now() - startTime;
      logger.debug({ duration, model: response.model }, 'Groq completion successful');

      return { response, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof GroqClientError ? error.message : 'Unknown error';

      logger.error(
        {
          error: errorMessage,
          status: (error as GroqClientError).status,
          duration,
        },
        'Groq completion failed',
      );

      throw error;
    }
  }

  /**
   * Stream from Groq API
   */
  private async *streamFromGroq(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    config: AnswerEngineConfig,
  ): AsyncIterableIterator<GroqStreamChunk> {
    try {
      for await (const chunk of groqChatClient.streamComplete({
        messages,
        model: config.model,
        temperature: config.temperature ?? 0.7,
        maxTokens: config.maxTokens ?? 4096,
        stream: true,
      })) {
        yield chunk;
      }
    } catch (error) {
      const errorMessage = error instanceof GroqClientError ? error.message : 'Unknown error';
      logger.error({ error: errorMessage }, 'Groq streaming failed');
      throw error;
    }
  }
}

export const answerService = new AnswerService();
