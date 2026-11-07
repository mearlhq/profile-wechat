// Base64 plus up to 64 KiB of headers must fit the toolbox's 256 KiB input budget.
export const NETWORK_CHUNK_BYTES = 128 * 1024;
export const NETWORK_RESPONSE_CHUNK_BYTES = 256 * 1024;
export const NETWORK_RPC_TIMEOUT_MS = 150_000;
export type NetworkStage = 'fetch' | 'begin' | 'write' | 'send' | 'read' | 'release';
export interface NetworkInput {
  stage: NetworkStage;
  transferId: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  offset?: number;
}
export interface NetworkResponse {
  kind: 'inline' | 'resource';
  transferId: string;
  status: number;
  headers: Record<string, string>;
  cookies: string[];
  bytes: number;
  body?: string;
}
export interface NetworkRpc {
  (input: NetworkInput, signal?: AbortSignal): Promise<any>;
}
