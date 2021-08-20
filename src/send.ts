import { Job, JobId, JobOptions, Queue } from 'bull'
import { Action, Response, Connection } from './types'

export interface JobData {
  id: JobId
  timestamp: number
  name: string
}

const ensureArray = <T>(value: T | T[]): T[] =>
  Array.isArray(value) ? value : [value]

const dataFromJob = ({ id, timestamp, name }: Job): JobData => ({
  id,
  timestamp,
  name,
})

async function runServiceAction(action: Action, queue: Queue) {
  const type = ensureArray(action.payload.type)
  let status = 'noaction'
  const olderThanMs = (action.payload.olderThanMs as number | undefined) || 0

  try {
    if (type.includes('cleanWaiting')) {
      await queue.clean(olderThanMs, 'wait')
      status = 'ok'
    }
    if (type.includes('cleanScheduled')) {
      await queue.clean(olderThanMs, 'delayed')
      status = 'ok'
    }
    if (type.includes('cleanCompleted')) {
      await queue.clean(olderThanMs, 'completed')
      status = 'ok'
    }
  } catch (error) {
    return { status: 'error', error: `Cleaning of queue failed. ${error}` }
  }

  return { status }
}

export default async function send(
  action: Action,
  connection: Connection | null
): Promise<Response<JobData>> {
  const { queue } = connection || {}
  if (!queue) {
    return { status: 'error', error: 'Cannot send action to queue. No queue' }
  }

  if (action.type === 'SERVICE') {
    return runServiceAction(action, queue)
  }

  const options: JobOptions = {}
  if (action.meta?.id) {
    options.jobId = action.meta.id
  }

  try {
    await queue.isReady() // Don't add job until queue is ready
    const job = await queue.add(action, options)

    return { status: 'ok', data: dataFromJob(job) }
  } catch (error) {
    return { status: 'error', error: `Sending to queue failed. ${error}` }
  }
}
