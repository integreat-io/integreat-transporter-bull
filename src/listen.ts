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
import type { Connection, ActiveQueue, QueueListener } from './types.js'

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
  queues: Map<string, ActiveQueue>,
  queueId: string,
  subQueueId: string, // Will be '*' when no sub queue
): QueueListener | undefined => queues.get(queueId)?.listeners.get(subQueueId)

const getHandlerErrorReason = (
  queues: Map<string, ActiveQueue>,
  queueId: string,
  name?: string,
) =>
  !queueId || queues.get(queueId)
    ? !queueId || !name || queues.get(queueId)?.listeners.get(name)
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

const createHandler = (queueId: string, queues: Map<string, ActiveQueue>) =>
  async function processJob(job: Job) {
    const { data, name } = job
    const subQueueId = subQueueIdFromName(name)

    const { dispatch, authenticate } =
      getListener(queues, queueId, subQueueId) || {}
    if (typeof dispatch !== 'function' || typeof authenticate !== 'function') {
      const errorReason = getHandlerErrorReason(queues, queueId, subQueueId)
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
  queues: Map<string, ActiveQueue>,
  dispatch: Dispatch,
  authenticate: AuthenticateExternal,
  queueId: string,
  subQueueId: string,
) {
  const queue = queues.get(queueId)
  if (!queue) {
    throw new Error('Please connect to the queue before listening')
  }
  const ourListeners = queue.listeners
  const isFirstListenForQueue = ourListeners?.size === 0 && !queue.isListening
  ourListeners?.set(subQueueId, { dispatch, authenticate })
  queue.isListening = true
  return isFirstListenForQueue
}

/**
 * Listen to queue and dispatch jobs as actions to Integreat.
 */
export default (queues: Map<string, ActiveQueue>) =>
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
        queues,
        dispatch,
        authenticate,
        queueId,
        subQueueId,
      )
      if (isFirstListenForQueue) {
        // Set up listener and create object for storing dispatches
        queue.process('*', maxConcurrency, createHandler(queueId, queues))
      }
      debugLog(`Listening to queue '${queueId}' for sub queue '${subQueueId}'`)

      return { status: 'ok' }
    } catch (error) {
      const errorMessage = `Cannot listen to queue '${queueId}'. ${error instanceof Error ? error.message : String(error)}`
      debugLog(errorMessage)
      return { status: 'error', error: errorMessage }
    }
  }
