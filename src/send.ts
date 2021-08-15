import { Job, JobId, JobOptions } from 'bull'
import { Action, Response, Connection } from './types'

export interface JobData {
  id: JobId
  timestamp: number
  name: string
}

const dataFromJob = ({ id, timestamp, name }: Job): JobData => ({
  id,
  timestamp,
  name,
})

export default async function send(
  action: Action,
  connection: Connection | null
): Promise<Response<JobData>> {
  const { queue } = connection || {}
  if (!queue) {
    return { status: 'error', error: 'Cannot send action to queue. No queue' }
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
