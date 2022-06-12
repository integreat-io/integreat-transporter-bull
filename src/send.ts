import * as debug from 'debug'
import { Job, JobOptions, Queue } from 'bull'
import { Action, Response, Connection, JobData } from './types'

const debugLog = debug('integreat:transporter:bull')

const ensureArray = <T>(value: T | T[]): T[] =>
  Array.isArray(value) ? value : [value]

const dataFromJob = ({ id, timestamp, name }: Job): JobData => ({
  id,
  timestamp,
  namespace: name,
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

const removeSubQueue = ({
  meta: { subQueue, ...meta } = {},
  ...action
}: Action) => ({ ...action, meta })

async function push(
  queue: Queue,
  action: Action,
  options: JobOptions,
  subNamespace?: string
) {
  const namespace = action.meta?.subQueue || subNamespace
  if (typeof namespace === 'string') {
    return await queue.add(namespace, removeSubQueue(action), options)
  } else {
    return await queue.add(removeSubQueue(action), options)
  }
}

export default async function send(
  action: Action,
  connection: Connection | null
): Promise<Response<JobData>> {
  const { queue, subNamespace } = connection || {}
  if (!queue) {
    debugLog(
      `Cannot send action to bull queue '${connection?.namespace}': No queue`
    )
    return { status: 'error', error: 'Cannot send action to queue. No queue' }
  }

  if (action.type === 'SERVICE') {
    debugLog(`SERVICE action sent to bull queue '${connection?.namespace}'`)
    return runServiceAction(action, queue)
  }

  const options: JobOptions = {}
  if (action.meta?.id) {
    options.jobId = action.meta.id
  }

  try {
    await queue.isReady() // Don't add job until queue is ready
    const job = await push(queue, action, options, subNamespace)
    debugLog(
      `Added job '${job.id}' to queue ${
        connection?.namespace
      }': ${JSON.stringify(action)}`
    )
    return { status: 'ok', data: dataFromJob(job) }
  } catch (error) {
    debugLog(`Error sending to bull queue ${connection?.namespace}'. ${error}`)
    return { status: 'error', error: `Sending to queue failed. ${error}` }
  }
}
