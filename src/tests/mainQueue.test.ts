import test from 'node:test'
import assert from 'node:assert/strict'
import sinon from 'sinon'
import wait from './helpers/wait.js'
import type { Connection } from '../types.js'

import transporter from '../index.js'

// Setup

const emit = () => undefined
const authenticate = async () => ({
  status: 'ok',
  access: { ident: { id: 'userFromIntegreat' } },
})

// Tests

test('should connect and disconnect', async () => {
  const options = {
    queueId: 'ns20',
    redis: { host: 'localhost', port: 6379 },
  }

  const conn = await transporter.connect(options, null, null, emit)
  await transporter.disconnect(conn)

  assert(conn, 'No connection')
  assert.equal(conn.status, 'ok')
  assert.equal((conn as Connection).queue, undefined, 'Still has a queue')
})

test('should connect, send, and listen', async (t) => {
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const queueId = 'ns21'
  const options = {
    queueId,
    redis: { host: 'localhost', port: 6379 },
  }
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: { id: 'ent1', $type: 'entry' } },
    meta: { ident: { id: 'johnf' } },
  }
  const expectedAction = {
    ...action,
    meta: { ident: { id: 'userFromIntegreat' } },
  }

  const conn0 = await transporter.connect(options, null, null, emit)
  const conn1 = await transporter.connect(options, null, null, emit)
  t.after(async () => {
    await transporter.disconnect(conn1)
    await transporter.disconnect(conn0)
  })
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const listenResponse = await transporter.listen!(
    dispatch,
    conn0,
    authenticate,
    emit,
  )
  const sendResponse = await transporter.send(action, conn1)
  await wait(200) // Give it 200 ms to handle the job

  assert.equal(
    listenResponse.status,
    'ok',
    `Listen response was [${listenResponse.status}] ${listenResponse.error}`,
  )
  assert.equal(
    sendResponse.status,
    'ok',
    `Send response was [${sendResponse.status}] ${sendResponse.error}`,
  )
  assert.equal(
    dispatch.callCount,
    1,
    `Dispatch called ${dispatch.callCount} times`,
  )
  assert.deepEqual(dispatch.args[0][0], expectedAction)
})

test('should listen and then stop listening', async (t) => {
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const queueId = 'ns22'
  const options = {
    queueId,
    redis: { host: 'localhost', port: 6379 },
  }
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: { id: 'ent1', $type: 'entry' } },
    meta: { ident: { id: 'johnf' } },
  }

  const conn0 = await transporter.connect(options, null, null, emit)
  const conn1 = await transporter.connect(options, null, null, emit)
  t.after(async () => {
    await transporter.disconnect(conn1)
    await transporter.disconnect(conn0)
  })
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const listenResponse = await transporter.listen!(
    dispatch,
    conn0,
    authenticate,
    emit,
  )
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const stopResponse = await transporter.stopListening!(conn0)
  const sendResponse = await transporter.send(action, conn1)
  await wait(200) // Give it 200 ms to handle the job

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
  assert.equal(
    sendResponse.status,
    'ok',
    `Send response was [${sendResponse.status}] ${sendResponse.error}`,
  )
  assert.equal(
    dispatch.callCount,
    0,
    `Dispatch called ${dispatch.callCount} times`,
  )
})

test('should stop listening and then listen again', async (t) => {
  const dispatch0 = sinon.stub().resolves({ status: 'ok', data: [] })
  const dispatch1 = sinon.stub().resolves({ status: 'ok', data: [] })
  const queueId = 'ns23'
  const options = {
    queueId,
    redis: { host: 'localhost', port: 6379 },
  }
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: { id: 'ent1', $type: 'entry' } },
    meta: { ident: { id: 'johnf' } },
  }
  const expectedAction = {
    ...action,
    meta: { ident: { id: 'userFromIntegreat' } },
  }

  const conn0 = await transporter.connect(options, null, null, emit)
  const conn1 = await transporter.connect(options, null, null, emit)
  const conn2 = await transporter.connect(options, null, null, emit)
  t.after(async () => {
    await transporter.disconnect(conn2)
    await transporter.disconnect(conn1)
    await transporter.disconnect(conn0)
  })
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const listenResponse0 = await transporter.listen!(
    dispatch0,
    conn0,
    authenticate,
    emit,
  )
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const stopResponse = await transporter.stopListening!(conn0)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const listenResponse1 = await transporter.listen!(
    dispatch1,
    conn1,
    authenticate,
    emit,
  )
  const sendResponse = await transporter.send(action, conn2)
  await wait(200) // Give it 200 ms to handle the job

  assert.equal(
    sendResponse.status,
    'ok',
    `Send response was [${sendResponse.status}] ${sendResponse.error}`,
  )
  assert.equal(
    listenResponse0.status,
    'ok',
    `First listen() response was [${listenResponse0.status}] ${listenResponse0.error}`,
  )
  assert.equal(
    stopResponse.status,
    'ok',
    `stopListening() response was [${stopResponse.status}] ${stopResponse.error}`,
  )
  assert.equal(
    listenResponse1.status,
    'ok',
    `Second listen() response was [${listenResponse1.status}] ${listenResponse1.error}`,
  )
  assert.equal(
    dispatch0.callCount,
    0,
    `First dispatch called ${dispatch0.callCount} times`,
  )
  assert.equal(
    dispatch1.callCount,
    1,
    `Second dispatch called ${dispatch1.callCount} times`,
  )
  assert.deepEqual(dispatch1.args[0][0], expectedAction)
})
