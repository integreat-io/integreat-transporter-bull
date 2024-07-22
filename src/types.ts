import {
  Connection as ConnectionBase,
  Action,
  Response,
  AuthenticateExternal,
} from 'integreat'
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
}

export interface EndpointOptions extends Record<string, unknown> {
  queue?: Queue
  queueId?: string
  subQueueId?: string
  maxConcurrency?: number
  redis?: string | RedisOptions
  keyPrefix?: string
  bullSettings?: AdvancedSettings
}

export interface PromiseWithProgress<T> extends Promise<T> {
  onProgress?: (cb: (progress?: number) => void) => void
}

export interface DispatchWithProgress<T = unknown> {
  (action: Action | null): PromiseWithProgress<Response<T>>
}

export interface CallbackObject {
  dispatch: DispatchWithProgress | null
  authenticate: AuthenticateExternal | null
}

export interface QueueCallback extends CallbackObject {
  subCallbacks?: Map<string, CallbackObject>
}

export interface Connection extends ConnectionBase {
  queue?: Queue
  queueId?: string
  subQueueId?: string
  maxConcurrency?: number
  callback?: CallbackObject
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
