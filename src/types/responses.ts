// ==============================================================================
// Responses API Types
// ==============================================================================
/**
 * OpenAI Responses API type definitions (subset used by this library).
 * Only the fields relevant to request translation and event emission are typed.
 * Other fields pass through as `unknown` / `Record<string, unknown>`.
 */

export type ResponsesInputItem =
  | string
  | ResponsesMessageItem
  | ResponsesReasoningItem
  | ResponsesFunctionCallItem
  | ResponsesFunctionCallOutputItem
  | ResponsesLocalShellCallItem
  | ResponsesCommandExecutionItem
  | ResponsesCommandExecutionOutputItem
  | ResponsesCustomToolCallItem
  | ResponsesCustomToolCallOutputItem
  | ResponsesFileChangeItem
  | ResponsesFileChangeOutputItem
  | ResponsesWebSearchCallItem
  | Record<string, unknown>;

export interface ResponsesContentPart {
  type:
    | 'input_text'
    | 'text'
    | 'output_text'
    | 'reasoning_text'
    | 'input_image'
    | 'image'
    | 'image_url'
    | 'input_file'
    | 'file'
    | 'tool_result'
    | string;
  text?: string;
  image_url?: string | { url: string };
  source?: Record<string, unknown>;
  data?: string;
  base64?: string;
  media_type?: string;
  mime_type?: string;
  file_data?: string;
  file_url?: string | { url: string };
  tool_use_id?: string;
  call_id?: string;
  content?: unknown;
  cache_control?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ResponsesMessageItem {
  type?: 'message' | 'agentMessage';
  role?: 'user' | 'assistant' | 'model' | 'system' | 'developer' | string;
  content?: string | ResponsesContentPart[] | unknown;
  reasoning_content?: string;
  thought_signature?: string;
  [key: string]: unknown;
}

export interface ResponsesReasoningItem {
  type: 'reasoning';
  content?: Array<{ type?: string; text?: string } | string> | string;
  thought_signature?: string;
  [key: string]: unknown;
}

export interface ResponsesFunctionCallItem {
  type: 'function_call';
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: string | Record<string, unknown>;
  [key: string]: unknown;
}

export interface ResponsesFunctionCallOutputItem {
  type: 'function_call_output';
  id?: string;
  call_id?: string;
  output?: unknown;
  [key: string]: unknown;
}

export interface ResponsesLocalShellCallItem {
  type: 'local_shell_call';
  id?: string;
  call_id?: string;
  action?: {
    type?: string;
    exec?: { command?: string[]; working_directory?: string };
    command?: string[];
  };
  [key: string]: unknown;
}

export interface ResponsesCommandExecutionItem {
  type: 'commandExecution';
  id?: string;
  call_id?: string;
  command?: string;
  cwd?: string;
  [key: string]: unknown;
}

export interface ResponsesCommandExecutionOutputItem {
  type: 'commandExecutionOutput';
  id?: string;
  call_id?: string;
  output?: unknown;
  stdout?: string;
  stderr?: string;
  [key: string]: unknown;
}

export interface ResponsesCustomToolCallItem {
  type: 'custom_tool_call';
  id?: string;
  call_id?: string;
  name?: string;
  input?: unknown;
  [key: string]: unknown;
}

export interface ResponsesCustomToolCallOutputItem {
  type: 'custom_tool_call_output';
  id?: string;
  call_id?: string;
  output?: unknown;
  [key: string]: unknown;
}

export interface ResponsesFileChangeItem {
  type: 'fileChange';
  id?: string;
  call_id?: string;
  changes?: Array<{ path?: string; [k: string]: unknown }>;
  [key: string]: unknown;
}

export interface ResponsesFileChangeOutputItem {
  type: 'fileChangeOutput';
  id?: string;
  call_id?: string;
  output?: unknown;
  [key: string]: unknown;
}

export interface ResponsesWebSearchCallItem {
  type: 'web_search_call';
  id?: string;
  call_id?: string;
  action?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ResponsesTool {
  type: 'function' | string;
  name?: string;
  description?: string;
  parameters?: Record<string, unknown>;
  strict?: boolean;
  function?: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    strict?: boolean;
  };
  [key: string]: unknown;
}

export type ResponsesToolChoice =
  | 'auto'
  | 'required'
  | 'none'
  | { type: 'function'; function: { name: string } }
  | { type: 'auto' | 'any' }
  | null
  | undefined;

export interface ResponsesReasoningConfig {
  effort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | string;
  summary?: string;
  [key: string]: unknown;
}

export interface ResponsesRequest {
  model: string;
  input?: ResponsesInputItem[] | string;
  instructions?: string | Array<string | { text?: string }>;
  tools?: ResponsesTool[];
  tool_choice?: ResponsesToolChoice;
  temperature?: number;
  top_p?: number;
  max_output_tokens?: number;
  max_tokens?: number;
  stream?: boolean;
  reasoning?: ResponsesReasoningConfig;
  metadata?: Record<string, unknown>;
  store?: boolean;
  previous_response_id?: string | null;
  [key: string]: unknown;
}

export interface ResponsesOutputMessage {
  id: string;
  type: 'message';
  role: 'assistant';
  status: 'completed' | 'in_progress';
  content: Array<{ type: 'output_text'; text: string } | { type: string; [k: string]: unknown }>;
}

export interface ResponsesOutputFunctionCall {
  id: string;
  type: 'function_call' | 'local_shell_call' | string;
  status: 'completed' | 'in_progress';
  name?: string;
  arguments?: string;
  call_id?: string;
  action?: { type?: string; command?: string[] };
}

export interface ResponsesOutputReasoning {
  id: string;
  type: 'reasoning';
  summary: unknown[];
  content: Array<{ type: 'reasoning_text'; text: string }>;
  status?: 'completed' | 'in_progress';
}

export type ResponsesOutputItem =
  | ResponsesOutputMessage
  | ResponsesOutputFunctionCall
  | ResponsesOutputReasoning
  | Record<string, unknown>;

export interface ResponsesUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details?: {
    cached_tokens?: number;
    cache_creation_tokens?: number;
  };
}

export interface ResponsesResponse {
  id: string;
  object: 'response';
  created_at: number;
  completed_at?: number;
  model: string;
  status: 'completed' | 'in_progress' | 'failed';
  output: ResponsesOutputItem[];
  usage?: ResponsesUsage;
  temperature?: number;
  top_p?: number;
  tool_choice?: unknown;
  tools?: unknown[];
  parallel_tool_calls?: boolean;
  store?: boolean;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ResponsesStreamEvent {
  id: string;
  object: 'response.event';
  type: string;
  created_at: number;
  sequence_number: number;
  [key: string]: unknown;
}
