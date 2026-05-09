/**
 * Unified translation layer for Responses API.
 *
 * This module translates between OpenAI Responses API format and upstream
 * API formats. You specify the upstream API format (`anthropic` or
 * `openai-chat`) instead of a named provider.
 *
 * - `anthropic` → Anthropic Messages API
 * - `openai-chat` → OpenAI-compatible Chat Completions API (OpenAI, ZAI, etc.)
 */

export * as anthropic from './anthropic/index.js';
export * as openai from './openai/index.js';

// Re-export unified types
export type {
  ResponsesRequest,
  ResponsesResponse,
  ResponsesStreamEvent,
} from '../types/responses.js';
