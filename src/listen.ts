import { Job } from 'bull'
import { isObject } from './utils/is'
import { Connection, Dispatch, Response, Action } from './types'

const OK_STATUSES = ['ok', 'noaction', 'queued']

const setJobIdWhenNoActionId = (action: Action, id?: string | number) =>
  action.meta?.id || !id
    ? action
    : {
        ...action,
        meta: { ...action.meta, id: String(id) },
      }

const handler = (dispatch: Dispatch) =>
  async function processJob(job: Job<Action>) {
    const action = setJobIdWhenNoActionId(job.data, job.id)
    const response = await dispatch(action)

    if (isObject(response) && typeof response.status === 'string') {
      if (OK_STATUSES.includes(response.status)) {
        return response
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
