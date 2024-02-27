import debug from 'debug'
import { isObject, isAction } from './utils/is.js'
import type {
  Dispatch,
  Action,
  Response,
  Ident,
  AuthenticateExternal,
} from 'integreat'
import type { Job } from 'bull'
import type { Connection, QueueListeners, QueueListener } from './types.js'

const debugLog = debug('integreat:transporter:bull')
const OK_STATUSES = ['ok', 'noaction', 'queued']

const wrapJobInAction = (job: unknown): Action => ({
  type: 'REQUEST',
  payload: { data: job },
})

const setIdentOnAction = (action: Action, ident: Ident): Action => ({
  ...action,
  meta: { ...action.meta, ident },
})

const getListener = (
  listeners: QueueListeners,
  queueId: string,
  subQueueId: string, // Will be '*' when no sub queue
): QueueListener | undefined => listeners.get(queueId)?.get(subQueueId)

const getHandlerErrorReason = (
  listeners: QueueListeners,
  queueId: string,
  name?: string,
) =>
  !queueId || listeners.get(queueId)
    ? !queueId || !name || listeners.get(queueId)?.get(name)
      ? '`dispatch()` and `authenticate()` must be functions'
      : `No queue named '${queueId}:${name}`
    : `No queue named '${queueId}`

const progressHandler = (job: Job) =>
  async function handleProgress(progress?: number) {
    const progressPercent =
      typeof progress === 'number' ? Math.round(progress * 100) : undefined
    debugLog(`Progress set to ${progressPercent}`)
    try {
      await job.progress(progressPercent)
    } catch (err) {
      debugLog(`Failed to update progress. ${err}`)
    }
  }

async function dispatchWithProgress(
  action: Action,
  dispatch: Dispatch,
  authenticate: AuthenticateExternal,
  queueId: string,
  job: Job,
) {
  debugLog(`Getting authenticated ident for queue '${queueId}'`)
  const authResponse = await authenticate({ status: 'granted' }, action)
  const ident = authResponse.access?.ident
  if (authResponse.status !== 'ok' || !ident) {
    const error = `Could not get authenticated ident from Integreat on queue '${queueId}'. [${authResponse.status}] ${authResponse.error}`
    debugLog(error)
    throw new Error(error)
  }

  debugLog('Dispatching action')
  const dispatchPromise = dispatch(setIdentOnAction(action, ident))

  // Report function if dispatch support onProgress
  if (typeof dispatchPromise.onProgress === 'function') {
    dispatchPromise.onProgress(progressHandler(job))
  }
  const response = await dispatchPromise
  debugLog('Received response')
  return response
}

const subQueueIdFromName = (name?: string) =>
  name === '__default__' || name === undefined ? '*' : name

const createHandler = (queueId: string, listeners: QueueListeners) =>
  async function processJob(job: Job) {
    const { data, name } = job
    const subQueueId = subQueueIdFromName(name)

    const { dispatch, authenticate } =
      getListener(listeners, queueId, subQueueId) || {}
    if (typeof dispatch !== 'function' || typeof authenticate !== 'function') {
      const errorReason = getHandlerErrorReason(listeners, queueId, subQueueId)
      debugLog(`Could not handle action from queue. ${errorReason}`)
      throw new Error(`Could not handle action from queue. ${errorReason}`)
    }

    const shouldWrapJob = !isAction(data)
    const action = shouldWrapJob ? wrapJobInAction(data) : data

    const response = await dispatchWithProgress(
      action,
      dispatch,
      authenticate,
      queueId,
      job,
    )

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

function storeListener(
  listeners: QueueListeners,
  dispatch: Dispatch,
  authenticate: AuthenticateExternal,
  queueId: string,
  subQueueId: string,
) {
  let ourListeners = listeners.get(queueId)
  let isFirstListenForQueue = false
  if (!ourListeners) {
    ourListeners = new Map()
    listeners.set(queueId, ourListeners)
    isFirstListenForQueue = true
  }

  ourListeners.set(subQueueId, { dispatch, authenticate })
  return isFirstListenForQueue
}

/**
 * Listen to queue and dispatch jobs as actions to Integreat.
 */
export default (listeners: QueueListeners) =>
  async function listen(
    dispatch: Dispatch,
    connection: Connection | null,
    authenticate: AuthenticateExternal,
  ): Promise<Response> {
    const {
      queue,
      maxConcurrency = 1,
      queueId = 'great',
      subQueueId = '*',
    } = connection || {}
    if (!queue) {
      debugLog(`Cannot listen to queue '${queueId}'. No queue`)
      return { status: 'error', error: 'Cannot listen to queue. No queue' }
    }

    try {
      // Start listening to queue
      const isFirstListenForQueue = storeListener(
        listeners,
        dispatch,
        authenticate,
        queueId,
        subQueueId,
      )
      if (isFirstListenForQueue) {
        // Set up listener and create object for storing dispatches
        queue.process('*', maxConcurrency, createHandler(queueId, listeners))
      }
      debugLog(`Listening to queue '${queueId}' for sub queue '${subQueueId}'`)

      return { status: 'ok' }
    } catch (error) {
      debugLog(`Cannot listen to queue '${queueId}'. ${error}`)
      return { status: 'error', error: `Cannot listen to queue. ${error}` }
    }
  }
