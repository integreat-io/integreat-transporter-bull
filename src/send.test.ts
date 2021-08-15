import ava, { TestInterface } from 'ava'
import Bull = require('bull')
import connect from './connect'

import send from './send'

// Setup

const test = ava as TestInterface<{ queue: Bull.Queue; namespace: string }>

let namespaceCount = 1
const nextNamespace = () => 'send' + namespaceCount++

test.beforeEach(async (t) => {
  const namespace = (t.context.namespace = nextNamespace())
  t.context.queue = new Bull(namespace)
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
  meta: {},
}

// Tests

test('should send data and return status and data', async (t) => {
  const { queue, namespace } = t.context
  const connection = await connect({ queue, namespace }, null, null)

  const ret = await send(action, connection)

  t.is(ret.status, 'ok', ret.error)
  const jobs = await queue.getWaiting()
  t.is(jobs.length, 1)
  t.deepEqual(jobs[0].data, action)
  const expected = {
    id: jobs[0].id,
    timestamp: jobs[0].timestamp,
    name: jobs[0].name,
  }
  t.deepEqual(ret.data, expected)
})

test('should use action id as job id', async (t) => {
  const { queue, namespace } = t.context
  const connection = await connect({ queue, namespace }, null, null)
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
  const connection = { status: 'ok', queue, namespace: 'invalidQueue' }

  const ret = await send(action, connection)

  t.is(ret.status, 'error', ret.error)
  t.true(ret.error?.startsWith('Sending to queue failed.'))
})

test('should return error when no queue', async (t) => {
  const connection = { status: 'ok', queue: undefined, namespace: 'great' }

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
