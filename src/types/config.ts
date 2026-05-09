/**
 * Configuration file format for codeproxy.
 */

export type UpstreamFormat = 'anthropic' | 'openai-chat';

export interface UpstreamConfig {
  /** Upstream API format. If omitted, inferred from `baseUrl`. */
  format?: UpstreamFormat;
  /** Upstream endpoint URL. Required. */
  baseUrl: string;
  /** Host to bind to (optional, defaults to 127.0.0.1). */
  host?: string;
  /** Port to listen on (optional, defaults to 8787). */
  port?: string | number;
  /** API version header (for anthropic format). */
  apiVersion?: string;
  /** Default API key (optional, can be overridden by request headers). */
  apiKey?: string;
  /** Default model to use (optional, can be overridden by requests). */
  model?: string;
  /** Additional default headers. */
  headers?: Record<string, string>;
  /** Timeout in milliseconds for upstream requests. (e.g. 300000 for 5min). */
  timeoutMs?: number;
  /** If true, drop image/file parts from user messages (for text-only models). */
  dropImages?: boolean;
  /** Name of another upstream to use as fallback when the last user message contains images. */
  fallback?: string;
  /** Reasoning effort for openai-chat upstreams (low/medium/high). */
  reasoningEffort?: string;
  /** Thinking configuration for anthropic or openai-chat upstreams. */
  thinking?: unknown;
}

export interface ConfigFile {
  /** Version of the config file format. */
  version: string;
  /** Current upstream config to use. */
  currentUpstream: string;
  /** Default headers applied to all upstreams. Can be overridden by upstream-specific headers. */
  headers?: Record<string, string>;
  /** List of available upstream configs. */
  upstreams: Record<string, UpstreamConfig>;
  /** Default reasoning effort for openai-chat upstreams (low/medium/high). */
  reasoningEffort?: string;
  /** Default thinking configuration for anthropic or openai-chat upstreams. */
  thinking?: unknown;
  /** Timeout in milliseconds for upstream requests (top-level default). */
  timeoutMs?: number;
}

/** Default config file names to search for. */
export const CONFIG_FILE_NAMES = [
  'codeproxy.config.json',
  'codeproxy.config.js',
  'codeproxy.config.mjs',
  'codeproxy.config.ts',
  '.codeproxy.json',
  '.codeproxy.js',
];
