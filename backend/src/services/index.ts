// Search pipeline orchestrator
export { SearchService, searchService } from './search.service.js';
export type { SearchPipelineResult } from './search.service.js';

// Ranking service
export { RankingService, rankingService } from './ranking.service.js';

// Retrieval service
export { RetrievalService, retrievalService } from './retrieval.service.js';

// Answer engine
export { AnswerService, answerService } from './answer.service.js';
export type { AnswerResult, AnswerEngineConfig, StreamChunk } from './answer.service.js';

// Citation service
export { CitationService, citationService } from './citation.service.js';
export type { Citation, CitationAnalysis, SourceAttribution } from './citation.service.js';

// Domain types
export type {
  RankedResult,
  CrawledPage,
  BuiltContext,
  SearchPipelineConfig,
} from './search.types.js';

export { DEFAULT_PIPELINE_CONFIG } from './search.types.js';

// Prompt builders
export * from './prompts/index.js';
