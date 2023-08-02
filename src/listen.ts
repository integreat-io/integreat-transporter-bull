/* eslint-disable security/detect-object-injection */
import type { Action, Response, AuthenticateExternal } from 'integreat'
import type { Job } from 'bull'
import debug from 'debug'
import { isObject, isAction } from './utils/is.js'
import type { Connection } from './types.js'

export interface PromiseWithProgress<T> extends Promise<T> {
  onProgress?: (cb: (progress?: number) => void) => void
}

export interface DispatchWithProgress<T = unknown> {
  (action: Action | null): PromiseWithProgress<Response<T>>
}

interface CallbackObject {
  dispatch: DispatchWithProgress | null
  authenticate: AuthenticateExternal | null
}

type Callbacks = Map<string, Map<string, CallbackObject>>

const debugLog = debug('integreat:transporter:bull')
const OK_STATUSES = ['ok', 'noaction', 'queued']
const callbacks: Callbacks = new Map()

const isFirstListenForQueue = (dispatches: Callbacks, queueId: string) =>
  !dispatches.get(queueId)

const wrapJobInAction = (job: unknown): Action => ({
  type: 'REQUEST',
  payload: { data: job },
})

function resolveCallbacks(
  dispatch: DispatchWithProgress | null,
  authenticate: AuthenticateExternal | null,
  queueId: string,
  subQueueId?: string
): CallbackObject {
  if (
    (typeof dispatch !== 'function' || typeof authenticate !== 'function') &&
    subQueueId
  ) {
    const subQueueCallbacks = callbacks.get(queueId)?.get(subQueueId)
    if (subQueueCallbacks) {
      return subQueueCallbacks
    }
  }

  return { dispatch, authenticate }
}

const handler = (
  dispatchFromHandler: DispatchWithProgress | null,
  queueId: string,
  authenticateFromHandler: AuthenticateExternal | null
) =>
  async function processJob(job: Job) {
    const { data, name } = job

    const { dispatch, authenticate } = resolveCallbacks(
      dispatchFromHandler,
      authenticateFromHandler,
      queueId,
      name
    )
    if (typeof dispatch !== 'function' || typeof authenticate !== 'function') {
      const errorReason =
        !queueId || callbacks.get(queueId)
          ? !queueId || !name || callbacks.get(queueId)?.get(name)
            ? '`dispatch()` and `authenticate()` must be functions'
            : `No queue named '${queueId}:${name}`
          : `No queue named '${queueId}`
      debugLog(`Could not handle action from queue. ${errorReason}`)
      throw new Error(`Could not handle action from queue. ${errorReason}`)
    }

    const shouldWrapJob = !isAction(data)
    const action = shouldWrapJob ? wrapJobInAction(data) : data

    debugLog(`Getting authenticated ident for queue '${queueId}'`)
    const authResponse = await authenticate({ status: 'granted' }, action)
    const ident = authResponse.access?.ident
    if (authResponse.status !== 'ok' || !ident) {
      const error = `Could not get authenticated ident from Integreat on queue '${queueId}'. [${authResponse.status}] ${authResponse.error}`
      debugLog(error)
      throw new Error(error)
    }

    debugLog('Dispatching action')
    const dispatchPromise = dispatch({
      ...action,
      meta: { ...action.meta, ident },
    })

    // Report function if dispatch support onProgress
    if (typeof dispatchPromise.onProgress === 'function') {
      dispatchPromise.onProgress(async function handleProgress(progress) {
        const progressPercent =
          typeof progress === 'number' ? Math.round(progress * 100) : undefined
        debugLog(`Progress set to ${progressPercent}`)
        try {
          await job.progress(progressPercent)
        } catch (err) {
          debugLog(`Failed to update progress. ${err}`)
        }
      })
    }
    const response = await dispatchPromise
    debugLog('Received response')

    if (isObject(response) && typeof response.status === 'string') {
      if (OK_STATUSES.includes(response.status)) {
        return shouldWrapJob ? response.data : response
      } else {
        throw new Error(`[${response.status}] ${response.error}`)
      }
    } else {
      throw new Error('Queued action did not return a valid response')
    }
  }

export default async function listen(
  dispatch: DispatchWithProgress,
  connection: Connection | null,
  authenticate: AuthenticateExternal
): Promise<Response> {
  const {
    queue,
    maxConcurrency = 1,
    queueId = 'great',
    subQueueId,
  } = connection || {}
  if (!queue) {
    debugLog(`Cannot listen to queue '${queueId}'. No queue`)
    return { status: 'error', error: 'Cannot listen to queue. No queue' }
  }

  try {
    // Start listening to queue
    if (subQueueId) {
      // We have a sub queue – let's store all dispatches and have a catch-all listener

      if (isFirstListenForQueue(callbacks, queueId)) {
        // Set up listener and create object for storing dispatches
        queue.process('*', maxConcurrency, handler(null, queueId, null))
        callbacks.set(queueId, new Map())
      }

      const queueCallbacks = callbacks.get(queueId)
      queueCallbacks?.set(subQueueId, { dispatch, authenticate })

      debugLog(`Listening to queue '${queueId}' for sub queue '${subQueueId}'`)
    } else {
      // Normal setup with on queue per queueId
      queue.process(maxConcurrency, handler(dispatch, queueId, authenticate))
      debugLog(`Listening to queue '${queueId}'`)
    }

    return { status: 'ok' }
  } catch (error) {
    debugLog(`Cannot listen to queue '${queueId}'. ${error}`)
    return { status: 'error', error: `Cannot listen to queue. ${error}` }
  }
}
