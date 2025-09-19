import { Connection as ConnectionBase } from 'integreat'
import type { JobId, Queue, AdvancedSettings } from 'bull'

export interface RedisOptions {
  uri?: string
  host?: string
  port?: number
  tls?: boolean
  auth?: {
    key?: string
    secret?: string
  }
  connectTimeout?: number
  reconnectOnError?: ReconnectOnErrorStrategy
}

export enum ReconnectOnErrorStrategy {
  NoReconnect = 'noReconnect',
  ReconnectOnly = 'reconnectOnly',
  ReconnectAndResend = 'reconnectAndResend',
}

/**
 * - https://github.com/redis/ioredis/tree/v5.4.1?tab=readme-ov-file#reconnect-on-error
 * - https://github.com/redis/ioredis/blob/v5.4.1/lib/redis/RedisOptions.ts#L78
 */
export type IoredisReconnectOnErrorStrategy =
  | false // Do not reconnect.
  | 1 // Reconnect and do not resend the failed command (who triggered the error) after reconnection.
  | 2 // Reconnect and resend the failed command (who triggered the error) after reconnection.

export interface EndpointOptions extends Record<string, unknown> {
  queue?: Queue
  queueId?: string
  subQueueId?: string
  maxConcurrency?: number
  redis?: string | RedisOptions
  keyPrefix?: string
  bullSettings?: AdvancedSettings
}

export interface Connection extends ConnectionBase {
  queue?: Queue
  queueId?: string
  subQueueId?: string
  maxConcurrency?: number
}

export interface Authentication extends Record<string, unknown> {
  key?: string
  secret?: string
}

export interface JobData {
  id: JobId
  timestamp: number
  queueId: string
}
