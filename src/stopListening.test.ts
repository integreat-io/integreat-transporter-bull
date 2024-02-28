import test from 'ava'
import sinon from 'sinon'
import type { Queue } from 'bull'
import type { Connection, ActiveQueue } from './types.js'

import stopListening from './stopListening.js'

// Setup

function createQueues(queue: Queue, subQueueIds: string[]) {
  const listeners = new Map()
  for (const id of subQueueIds) {
    listeners.set(id, {})
  }
  const queues = new Map<string, ActiveQueue>()
  const greatQueue = { queue, listeners, isListening: false }
  queues.set('great', greatQueue)
  return queues
}

const queue = {
  close: () => undefined,
} as unknown as Queue

// Tests

test('should stop listening and remove the listener', async (t) => {
  const closeStub = sinon.stub().resolves(undefined)
  const queue = {
    close: closeStub,
  } as unknown as Queue
  const listeners = createQueues(queue, ['*', 'sub1'])
  const conn = { status: 'ok', queue, queueId: 'great', subQueueId: '*' }
  const expected = { status: 'ok' }

  const ret = await stopListening(listeners)(conn as unknown as Connection)

  t.deepEqual(ret, expected)
  t.true(listeners.has('great')) // Should keep the queue map
  t.false(listeners.get('great')?.listeners.has('*')) // ... but remove the listener
  t.true(listeners.get('great')?.listeners.has('sub1')) // Should not touch other sub queues
  t.is(closeStub.callCount, 0) // Should not close the connection
})

test('should not remove queue even when all sub queues are gone', async (t) => {
  const closeStub = sinon.stub().resolves(undefined)
  const queue = {
    close: closeStub,
  } as unknown as Queue
  const listeners = createQueues(queue, ['*', 'sub1'])
  const conn0 = { status: 'ok', queue, queueId: 'great', subQueueId: '*' }
  const conn1 = { status: 'ok', queue, queueId: 'great', subQueueId: 'sub1' }
  const expected = { status: 'ok' }

  const ret0 = await stopListening(listeners)(conn0 as unknown as Connection)
  const ret1 = await stopListening(listeners)(conn1 as unknown as Connection)

  t.deepEqual(ret0, expected)
  t.deepEqual(ret1, expected)
  t.true(listeners.has('great')) // Should keep the queue map
  t.false(listeners.get('great')?.listeners.has('*'))
  t.false(listeners.get('great')?.listeners.has('sub1'))
})

test('should remove the main queue when no subQueueId', async (t) => {
  const listeners = createQueues(queue, ['*', 'sub1'])
  const conn = { status: 'ok', queue, queueId: 'great' } // No subQueueId
  const expected = { status: 'ok' }

  const ret = await stopListening(listeners)(conn as unknown as Connection)

  t.deepEqual(ret, expected)
  t.true(listeners.has('great')) // Should keep the queue map
  t.false(listeners.get('great')?.listeners.has('*')) // ... but remove the listener
  t.true(listeners.get('great')?.listeners.has('sub1')) // Should not touch other sub queues
})

test('should do nothing when queue is not found among queues', async (t) => {
  const listeners = createQueues(queue, ['*', 'sub1'])
  const conn = { status: 'ok', queue, queueId: 'unknown', subQueueId: '*' }
  const expected = {
    status: 'noaction',
    warning: "Queue 'unknown' is not connected",
  }

  const ret = await stopListening(listeners)(conn as unknown as Connection)

  t.deepEqual(ret, expected)
  t.true(listeners.has('great')) // Should keep the queue map
  t.is(listeners.get('great')?.listeners.size, 2)
})

test('should do nothing when subqueue is not found among listeners', async (t) => {
  const listeners = createQueues(queue, ['*', 'sub1'])
  const conn = { status: 'ok', queue, queueId: 'great', subQueueId: 'sub2' }
  const expected = {
    status: 'noaction',
    warning: "Queue 'great' is not listening for sub queue 'sub2'",
  }

  const ret = await stopListening(listeners)(conn as unknown as Connection)

  t.deepEqual(ret, expected)
  t.true(listeners.has('great')) // Should keep the queue map
  t.is(listeners.get('great')?.listeners.size, 2)
})

test('should do nothing when no connection', async (t) => {
  const closeStub = sinon.stub().resolves(undefined)
  const queue = {
    close: closeStub,
  } as unknown as Queue
  const listeners = createQueues(queue, ['*', 'sub1'])
  const expected = { status: 'noaction', warning: 'No connection' }

  const ret = await stopListening(listeners)(null)

  t.deepEqual(ret, expected)
  t.true(listeners.has('great')) // Should keep the queue map
  t.is(listeners.get('great')?.listeners.size, 2)
  t.is(closeStub.callCount, 0) // Should not close the connection
})
