import { Job } from 'bull'
import debug = require('debug')
import { isObject, isAction } from './utils/is'
import { Connection, Response, Action } from './types'

export interface PromiseWithProgress<T> extends Promise<T> {
  onProgress?: (cb: (progress?: number) => void) => void
}

export interface DispatchWithProgress<T = unknown> {
  (action: Action | null): PromiseWithProgress<Response<T>>
}

const debugLog = debug('integreat:transporter:bull')

const OK_STATUSES = ['ok', 'noaction', 'queued']

const wrapJobInAction = (
  job: unknown,
  wrapSourceService: string,
  defaultIdentId?: string
) => ({
  type: 'REQUEST',
  payload: { data: job, sourceService: wrapSourceService },
  meta: defaultIdentId ? { ident: { id: defaultIdentId } } : {},
})

const setJobIdWhenNoActionId = (action: Action, id?: string | number) =>
  action.meta?.id || !id
    ? action
    : {
        ...action,
        meta: { ...action.meta, id: String(id) },
      }

const handler = (
  dispatch: DispatchWithProgress,
  wrapSourceService: string,
  defaultIdentId?: string
) =>
  async function processJob(job: Job) {
    const shouldWrapJob = !isAction(job.data)
    const action = shouldWrapJob
      ? wrapJobInAction(job.data, wrapSourceService, defaultIdentId)
      : job.data
    const dispatchPromise = dispatch(setJobIdWhenNoActionId(action, job.id))

    // Report function if dispatch support onProgress
    if (typeof dispatchPromise.onProgress === 'function') {
      dispatchPromise.onProgress(async function handleProgress(progress) {
        debugLog(`Progress set to ${progress}`)
        try {
          await job.progress(progress)
        } catch (err) {
          debugLog(`Failed to update progress. ${err}`)
        }
        debugLog('Progress updated')
      })
    }
    const response = await dispatchPromise

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
  connection: Connection | null
): Promise<Response> {
  const {
    queue,
    maxConcurrency = 1,
    wrapSourceService = 'bull',
    defaultIdentId,
  } = connection || {}
  if (!queue) {
    debugLog(`Cannot listen to queue '${connection?.namespace}'. No queue`)
    return { status: 'error', error: 'Cannot listen to queue. No queue' }
  }

  try {
    // Start listening to queue
    queue.process(
      maxConcurrency,
      handler(dispatch, wrapSourceService, defaultIdentId)
    )
    debugLog(`Listening to queue '${connection?.namespace}'`)

    return { status: 'ok' }
  } catch (error) {
    debugLog(`Cannot listen to queue '${connection?.namespace}'. ${error}`)
    return { status: 'error', error: `Cannot listen to queue. ${error}` }
  }
}
