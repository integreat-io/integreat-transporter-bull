import { Job } from 'bull'
import { isObject, isAction } from './utils/is'
import { Connection, Dispatch, Response, Action } from './types'

const OK_STATUSES = ['ok', 'noaction', 'queued']

const wrapJobInAction = (job: unknown) => ({
  type: 'REQUEST',
  payload: { data: job },
})

const setJobIdWhenNoActionId = (action: Action, id?: string | number) =>
  action.meta?.id || !id
    ? action
    : {
        ...action,
        meta: { ...action.meta, id: String(id) },
      }

const handler = (dispatch: Dispatch) =>
  async function processJob(job: Job) {
    const wrapJob = !isAction(job.data)
    const action = wrapJob ? wrapJobInAction(job.data) : job.data
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
  const { queue, maxConcurrency = 1 } = connection || {}
  if (!queue) {
    return { status: 'error', error: 'Cannot listen to queue. No queue' }
  }

  try {
    // Start listening to queue
    queue.process(maxConcurrency, handler(dispatch))

    return { status: 'ok' }
  } catch (error) {
    return { status: 'error', error: `Could not listen to queue. ${error}` }
  }
}
