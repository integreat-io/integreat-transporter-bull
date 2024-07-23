import type { Action, Response, Ident, AuthenticateExternal } from 'integreat'
import type { Job } from 'bull'
import debug from 'debug'
import { isObject, isAction } from './utils/is.js'
import type {
  Connection,
  HandlersObject,
  QueueObject,
  DispatchWithProgress,
  MainHandlersObject,
} from './types.js'

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

function resolveCallbacks(
  queues: Map<string, QueueObject>,
  queueId: string,
  subQueueId?: string,
): HandlersObject {
  let queue: MainHandlersObject | undefined = queues.get(queueId)
  if (subQueueId) {
    queue = queue?.subHandlers?.get(subQueueId)
  }

  return queue || { dispatch: null, authenticate: null }
}

const getHandlerErrorReason = (
  queues: Map<string, QueueObject>,
  queueId: string,
  name?: string,
) =>
  !queueId || queues.get(queueId)
    ? !queueId || !name || queues.get(queueId)?.subHandlers?.get(name)
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
  dispatch: DispatchWithProgress,
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

const normalizeSubQueueId = (name?: string) =>
  typeof name === 'string' && name !== '__default__' ? name : undefined

async function handler(job: Job, queues: Map<string, QueueObject>) {
  const { data, queue } = job
  const queueId = queue?.name
  const subQueueId = normalizeSubQueueId(job.name)

  const { dispatch, authenticate } = resolveCallbacks(
    queues,
    queueId,
    subQueueId,
  )

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

function setHandlerObject(
  dispatch: DispatchWithProgress | null,
  authenticate: AuthenticateExternal | null,
  id: string,
  handlers: Map<string, HandlersObject>,
): [HandlersObject, boolean] {
  const obj = handlers.get(id) || ({} as HandlersObject) // This typing is ok, as we will set its values on the next two lines
  const isFirst = obj.dispatch === undefined // If it is null, it has been cleared
  obj.dispatch = dispatch
  obj.authenticate = authenticate
  if (isFirst) {
    handlers.set(id, obj)
  }
  return [obj, isFirst]
}

function storeHandlers(
  queues: Map<string, QueueObject>,
  dispatch: DispatchWithProgress,
  authenticate: AuthenticateExternal,
  queueId: string,
  subQueueId?: string,
): [HandlersObject, boolean] {
  // Set up queue handlers object
  if (!subQueueId) {
    // As there's no subQueueId, this is a main queue. Set up its handlers and return it
    return setHandlerObject(dispatch, authenticate, queueId, queues)
  } else {
    // This is a sub queue. First make sure we have a queue object
    const ret = setHandlerObject(null, null, queueId, queues)
    const queue: MainHandlersObject = ret[0]
    if (!queue.subHandlers) {
      // Make sure we have the `subHandlers` map
      queue.subHandlers = new Map()
    }
    // Set and return the sub queue handlers
    return setHandlerObject(
      dispatch,
      authenticate,
      subQueueId,
      queue.subHandlers,
    )
  }
}

export default (queues: Map<string, QueueObject>) =>
  async function listen(
    dispatch: DispatchWithProgress,
    connection: Connection | null,
    authenticate: AuthenticateExternal,
  ): Promise<Response> {
    if (!connection) {
      debugLog(`Cannot listen to queue. No connection`)
      return { status: 'error', error: 'Cannot listen to queue. No connection' }
    }
    const {
      queue,
      maxConcurrency = 1,
      queueId = 'great',
      subQueueId,
    } = connection
    if (!queue) {
      debugLog(`Cannot listen to queue '${queueId}'. No queue`)
      return { status: 'error', error: 'Cannot listen to queue. No queue' }
    }

    // Store dispatch and authenticate handlers
    const [handlersObject, isFirstListenForQueue] = storeHandlers(
      queues,
      dispatch,
      authenticate,
      queueId,
      subQueueId,
    )
    // Set handlers object on connection
    connection.handlers = handlersObject

    if (isFirstListenForQueue) {
      // This is the first listen to this queue or sub queue, so set up handler
      try {
        if (subQueueId) {
          queue.process(subQueueId, maxConcurrency, (job) =>
            handler(job, queues),
          )
          debugLog(
            `Listening to queue '${queueId}' for sub queue '${subQueueId}'`,
          )
        } else {
          queue.process(maxConcurrency, (job) => handler(job, queues))
          debugLog(`Listening to queue '${queueId}'`)
        }
      } catch (error) {
        debugLog(`Cannot listen to queue '${queueId}'. ${error}`)
        return { status: 'error', error: `Cannot listen to queue. ${error}` }
      }
    }

    return { status: 'ok' }
  }
