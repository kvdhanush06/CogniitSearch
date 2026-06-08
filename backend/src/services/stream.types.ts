/**
 * SSE chunk types sent from the backend to the frontend.
 *
 *   content    — a piece of the assistant's answer (text delta)
 *   progress   — a pipeline stage transition with a user-facing message
 *   follow_ups — three suggested follow-up questions (sent near the end)
 *   done       — terminal chunk with citations, sources, follow-ups, and timing
 *   error      — terminal chunk; the stream is unrecoverable
 *
 * The frontend parses `data: <json>\n\n` lines; each line is one chunk.
 */
export type StreamChunkType = 'content' | 'progress' | 'follow_ups' | 'done' | 'error' | 'conversation';

export interface StreamChunkContent {
  type: 'content';
  content: string;
}

export type PipelineStage = 'search' | 'rank' | 'crawl' | 'context' | 'answer' | 'citation';

export interface StreamChunkProgress {
  type: 'progress';
  stage: PipelineStage;
  /** User-facing status line, e.g. "Found 48 sources…" */
  message: string;
  /** Optional numeric context (sources found, pages crawled, etc.) */
  count?: number;
  /** Pipeline progress 0..1 (computed by the publisher) */
  ratio?: number;
}

export interface StreamChunkFollowUps {
  type: 'follow_ups';
  questions: string[];
}

export interface StreamChunkDone {
  type: 'done';
  content: string; // JSON-stringified metadata (citations, sources, timing)
}

export interface StreamChunkError {
  type: 'error';
  error: string;
}

/**
 * Sent ONCE at the start of the stream so the client can thread
 * follow-up queries into the same conversation row.
 */
export interface StreamChunkConversation {
  type: 'conversation';
  conversationId: string;
}

export type StreamChunk =
  | StreamChunkContent
  | StreamChunkProgress
  | StreamChunkFollowUps
  | StreamChunkDone
  | StreamChunkError
  | StreamChunkConversation;

/** Stage weights used to compute a 0..1 progress ratio. */
export const STAGE_WEIGHTS: Record<PipelineStage, number> = {
  search: 0.1,
  rank: 0.2,
  crawl: 0.4,
  context: 0.6,
  answer: 0.85,
  citation: 1.0,
};

export function progressRatio(stage: PipelineStage): number {
  return STAGE_WEIGHTS[stage];
}
