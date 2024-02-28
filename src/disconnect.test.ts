import test from 'ava'
import sinon from 'sinon'
import type { Queue } from 'bull'
import type { Connection, ActiveQueue } from './types.js'

import disconnect from './disconnect.js'

// Setup

const queue = {
  close: async () => undefined,
} as unknown as Queue

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

// Tests

test('should disconnect and remove queue from listener', async (t) => {
  const closeStub = sinon.stub().resolves(undefined)
  const queue = {
    close: closeStub,
  } as unknown as Queue
  const listeners = createQueues(queue, ['*'])
  const conn = { status: 'ok', queue, queueId: 'great', subQueueId: '*' }

  await disconnect(listeners)(conn as unknown as Connection)

  t.is(closeStub.callCount, 1)
  t.false(listeners.has('great')) // Should keep the queue map
})

test('should disconnect and remove sub queue from listener', async (t) => {
  const closeStub = sinon.stub().resolves(undefined)
  const queue = {
    close: closeStub,
  } as unknown as Queue
  const listeners = createQueues(queue, ['sub1'])
  const conn = { status: 'ok', queue, queueId: 'great', subQueueId: 'sub1' }

  await disconnect(listeners)(conn as unknown as Connection)

  t.is(closeStub.callCount, 1)
  t.false(listeners.has('great'))
})

test('should remove sub queue from listener without disconnecting when we have more sub queues', async (t) => {
  const closeStub = sinon.stub().resolves(undefined)
  const queue = {
    close: closeStub,
  } as unknown as Queue
  const listeners = createQueues(queue, ['sub1', 'sub2'])
  const greatListeners = listeners.get('great')?.listeners
  const conn = { status: 'ok', queue, queueId: 'great', subQueueId: 'sub1' }

  await disconnect(listeners)(conn as unknown as Connection)

  t.is(closeStub.callCount, 0) // Don't close
  t.true(listeners.has('great'))
  t.false(greatListeners?.has('sub1')) // Removed
  t.true(greatListeners?.has('sub2')) // Kept
})

test('should treat no subQueueId as main queue', async (t) => {
  const closeStub = sinon.stub().resolves(undefined)
  const queue = {
    close: closeStub,
  } as unknown as Queue
  const listeners = createQueues(queue, ['*'])
  const conn = { status: 'ok', queue, queueId: 'great' } // No subQueueId

  await disconnect(listeners)(conn as unknown as Connection)

  t.false(listeners.has('great'))
  t.is(closeStub.callCount, 1)
})

test('should handle connection without queue id', async (t) => {
  const listeners = createQueues(queue, ['*'])
  const greatListeners = listeners.get('great')?.listeners
  const conn = { status: 'ok', queue } // No queueId

  await disconnect(listeners)(conn as unknown as Connection)

  t.is(listeners.size, 1) // Nothing has been removed from the listeners
  t.is(greatListeners?.size, 1) // ... or the queue listeners
})

test('should do nothing when connection has no queue', async (t) => {
  const listeners = createQueues(queue, ['*'])

  const conn = { status: 'ok', queue: undefined, queueId: 'great' }

  await t.notThrowsAsync(disconnect(listeners)(conn))
})

test('should do nothing when no connection', async (t) => {
  const listeners = createQueues(queue, ['*'])

  const conn = null

  await t.notThrowsAsync(disconnect(listeners)(conn))
})
