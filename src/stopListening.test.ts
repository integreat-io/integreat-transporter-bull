import test from 'node:test'
import assert from 'node:assert/strict'
import sinon from 'sinon'
import listen from './listen.js'
import type { Queue } from 'bull'
import type { Connection, QueueObject } from './types.js'

import stopListening from './stopListening.js'

// Setup

// const action = {
//   type: 'SET',
//   payload: { type: 'entry', data: { id: 'ent1', title: 'Entry 1' } },
//   meta: {},
// }

const queues = new Map<string, QueueObject>()
const fn = async () => ({ status: 'ok' })

// Tests

test('should stop listening by removing callbacks', async () => {
  const processStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const connection: Connection = {
    status: 'ok',
    queue,
    queueId: 'great',
    handlers: { dispatch: fn, authenticate: fn },
  }
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const authenticate = sinon
    .stub()
    .resolves({ status: 'ok', access: { ident: { id: 'userFromIntegreat' } } })

  const listenResponse = await listen(queues)(
    dispatch,
    connection,
    authenticate,
  )
  const stopResponse = await stopListening(connection)

  assert.equal(
    listenResponse.status,
    'ok',
    `Listen response was [${listenResponse.status}] ${listenResponse.error}`,
  )
  assert.equal(
    stopResponse.status,
    'ok',
    `stopListening() response was [${stopResponse.status}] ${stopResponse.error}`,
  )
  assert.equal(connection.handlers?.dispatch, null)
  assert.equal(connection.handlers?.authenticate, null)
})

test('should respond with noaction when no connection', async () => {
  const connection = null
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const authenticate = sinon
    .stub()
    .resolves({ status: 'ok', access: { ident: { id: 'userFromIntegreat' } } })
  const expectedResponse = { status: 'noaction', error: 'No connection' }

  await listen(queues)(dispatch, connection, authenticate)
  const stopResponse = await stopListening(connection)

  assert.deepEqual(stopResponse, expectedResponse)
})
