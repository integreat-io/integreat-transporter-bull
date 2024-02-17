import ava, { TestFn } from 'ava'
import sinon from 'sinon'
import Bull, { Job } from 'bull'
import connect from './connect.js'

import send from './send.js'

interface JobWithDelay extends Job {
  delay: number
}

// Setup

const test = ava as TestFn<{ queue: Bull.Queue; queueId: string }>

let queueCount = 1
const nextQueueId = () => 'send' + queueCount++

test.beforeEach(async (t) => {
  const queueId = (t.context.queueId = nextQueueId())
  t.context.queue = new Bull(queueId)
})

test.afterEach.always(async (t) => {
  const queue = t.context.queue
  if (queue) {
    await queue.empty()
    return queue.close()
  }
})

const action = {
  type: 'SET',
  payload: { type: 'entry', data: { id: 'ent1', title: 'Entry 1' } },
  meta: { options: { secret: 'whaat!' }, authorized: true },
}

const emit = () => undefined

// Tests -- action

test('should send job with action and return status and data', async (t) => {
  const { queue, queueId } = t.context
  const connection = await connect({ queue, queueId }, null, null, emit)
  const expectedAction = {
    type: 'SET',
    payload: { type: 'entry', data: { id: 'ent1', title: 'Entry 1' } },
    meta: {},
  }
  const ret = await send(action, connection)

  t.is(ret.status, 'ok', ret.error)
  const jobs = await queue.getWaiting()
  t.is(jobs.length, 1)
  t.deepEqual(jobs[0].data, expectedAction)
  const expectedData = {
    id: jobs[0].id,
    timestamp: jobs[0].timestamp,
    queueId: jobs[0].name,
  }
  t.deepEqual(ret.data, expectedData)
})

test('should send job with action at the time specified by a numeric meta.queue', async (t) => {
  const { queue, queueId } = t.context
  const connection = await connect({ queue, queueId }, null, null, emit)
  const actionWithDelay = {
    ...action,
    meta: { ...action.meta, queue: Date.now() + 60000 },
  }
  const expectedAction = {
    type: 'SET',
    payload: { type: 'entry', data: { id: 'ent1', title: 'Entry 1' } },
    meta: {},
  }

  const ret = await send(actionWithDelay, connection)

  t.is(ret.status, 'ok', ret.error)
  const jobs = await queue.getDelayed()
  t.is(jobs.length, 1)
  t.deepEqual(jobs[0].data, expectedAction)
  const delay = (jobs[0] as JobWithDelay).delay
  t.is(typeof delay, 'number')
  t.true(
    delay > 59000 && delay <= 60000,
    `Delay was expected to be close to 60000, but was ${delay}`,
  )
  const jobsWaiting = await queue.getWaiting()
  t.is(jobsWaiting.length, 0)
})

test('should send job to queue with subQueueId', async (t) => {
  const { queue, queueId } = t.context
  const connection = await connect(
    { queue, queueId, subQueueId: `${queueId}_sub` },
    null,
    null,
    emit,
  )

  const ret = await send(action, connection)

  t.is(ret.status, 'ok', ret.error)
  const jobs = await queue.getWaiting()
  t.is(jobs.length, 1)
  t.deepEqual(jobs[0].data.type, 'SET')
  t.deepEqual(jobs[0].data.payload, action.payload)
  const expectedData = {
    id: jobs[0].id,
    timestamp: jobs[0].timestamp,
    queueId: `${queueId}_sub`,
  }
  t.deepEqual(ret.data, expectedData)
})

test('should send job to queue with subQueueId from action meta', async (t) => {
  const { queue, queueId } = t.context
  const connection = await connect({ queue, queueId }, null, null, emit)
  const action = {
    type: 'SET',
    payload: {
      type: 'entry',
      data: { id: 'ent1', title: 'Entry 1' },
    },
    meta: {
      subQueue: `${queueId}_sub`,
    },
  }
  const expectedAction = {
    type: 'SET',
    payload: {
      type: 'entry',
      data: { id: 'ent1', title: 'Entry 1' },
    },
    meta: {},
  }

  const ret = await send(action, connection)

  t.is(ret.status, 'ok', ret.error)
  const jobs = await queue.getWaiting()
  t.is(jobs.length, 1)
  t.deepEqual(jobs[0].data, expectedAction)
  const expectedData = {
    id: jobs[0].id,
    timestamp: jobs[0].timestamp,
    queueId: `${queueId}_sub`,
  }
  t.deepEqual(ret.data, expectedData)
})

test('should remove queue and auth from action meta', async (t) => {
  const { queue, queueId } = t.context
  const connection = await connect({ queue, queueId }, null, null, emit)
  const action = {
    type: 'SET',
    payload: {
      type: 'entry',
      data: { id: 'ent1', title: 'Entry 1' },
    },
    meta: {
      queue: true,
      auth: { secret: 'cl4ss1f13d' },
    },
  }
  const expectedAction = {
    type: 'SET',
    payload: {
      type: 'entry',
      data: { id: 'ent1', title: 'Entry 1' },
    },
    meta: {},
  }

  const ret = await send(action, connection)

  t.is(ret.status, 'ok', ret.error)
  const jobs = await queue.getWaiting()
  t.is(jobs.length, 1)
  t.deepEqual(jobs[0].data, expectedAction)
})

test('should use action id as job id', async (t) => {
  const { queue, queueId } = t.context
  const connection = await connect({ queue, queueId }, null, null, emit)
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: { id: 'ent1', title: 'Entry 1' } },
    meta: { id: 'job1' },
  }

  const ret = await send(action, connection)

  t.is(ret.status, 'ok', ret.error)
  t.is(ret.data?.id, 'job1')
})

test('should return error when queue throws', async (t) => {
  const queue = {} as Bull.Queue // To force an exception
  const connection = { status: 'ok', queue, queueId: 'invalidQueue' }

  const ret = await send(action, connection)

  t.is(ret.status, 'error', ret.error)
  t.true(ret.error?.startsWith('Sending to queue failed.'))
})

test('should return error when no queue', async (t) => {
  const connection = { status: 'ok', queue: undefined, queueId: 'great' }

  const ret = await send(action, connection)

  t.is(ret.status, 'error', ret.error)
  t.is(ret.error, 'Cannot send action to queue. No queue')
})

test('should return error when no connection', async (t) => {
  const connection = null

  const ret = await send(action, connection)

  t.is(ret.status, 'error', ret.error)
  t.is(ret.error, 'Cannot send action to queue. No queue')
})

// Tests -- clean

test('should clean waiting jobs with SERVICE action', async (t) => {
  const { queue, queueId } = t.context
  const connection = await connect({ queue, queueId }, null, null, emit)
  const action = {
    type: 'SERVICE',
    payload: { type: 'cleanWaiting' },
    meta: {},
  }
  const job = {}
  await queue.add(job)

  const ret = await send(action, connection)

  t.is(ret.status, 'ok', ret.error)
  const jobs = await queue.getWaiting()
  t.is(jobs.length, 0)
})

test('should not clean waiting jobs newer than given ms with SERVICE action', async (t) => {
  const { queue, queueId } = t.context
  const connection = await connect({ queue, queueId }, null, null, emit)
  const action = {
    type: 'SERVICE',
    payload: { type: 'cleanWaiting', olderThanMs: 7200000 },
    meta: {},
  }
  const job = {}
  await queue.add(job)

  const ret = await send(action, connection)

  t.is(ret.status, 'ok', ret.error)
  const jobs = await queue.getWaiting()
  t.is(jobs.length, 1)
})

test('should clean scheduled jobs with SERVICE action', async (t) => {
  const { queue, queueId } = t.context
  const connection = await connect({ queue, queueId }, null, null, emit)
  const action = {
    type: 'SERVICE',
    payload: { type: 'cleanScheduled' },
    meta: {},
  }
  const job = {}
  await queue.add(job, { delay: 60000 })

  const ret = await send(action, connection)

  t.is(ret.status, 'ok', ret.error)
  const jobs = await queue.getDelayed()
  t.is(jobs.length, 0)
})

test('should clean completed jobs with SERVICE action', async (t) => {
  const { queue, queueId } = t.context
  const cleanSpy = sinon.spy(queue, 'clean')
  const connection = await connect({ queue, queueId }, null, null, emit)
  const action = {
    type: 'SERVICE',
    payload: { type: 'cleanCompleted' },
    meta: {},
  }

  const ret = await send(action, connection)

  t.is(ret.status, 'ok', ret.error)
  t.is(cleanSpy.callCount, 1)
  t.is(cleanSpy.args[0][0], 0)
  t.is(cleanSpy.args[0][1], 'completed')
})

test('should clean completed jobs older than given ms with SERVICE action', async (t) => {
  const { queue, queueId } = t.context
  const cleanSpy = sinon.spy(queue, 'clean')
  const connection = await connect({ queue, queueId }, null, null, emit)
  const action = {
    type: 'SERVICE',
    payload: { type: 'cleanCompleted', olderThanMs: 3600000 },
    meta: {},
  }

  const ret = await send(action, connection)

  t.is(ret.status, 'ok', ret.error)
  t.is(cleanSpy.callCount, 1)
  t.is(cleanSpy.args[0][0], 3600000)
  t.is(cleanSpy.args[0][1], 'completed')
})

test('should clean more job types with the same SERVICE action', async (t) => {
  const { queue, queueId } = t.context
  const connection = await connect({ queue, queueId }, null, null, emit)
  const action = {
    type: 'SERVICE',
    payload: { type: ['cleanWaiting', 'cleanScheduled'] },
    meta: {},
  }
  const job = {}
  await queue.add(job)
  await queue.add(job, { delay: 60000 })

  const ret = await send(action, connection)

  t.is(ret.status, 'ok', ret.error)
  const jobsWaiting = await queue.getWaiting()
  t.is(jobsWaiting.length, 0)
  const jobsScheduled = await queue.getDelayed()
  t.is(jobsScheduled.length, 0)
})

test('should return error when cleaning fails', async (t) => {
  const { queue, queueId } = t.context
  sinon.stub(queue, 'clean').rejects(new Error('No queue!'))
  const connection = await connect({ queue, queueId }, null, null, emit)
  const action = {
    type: 'SERVICE',
    payload: { type: 'cleanCompleted' },
    meta: {},
  }

  const ret = await send(action, connection)

  t.is(ret.status, 'error', ret.error)
  t.is(ret.error, 'Cleaning of queue failed. Error: No queue!')
})
