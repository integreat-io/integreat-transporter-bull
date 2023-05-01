/* eslint-disable security/detect-object-injection */
import type { Action, Response } from 'integreat'
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

type Dispatches = Record<string, Record<string, DispatchWithProgress>>

const debugLog = debug('integreat:transporter:bull')
const OK_STATUSES = ['ok', 'noaction', 'queued']

const dispatches: Dispatches = {}

const wrapJobInAction = (job: unknown) => ({
  type: 'REQUEST',
  payload: { data: job },
})

function resolveDispatch(
  dispatch: DispatchWithProgress | null,
  queueId: string,
  subQueueId?: string
) {
  if (typeof dispatch === 'function') {
    return dispatch
  } else if (subQueueId && dispatches[queueId]) {
    return dispatches[queueId][subQueueId]
  } else {
    return null
  }
}

const handler = (dispatch: DispatchWithProgress | null, queueId: string) =>
  async function processJob(job: Job) {
    const { data, name } = job

    const dispatchFn = resolveDispatch(dispatch, queueId, name)
    if (typeof dispatchFn !== 'function') {
      const errorReason =
        !queueId || dispatches[queueId]
          ? !queueId || !name || dispatches[queueId][name]
            ? 'dispatch is not a function'
            : `No queue named '${queueId}:${name}`
          : `No queue named '${queueId}`
      debugLog(`Could not handle action from queue. ${errorReason}`)
      throw new Error(`Could not handle action from queue. ${errorReason}`)
    }

    const shouldWrapJob = !isAction(data)
    const action = shouldWrapJob ? wrapJobInAction(data) : data
    debugLog('Dispatching action')
    const dispatchPromise = dispatchFn(action)

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

const isFirstListenForQueue = (dispatches: Dispatches, queueId: string) =>
  !dispatches[queueId]

export default async function listen(
  dispatch: DispatchWithProgress,
  connection: Connection | null
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

      if (isFirstListenForQueue(dispatches, queueId)) {
        // Set up listener and create object for storing dispatches
        queue.process('*', maxConcurrency, handler(null, queueId))
        dispatches[queueId] = {}
      }

      dispatches[queueId][subQueueId] = dispatch

      debugLog(`Listening to queue '${queueId}' for sub queue '${subQueueId}'`)
    } else {
      // Normal setup with on queue per queueId
      queue.process(maxConcurrency, handler(dispatch, queueId))
      debugLog(`Listening to queue '${queueId}'`)
    }

    return { status: 'ok' }
  } catch (error) {
    debugLog(`Cannot listen to queue '${queueId}'. ${error}`)
    return { status: 'error', error: `Cannot listen to queue. ${error}` }
  }
}
