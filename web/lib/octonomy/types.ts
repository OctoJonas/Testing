/**
 * Public surface of the Octonomy AI SDK port. Phase 3 implements these in
 * lib/octonomy/{auth,conversation,socket-client,client}.ts. The connection
 * pool depends on the interface only so Phase 2 can compile before Phase 3
 * is complete.
 */

export interface ClientConfigInit {
  widgetId: string;
  baseUrl: string;
  origin: string;
  referer: string;
  /** Print verbose SDK output. Defaults to false. */
  verboseLogging?: boolean;
  /** Enable HTTP debug payload logging. Defaults to false. */
  debugEnabled?: boolean;
  /** Per-message response timeout in seconds. Defaults to 120. */
  responseTimeoutSec?: number;
  /** Connection wait timeout in seconds. Defaults to 10. */
  connectionTimeoutSec?: number;
}

export interface ConversationManagerLike {
  conversationId: string | null;
}

export interface OctonomyClientLike {
  readonly config: ClientConfigInit;
  readonly conversationManager: ConversationManagerLike | null;
  authenticate(): Promise<boolean>;
  connect(): Promise<boolean>;
  isConnected(): boolean;
  disconnect(): Promise<void>;
  /**
   * Send `message` and resolve with the assistant's full reply (or `null` on
   * timeout / error). If `onChunk` is provided, it fires for each streaming
   * token as it arrives — letting the chat handler forward chunks to the
   * browser instantly instead of waiting for the full reply.
   */
  sendMessage(message: string, onChunk?: (chunk: string) => void): Promise<string | null>;
}

export type OctonomyClientFactory = (config: ClientConfigInit) => OctonomyClientLike;
