import { Job } from 'bull'
import debug = require('debug')
import { isObject, isAction } from './utils/is'
import { Connection, Dispatch, Response, Action } from './types'

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
  dispatch: Dispatch,
  wrapSourceService: string,
  defaultIdentId?: string
) =>
  async function processJob(job: Job) {
    const wrapJob = !isAction(job.data)
    const action = wrapJob
      ? wrapJobInAction(job.data, wrapSourceService, defaultIdentId)
      : job.data
    const response = await dispatch(setJobIdWhenNoActionId(action, job.id))

    if (isObject(response) && typeof response.status === 'string') {
      if (OK_STATUSES.includes(response.status)) {
        return wrapJob ? response.data : response
      } else {
        throw new Error(`[${response.status}] ${response.error}`)
      }
    } else {
      throw new Error('Queued action did not return a valid response')
    }
  }

export default async function listen(
  dispatch: Dispatch,
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
