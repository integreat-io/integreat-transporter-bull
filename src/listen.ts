/* eslint-disable security/detect-object-injection */
import { Job } from 'bull'
import * as debug from 'debug'
import { isObject, isAction } from './utils/is'
import { Connection, Response, Action } from './types'

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

const wrapJobInAction = (
  job: unknown,
  sourceService?: string,
  defaultIdentId?: string
) => ({
  type: 'REQUEST',
  payload: { data: job, sourceService },
  meta: defaultIdentId ? { ident: { id: defaultIdentId } } : {},
})

const setSourceService = (action: Action, sourceService?: string) => ({
  ...action,
  payload: { ...action.payload, sourceService },
})

const setJobIdWhenNoActionId = (action: Action, id?: string | number) =>
  action.meta?.id || !id
    ? action
    : {
        ...action,
        meta: { ...action.meta, id: String(id) },
      }

function resolveDispatch(
  dispatch: DispatchWithProgress | null,
  namespace: string,
  subNamespace?: string
) {
  if (typeof dispatch === 'function') {
    return dispatch
  } else if (subNamespace && dispatches[namespace]) {
    return dispatches[namespace][subNamespace]
  } else {
    return null
  }
}

const handler = (
  dispatch: DispatchWithProgress | null,
  namespace: string,
  sourceService?: string,
  defaultIdentId?: string
) =>
  async function processJob(job: Job) {
    const { data, name, id } = job

    const dispatchFn = resolveDispatch(dispatch, namespace, name)
    if (typeof dispatchFn !== 'function') {
      debugLog('Could not handle action from queue. dispatch is not a function')
      throw new Error(
        'Could not handle action from queue. dispatch is not a function'
      )
    }

    const shouldWrapJob = !isAction(data)
    const action = shouldWrapJob
      ? wrapJobInAction(data, sourceService, defaultIdentId)
      : setSourceService(data, sourceService)
    debugLog('Dispatching action')
    debug('integreat:transporter:bull:action')(
      `Dispatching action ${JSON.stringify(action)}`
    )
    const dispatchPromise = dispatchFn(setJobIdWhenNoActionId(action, id))

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
    debug('integreat:transporter:bull:action')(
      `Received response ${JSON.stringify(response)}`
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

const isFirstListenForNamespace = (dispatches: Dispatches, namespace: string) =>
  !dispatches[namespace]

export default async function listen(
  dispatch: DispatchWithProgress,
  connection: Connection | null
): Promise<Response> {
  const {
    queue,
    maxConcurrency = 1,
    wrapSourceService,
    defaultIdentId,
    namespace = 'great',
    subNamespace,
  } = connection || {}
  if (!queue) {
    debugLog(`Cannot listen to queue '${namespace}'. No queue`)
    return { status: 'error', error: 'Cannot listen to queue. No queue' }
  }

  try {
    // Start listening to queue
    if (subNamespace) {
      // We have a sub namespace – let's store all dispatches and have a catch-all listener

      if (isFirstListenForNamespace(dispatches, namespace)) {
        // Set up listener and create object for storing dispatches
        queue.process(
          '*',
          maxConcurrency,
          handler(null, namespace, wrapSourceService, defaultIdentId)
        )
        dispatches[namespace] = {}
      }

      dispatches[namespace][subNamespace] = dispatch

      debugLog(
        `Listening to queue '${namespace}' for sub namespace '${subNamespace}'`
      )
    } else {
      // Normal setup with on queue per namespace
      queue.process(
        maxConcurrency,
        handler(dispatch, namespace, wrapSourceService, defaultIdentId)
      )
      debugLog(`Listening to queue '${namespace}'`)
    }

    return { status: 'ok' }
  } catch (error) {
    debugLog(`Cannot listen to queue '${namespace}'. ${error}`)
    return { status: 'error', error: `Cannot listen to queue. ${error}` }
  }
}
