import test from 'node:test'
import assert from 'node:assert/strict'
import sinon from 'sinon'
import type { Queue } from 'bull'
import type { HandlersObject, QueueHandlers, QueueWithCount } from './types.js'

import disconnect from './disconnect.js'

// Setup

const handlers = new Map<string, QueueHandlers>()
const queues = new Map<string, QueueWithCount>()
const dispatch = async () => ({ status: 'ok' })
const authenticate = async () => ({ status: 'ok' })

// Tests

test('should disconnect and remove queue and handler', async () => {
  const queueId = 'ns70'
  const closeStub = sinon.stub().resolves(undefined)
  const getJobCountsStub = sinon.stub().resolves(undefined)
  const queue = {
    close: closeStub,
    getJobCounts: getJobCountsStub,
  } as unknown as Queue
  queues.set(queueId, { queue, count: 1 })
  const handlersObject = { dispatch, authenticate }
  handlers.set(queueId, handlersObject)
  const conn = { status: 'ok', queue, queueId, handlers: handlersObject }

  await disconnect(queues, handlers)(conn)

  assert.equal(getJobCountsStub.callCount, 1)
  assert.equal(closeStub.callCount, 1)
  assert.equal(conn.queue, undefined, 'Queue was not removed from connection')
  assert.equal(queues.has(queueId), false, 'Queue was not removed')
  assert.equal(handlers.has(queueId), false, 'Handlers were not removed')
  assert.equal(conn.handlers, undefined, 'Should remove handlers on connection')
})

test('should not disconnect and remove queue when there are more connections left', async () => {
  const queueId = 'ns74'
  const closeStub = sinon.stub().resolves(undefined)
  const getJobCountsStub = sinon.stub().resolves(undefined)
  const queue = {
    close: closeStub,
    getJobCounts: getJobCountsStub,
  } as unknown as Queue
  queues.set(queueId, { queue, count: 2 }) // We have two connections on the queue
  const handlersObject = { dispatch, authenticate }
  handlers.set(queueId, handlersObject)
  const conn = { status: 'ok', queue, queueId, handlers: handlersObject }
  const expectedQueueObj = { queue, count: 1 } // We count down one

  await disconnect(queues, handlers)(conn)

  assert.deepEqual(queues.get(queueId), expectedQueueObj)
  assert.equal(
    getJobCountsStub.callCount,
    0,
    `getJobCounts() called ${getJobCountsStub.callCount} times`,
  )
  assert.equal(
    closeStub.callCount,
    0,
    `close() called ${closeStub.callCount} times`,
  )
  assert.equal(conn.queue, undefined, 'Queue was not removed from connection')
  assert.equal(queues.has(queueId), true, 'Queue was removed')
  assert.equal(handlers.has(queueId), false, 'Handlers were not removed')
  assert.equal(conn.handlers, undefined, 'Should remove handlers on connection')
})

test('should disconnect when there is no queue object stored', async () => {
  const queueId = 'ns75'
  const closeStub = sinon.stub().resolves(undefined)
  const getJobCountsStub = sinon.stub().resolves(undefined)
  const queue = {
    close: closeStub,
    getJobCounts: getJobCountsStub,
  } as unknown as Queue
  const handlersObject = { dispatch, authenticate }
  handlers.set(queueId, handlersObject)
  const conn = { status: 'ok', queue, queueId, handlers: handlersObject }

  await disconnect(queues, handlers)(conn)

  assert.equal(
    getJobCountsStub.callCount,
    1,
    `getJobCounts() called ${getJobCountsStub.callCount} times`,
  )
  assert.equal(
    closeStub.callCount,
    1,
    `close() called ${closeStub.callCount} times`,
  )
  assert.equal(conn.queue, undefined, 'Queue was not removed from connection')
  assert.equal(queues.has(queueId), false, 'Queue was added somehow ...?')
  assert.equal(handlers.has(queueId), false, 'Handlers were not removed')
  assert.equal(conn.handlers, undefined, 'Should remove handlers on connection')
})

test('should disconnect sub queue and remove queue and handler', async () => {
  const queueId = 'ns71'
  const closeStub = sinon.stub().resolves(undefined)
  const getJobCountsStub = sinon.stub().resolves(undefined)
  const queue = {
    close: closeStub,
    getJobCounts: getJobCountsStub,
  } as unknown as Queue
  queues.set(queueId, { queue, count: 1 })
  const subHandlers = new Map<string, HandlersObject>()
  const handlersObject = { dispatch, authenticate }
  subHandlers.set('sub0', handlersObject)
  handlers.set(queueId, { dispatch: null, authenticate: null, subHandlers })
  const conn = {
    status: 'ok',
    queue,
    queueId,
    subQueueId: 'sub0',
    handlers: handlersObject,
  }

  await disconnect(queues, handlers)(conn)

  assert.equal(getJobCountsStub.callCount, 1)
  assert.equal(closeStub.callCount, 1)
  assert.equal(conn.queue, undefined, 'Queue was not removed from connection')
  assert.equal(queues.has(queueId), false, 'Queue was not removed')
  assert.equal(handlers.has(queueId), false, 'Handlers were not removed')
  assert.equal(conn.handlers, undefined, 'Should remove handlers on connection')
})

test('should not disconnect when there are other sub queues listening', async () => {
  const queueId = 'ns72'
  const closeStub = sinon.stub().resolves(undefined)
  const getJobCountsStub = sinon.stub().resolves(undefined)
  const queue = {
    close: closeStub,
    getJobCounts: getJobCountsStub,
  } as unknown as Queue
  queues.set(queueId, { queue, count: 2 })
  const subHandlers = new Map<string, HandlersObject>()
  const handlersObject = { dispatch, authenticate }
  subHandlers.set('sub0', handlersObject)
  subHandlers.set('sub1', { dispatch, authenticate })
  handlers.set(queueId, { dispatch: null, authenticate: null, subHandlers })
  const conn = {
    status: 'ok',
    queue,
    queueId,
    subQueueId: 'sub0',
    handlers: handlersObject,
  }
  const expectedQueueObj = { queue, count: 1 } // We count down one for sub queues too

  await disconnect(queues, handlers)(conn)

  assert.deepEqual(queues.get(queueId), expectedQueueObj)
  assert.equal(
    getJobCountsStub.callCount,
    0,
    `getJobCounts() called ${getJobCountsStub.callCount} times`,
  )
  assert.equal(
    closeStub.callCount,
    0,
    `close() called ${closeStub.callCount} times`,
  )
  assert.equal(conn.queue, undefined, 'Queue was not removed from connection')
  assert.equal(queues.has(queueId), true, 'Queue was removed')
  assert.equal(handlers.has(queueId), true, 'Queue handlers are removed')
  assert.equal(
    handlers.get(queueId)?.subHandlers?.has('sub0'),
    false,
    'First sub handler is not removed',
  ) // This sub's handler is removed
  assert.equal(
    handlers.get(queueId)?.subHandlers?.has('sub1'),
    true,
    'Second sub handler is removed',
  ) // Other sub is still intact
  assert.equal(conn.handlers, undefined, 'Should remove handlers on connection')
})

test('should do nothing when connection has no queue', async () => {
  const queueId = 'ns73'
  const conn = { status: 'ok', queue: undefined, queueId }

  await assert.doesNotReject(disconnect(queues, handlers)(conn))
})

test('should do nothing when no connection', async () => {
  const conn = null

  await assert.doesNotReject(disconnect(queues, handlers)(conn))
})
