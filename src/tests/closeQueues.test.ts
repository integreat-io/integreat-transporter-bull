import test from 'node:test'
import assert from 'node:assert/strict'
import wait from './helpers/wait.js'
import type { Connection } from '../types.js'

import transporter from '../index.js'

// Setup

const emit = () => undefined

// Tests

test('should close queue', async () => {
  const queueId = 'ns60'
  const options = {
    queueId,
    redis: { host: 'localhost', port: 6379 },
  }
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: { id: 'ent1', $type: 'entry' } },
    meta: { ident: { id: 'johnf' } },
  }
  const expectedSendReponse = {
    status: 'error',
    error: 'Cannot send action to queue. No queue',
  }

  const conn: Connection | null = await transporter.connect(
    options,
    null,
    null,
    emit,
  )
  const bullQueue = conn?.queue
  await transporter.disconnect(conn)
  const sendResponse = await transporter.send(action, conn) // We're sending after the queue is closed and will get an error

  assert(conn, 'No connection')
  assert.deepEqual(sendResponse, expectedSendReponse)
  assert(bullQueue)
  assert.rejects(bullQueue.add(action), { message: 'Connection is closed.' }) // Make the bull queue is closed too
})

test('should not close queue for other connections', async (t) => {
  const queueId0 = 'ns61'
  const queueId1 = 'ns62'
  const options0 = {
    queueId: queueId0,
    redis: { host: 'localhost', port: 6379 },
  }
  const options1 = {
    queueId: queueId1,
    redis: { host: 'localhost', port: 6379 },
  }
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: { id: 'ent1', $type: 'entry' } },
    meta: { ident: { id: 'johnf' } },
  }

  const conn0 = await transporter.connect(options0, null, null, emit)
  const conn1 = await transporter.connect(options1, null, null, emit)
  t.after(async () => {
    // Close second connection when we're done
    await transporter.disconnect(conn1)
  })
  await transporter.disconnect(conn0)
  const sendResponse0 = await transporter.send(action, conn0) // We're sending after the queue is closed and will get an error
  const sendResponse1 = await transporter.send(action, conn1) // This queue is not closed, so we should get ok

  assert(conn0, 'No connection')
  assert.equal(
    sendResponse0.status,
    'error',
    `First send() responded with ${sendResponse0.status}`,
  )
  assert.equal(
    sendResponse1.status,
    'ok',
    `Second send() responded with ${sendResponse1.status}`,
  )
})

test('should not close queue for other connections when first connection has been used', async (t) => {
  const queueId0 = 'ns63'
  const queueId1 = 'ns64'
  const options0 = {
    queueId: queueId0,
    redis: { host: 'localhost', port: 6379 },
  }
  const options1 = {
    queueId: queueId1,
    redis: { host: 'localhost', port: 6379 },
  }
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: { id: 'ent1', $type: 'entry' } },
    meta: { ident: { id: 'johnf' } },
  }

  const conn0 = await transporter.connect(options0, null, null, emit)
  const sendResponse0 = await transporter.send(action, conn0) // We're sending while the queue is still open
  const conn1 = await transporter.connect(options1, null, null, emit)
  t.after(async () => {
    // Close second connection when we're done
    await transporter.disconnect(conn1)
  })
  await transporter.disconnect(conn0)
  const sendResponse1 = await transporter.send(action, conn1) // This queue is not closed, so we should get ok

  assert(conn0, 'No connection')
  assert.equal(
    sendResponse0.status,
    'ok',
    `First send() responded with ${sendResponse0.status}`,
  )
  assert.equal(
    sendResponse1.status,
    'ok',
    `Second send() responded with ${sendResponse1.status}`,
  )
})

test('should reconnect when queue has been closed by other connection', async (t) => {
  const queueId0 = 'ns65'
  const queueId1 = 'ns66'
  const options0 = {
    queueId: queueId0,
    redis: { host: 'localhost', port: 6379 },
  }
  const options1 = {
    queueId: queueId1,
    redis: { host: 'localhost', port: 6379 },
  }
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: { id: 'ent1', $type: 'entry' } },
    meta: { ident: { id: 'johnf' } },
  }

  const conn0 = await transporter.connect(options0, null, null, emit)
  const sendResponse0 = await transporter.send(action, conn0) // We're sending while the queue is still open
  await transporter.disconnect(conn0)
  const conn1 = await transporter.connect(options1, null, null, emit)
  t.after(async () => {
    // Close second connection when we're done
    await transporter.disconnect(conn1)
  })
  const sendResponse1 = await transporter.send(action, conn1) // This queue is not closed, so we should get ok

  assert(conn0, 'No connection')
  assert.equal(
    sendResponse0.status,
    'ok',
    `First send() responded with ${sendResponse0.status}`,
  )
  assert.equal(
    sendResponse1.status,
    'ok',
    `Second send() responded with ${sendResponse1.status}`,
  )
})

test('should reconnect to sub queue previously closed by other connectin', async (t) => {
  const queueId = 'ns67'
  const options0 = {
    queueId,
    redis: { host: 'localhost', port: 6379 },
  }
  const options1 = {
    queueId,
    redis: { host: 'localhost', port: 6379 },
  }
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: { id: 'ent1', $type: 'entry' } },
    meta: { ident: { id: 'johnf' } },
  }

  const conn0 = await transporter.connect(options0, null, null, emit)
  const sendResponse0 = await transporter.send(action, conn0) // We're sending while the queue is still open
  await transporter.disconnect(conn0)
  const conn1 = await transporter.connect(options1, null, null, emit)
  t.after(async () => {
    // Close second connection when we're done
    await transporter.disconnect(conn1)
  })
  const sendResponse1 = await transporter.send(action, conn1) // This queue was closed, but should be reconnected

  assert(conn0, 'No connection')
  assert.equal(
    sendResponse0.status,
    'ok',
    `First send() responded with ${sendResponse0.status} ${sendResponse0.error}`,
  )
  assert.equal(
    sendResponse1.status,
    'ok',
    `Second send() responded with ${sendResponse1.status} ${sendResponse1.error}`,
  )
})

test('should not close sub queue for other connections', async (t) => {
  const queueId = 'ns68'
  const options0 = {
    queueId,
    subQueueId: 'sub0',
    redis: { host: 'localhost', port: 6379 },
  }
  const options1 = {
    queueId,
    subQueueId: 'sub1',
    redis: { host: 'localhost', port: 6379 },
  }
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: { id: 'ent1', $type: 'entry' } },
    meta: { ident: { id: 'johnf' } },
  }

  const conn0 = await transporter.connect(options0, null, null, emit)
  const conn1 = await transporter.connect(options1, null, null, emit)
  t.after(async () => {
    // Close second connection when we're done
    await transporter.disconnect(conn1)
  })
  await transporter.disconnect(conn0)
  const sendResponse0 = await transporter.send(action, conn0) // We're sending after the queue is closed and will get an error
  const sendResponse1 = await transporter.send(action, conn1) // This queue is not closed, so we should get ok

  assert(conn0, 'No connection')
  assert.equal(
    sendResponse0.status,
    'error',
    `First send() responded with ${sendResponse0.status}`,
  )
  assert.equal(
    sendResponse1.status,
    'ok',
    `Second send() responded with ${sendResponse1.status}. ${sendResponse1.error}`,
  )
})
