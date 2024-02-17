import debug from 'debug'
import type { Action, Response } from 'integreat'
import type { Job, JobOptions, Queue } from 'bull'
import type { Connection, JobData } from './types.js'

const debugLog = debug('integreat:transporter:bull')

const ensureArray = <T>(value: T | T[]): T[] =>
  Array.isArray(value) ? value : [value]

const dataFromJob = ({ id, timestamp, name }: Job): JobData => ({
  id,
  timestamp,
  queueId: name,
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

const removeMetaProps = ({
  meta: { options, authorized, subQueue, queue, auth, ...meta } = {},
  ...action
}: Action) => ({ ...action, meta })

async function push(
  queue: Queue,
  action: Action,
  options: JobOptions,
  subQueueId?: string,
) {
  const queueId = action.meta?.subQueue || subQueueId
  if (typeof queueId === 'string') {
    return await queue.add(queueId, removeMetaProps(action), options)
  } else {
    return await queue.add(removeMetaProps(action), options)
  }
}

async function sendActionToQueue(
  action: Action,
  queue: Queue,
  options: JobOptions,
  queueId?: string,
  subQueueId?: string,
) {
  try {
    await queue.isReady() // Don't add job until queue is ready
    const job = await push(queue, action, options, subQueueId)
    debugLog(
      `Added job '${job.id}' to queue ${queueId}' with options ${options}: ${JSON.stringify(action)}`,
    )
    return { status: 'ok', data: dataFromJob(job) }
  } catch (error) {
    debugLog(`Error sending to bull queue ${queueId}'. ${error}`)
    return { status: 'error', error: `Sending to queue failed. ${error}` }
  }
}

export default async function send(
  action: Action,
  connection: Connection | null,
): Promise<Response<JobData>> {
  const { queue, queueId, subQueueId } = connection || {}
  if (!queue) {
    debugLog(`Cannot send action to bull queue '${queueId}': No queue`)
    return { status: 'error', error: 'Cannot send action to queue. No queue' }
  }

  if (action.type === 'SERVICE') {
    debugLog(`SERVICE action sent to bull queue '${queueId}'`)
    return runServiceAction(action, queue)
  }

  const options: JobOptions = {}
  if (action.meta?.id) {
    options.jobId = action.meta.id
  }
  if (typeof action.meta?.queue === 'number') {
    options.delay = action.meta.queue - Date.now()
  }

  return await sendActionToQueue(action, queue, options, queueId, subQueueId)
}
