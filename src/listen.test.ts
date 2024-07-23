import test from 'node:test'
import assert from 'node:assert/strict'
import sinon from 'sinon'
import type { Queue } from 'bull'
import type { Connection } from './types.js'

import listen from './listen.js'

// Setup
const action = {
  type: 'SET',
  payload: { type: 'entry', data: { id: 'ent1', title: 'Entry 1' } },
  meta: {},
}
const metaWithIdent = { ident: { id: 'userFromIntegreat' } }

const dispatch = async () => ({ status: 'ok', data: [] })
const authenticate = async () => ({
  status: 'ok',
  access: { ident: { id: 'userFromIntegreat' } },
})

// Tests

test('should listen to queue and dispatch action, authenticating with Integreat', async () => {
  const queueId = 'ns30'
  const processStub = sinon.stub()
  const queue = { process: processStub, name: queueId } as unknown as Queue
  const connection: Connection = { status: 'ok', queue, queueId }
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const authenticate = sinon
    .stub()
    .resolves({ status: 'ok', access: { ident: { id: 'userFromIntegreat' } } })
  const job = { data: action, id: 'job1', name: '__default__', queue }
  const expected = { status: 'ok' }
  const expectedAction = { ...action, meta: metaWithIdent }
  const expectedAuthentication = { status: 'granted' }
  const expectedQueueResponse = { status: 'ok', data: [] }
  const expectedCallbackObject = { dispatch, authenticate }

  const listenResponse = await listen(dispatch, connection, authenticate)
  const processFn = processStub.args[0][1] // Get the internal job handler
  const processResponse = await processFn(job) // Call internal handler to make sure it calls dispatch

  assert.deepEqual(listenResponse, expected)
  assert.equal(authenticate.callCount, 1)
  assert.deepEqual(authenticate.args[0][0], expectedAuthentication)
  assert.deepEqual(authenticate.args[0][1], action)
  assert.equal(dispatch.callCount, 1)
  assert.deepEqual(dispatch.args[0][0], expectedAction)
  assert.equal(processStub.args[0][0], 1) // Default max concurrency
  assert.deepEqual(processResponse, expectedQueueResponse)
  assert.deepEqual(connection?.handlers, expectedCallbackObject)
})

test('should listen to subQueueId', async () => {
  const queueId = 'ns31'
  const processStub = sinon.stub()
  const queue = { process: processStub, name: queueId } as unknown as Queue
  const connection1: Connection = {
    status: 'ok',
    queue,
    queueId,
    subQueueId: 'sub1',
  }
  const connection2: Connection = {
    status: 'ok',
    queue,
    queueId,
    subQueueId: 'sub2',
  }
  const dispatch1 = sinon.stub().resolves({ status: 'ok', data: [] })
  const dispatch2 = sinon.stub().resolves({ status: 'ok', data: [] })
  const authenticate1 = sinon
    .stub()
    .resolves({ status: 'ok', access: { ident: { id: 'user1FromIntegreat' } } })
  const authenticate2 = sinon
    .stub()
    .resolves({ status: 'ok', access: { ident: { id: 'user2FromIntegreat' } } })
  const job = { data: action, id: 'job1', name: 'sub2', queue }
  const expected = { status: 'ok' }
  const expectedAction2 = {
    ...action,
    meta: { ident: { id: 'user2FromIntegreat' } },
  }
  const expectedAuthentication = { status: 'granted' }
  const expectedQueueResponse = { status: 'ok', data: [] }
  const expectedCallbackObject1 = {
    dispatch: dispatch1,
    authenticate: authenticate1,
  }
  const expectedCallbackObject2 = {
    dispatch: dispatch2,
    authenticate: authenticate2,
  }

  const listenResponse1 = await listen(dispatch1, connection1, authenticate1)
  const listenResponse2 = await listen(dispatch2, connection2, authenticate2)

  const processFn = processStub.args[0][2] // Get the internal job handler
  const processResponse = await processFn(job) // Call internal handler to make sure it calls ns2 dispatch

  assert.equal(processStub.callCount, 1)
  assert.equal(processStub.args[0][0], '*') // Catch-all queue
  assert.equal(processStub.args[0][1], 1) // Default max concurrency
  assert.equal(authenticate1.callCount, 0)
  assert.equal(authenticate2.callCount, 1)
  assert.deepEqual(authenticate2.args[0][0], expectedAuthentication)
  assert.deepEqual(authenticate2.args[0][1], action)
  assert.equal(dispatch1.callCount, 0)
  assert.equal(dispatch2.callCount, 1)
  assert.deepEqual(dispatch2.args[0][0], expectedAction2)
  assert.deepEqual(processResponse, expectedQueueResponse)
  assert.deepEqual(listenResponse1, expected)
  assert.deepEqual(listenResponse2, expected)
  assert.deepEqual(connection1?.handlers, expectedCallbackObject1)
  assert.deepEqual(connection2?.handlers, expectedCallbackObject2)
})

test('should wrap non-action jobs in a REQUEST action and unwrap response', async () => {
  const queueId = 'ns32'
  const processStub = sinon.stub()
  const queue = { process: processStub, name: queueId } as unknown as Queue
  const connection = { status: 'ok', queue, queueId }
  const dispatch = sinon
    .stub()
    .resolves({ status: 'ok', data: { ok: true, context: {} } })
  const data = { id: 'someJob' }
  const job = { data: data, id: 'job2', name: '__default__', queue }
  const expectedAction = {
    type: 'REQUEST',
    payload: { data: data },
    meta: metaWithIdent,
  }
  const expectedQueueResponse = { ok: true, context: {} }

  const listenResponse = await listen(dispatch, connection, authenticate)
  const processFn = processStub.args[0][1] // Get the internal job handler
  const processResponse = await processFn(job) // Call internal handler to make sure it calls dispatch

  assert.deepEqual(listenResponse.status, 'ok')
  assert.equal(dispatch.callCount, 1)
  assert.deepEqual(dispatch.args[0][0], expectedAction)
  assert.deepEqual(processResponse, expectedQueueResponse)
})

test('should not touch action id', async () => {
  const queueId = 'ns33'
  const processStub = sinon.stub()
  const queue = { process: processStub, name: queueId } as unknown as Queue
  const connection = { status: 'ok', queue, queueId }
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const actionWithId = {
    ...action,
    meta: { ...metaWithIdent, id: 'action1' },
  }
  const job = { data: actionWithId, id: 'job1', name: '__default__', queue }
  const expectedAction = actionWithId

  const ret = await listen(dispatch, connection, authenticate)
  const processFn = processStub.args[0][1] // Get the internal job handler
  await processFn(job) // Call internal handler to make sure it calls dispatch

  assert.deepEqual(ret.status, 'ok', ret.error)
  assert.deepEqual(dispatch.args[0][0], expectedAction)
})

test('should not set action id when missing', async () => {
  const queueId = 'ns34'
  const processStub = sinon.stub()
  const queue = { process: processStub, name: queueId } as unknown as Queue
  const connection = { status: 'ok', queue, queueId }
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const job = { data: action, id: 'job1', name: '__default__', queue }
  const expectedAction = { ...action, meta: metaWithIdent }

  const ret = await listen(dispatch, connection, authenticate)
  const processFn = processStub.args[0][1] // Get the internal job handler
  await processFn(job) // Call internal handler to make sure it calls dispatch

  assert.deepEqual(ret.status, 'ok', ret.error)
  assert.deepEqual(dispatch.args[0][0], expectedAction)
})

test('should update job progress when handler function support it', async () => {
  const queueId = 'ns35'
  const progressStub = sinon.stub().resolves(undefined)
  const processStub = sinon.stub()
  const onProgressStub = sinon.stub()
  const queue = { process: processStub, name: queueId } as unknown as Queue
  const connection = { status: 'ok', queue, queueId }
  const dispatch = sinon.stub().callsFake(() => {
    const p = new Promise((resolve) => {
      setTimeout(() => {
        resolve({ status: 'ok', data: [] })
      }, 500)
    })
    return Object.assign(p, { onProgress: onProgressStub })
  })
  const expected = { status: 'ok' }
  const expectedAction = { ...action, meta: metaWithIdent }
  const expectedQueueResponse = { status: 'ok', data: [] }
  const job = {
    data: action,
    id: 'job1',
    progress: progressStub,
    name: '__default__',
    queue,
  }

  const listenResponse = await listen(dispatch, connection, authenticate)
  const processFn = processStub.args[0][1] // Get the internal job handler
  const processResponse = await processFn(job) // Call internal handler to make sure it calls dispatch
  assert.equal(onProgressStub.callCount, 1)
  const progressFn = onProgressStub.args[0][0]
  progressFn(0.502)

  assert.equal(progressStub.callCount, 1)
  assert.equal(progressStub.args[0][0], 50)
  assert.deepEqual(listenResponse, expected)
  assert.equal(dispatch.callCount, 1)
  assert.deepEqual(dispatch.args[0][0], expectedAction)
  assert.deepEqual(processStub.args[0][0], 1) // Default max concurrency
  assert.deepEqual(processResponse, expectedQueueResponse)
})

test('should reject when action response is error', async () => {
  const queueId = 'ns36'
  const processStub = sinon.stub()
  const queue = { process: processStub, name: queueId } as unknown as Queue
  const connection = { status: 'ok', queue, queueId }
  const dispatch = sinon
    .stub()
    .resolves({ status: 'notfound', error: 'Where?' })
  const job = { data: action, name: '__default__', queue }
  const expected = { status: 'ok' }
  const expectedError = { message: '[notfound] Where?' }

  const ret = await listen(dispatch, connection, authenticate)
  const processFn = processStub.args[0][1] // Get the internal job handler

  await assert.rejects(() => processFn(job), expectedError) // Call internal handler to make sure it calls dispatch
  assert.deepEqual(ret, expected)
})

test('should not reject when action response is noaction', async () => {
  const queueId = 'ns37'
  const processStub = sinon.stub()
  const queue = { process: processStub, name: queueId } as unknown as Queue
  const connection = { status: 'ok', queue, queueId }
  const dispatch = sinon
    .stub()
    .resolves({ status: 'noaction', error: 'Nothing to do' })
  const job = { data: action, name: '__default__', queue }
  const expected = { status: 'ok' }

  const ret = await listen(dispatch, connection, authenticate)
  const processFn = processStub.args[0][1] // Get the internal job handler
  await assert.doesNotReject(processFn(job)) // Call internal handler to make sure it calls dispatch

  assert.deepEqual(ret, expected)
})

test('should not reject when action response is queued', async () => {
  const queueId = 'ns38'
  const processStub = sinon.stub()
  const queue = { process: processStub, name: queueId } as unknown as Queue
  const connection = { status: 'ok', queue, queueId }
  const dispatch = sinon.stub().resolves({ status: 'queued' })
  const job = { data: action, name: '__default__', queue }
  const expected = { status: 'ok' }

  const ret = await listen(dispatch, connection, authenticate)
  const processFn = processStub.args[0][1] // Get the internal job handler
  await assert.doesNotReject(processFn(job)) // Call internal handler to make sure it calls dispatch

  assert.deepEqual(ret, expected)
})

test('should reject when response is not a valid response', async () => {
  const queueId = 'ns39'
  const processStub = sinon.stub()
  const queue = { process: processStub, name: queueId } as unknown as Queue
  const connection = { status: 'ok', queue, queueId }
  const dispatch = sinon.stub().resolves(null)
  const expected = { status: 'ok' }
  const job = { data: action, name: '__default__', queue }
  const expectedError = {
    message: 'Queued action did not return a valid response',
  }

  const ret = await listen(dispatch, connection, authenticate)
  const processFn = processStub.args[0][1] // Get the internal job handler

  await assert.rejects(processFn(job), expectedError) // Call internal handler to make sure it calls dispatch
  assert.deepEqual(ret, expected)
})

test('should call process with max concurrency', async () => {
  const queueId = 'ns40'
  const processStub = sinon.stub()
  const queue = {
    process: processStub,
    resume: sinon.stub().resolves(undefined),
    name: queueId,
  } as unknown as Queue
  const connection = { status: 'ok', queue, queueId, maxConcurrency: 5 }
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const expected = { status: 'ok' }

  const ret = await listen(dispatch, connection, authenticate)

  assert.deepEqual(ret, expected)
  assert.equal(processStub.callCount, 1)
  assert.deepEqual(processStub.args[0][0], 5)
})

test('should return error when listening fails', async () => {
  const queueId = 'ns41'
  const processStub = sinon.stub().throws(new Error('Will not listen'))
  const queue = { process: processStub, name: queueId } as unknown as Queue
  const connection = { status: 'ok', queue, queueId }
  const expected = {
    status: 'error',
    error: 'Cannot listen to queue. Error: Will not listen',
  }

  const ret = await listen(dispatch, connection, authenticate)

  assert.deepEqual(ret, expected)
})

test('should return error when no queue', async () => {
  const queueId = 'ns42'
  const connection = { status: 'ok', queue: undefined, queueId }
  const expected = {
    status: 'error',
    error: 'Cannot listen to queue. No queue',
  }

  const ret = await listen(dispatch, connection, authenticate)

  assert.deepEqual(ret, expected)
})

test('should return error when no connection', async () => {
  const connection = null
  const expected = {
    status: 'error',
    error: 'Cannot listen to queue. No connection',
  }

  const ret = await listen(dispatch, connection, authenticate)

  assert.deepEqual(ret, expected)
})

test('should throw when authenticating with Integreat fails', async () => {
  const queueId = 'ns43'
  const processStub = sinon.stub()
  const queue = { process: processStub, name: queueId } as unknown as Queue
  const connection = { status: 'ok', queue, queueId }
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const authenticate = sinon
    .stub()
    .resolves({ status: 'noaccess', error: 'We could not grant you this wish' })
  const job = { data: action, id: 'job1', name: '__default__', queue }
  const expectedError = {
    name: 'Error',
    message:
      "Could not get authenticated ident from Integreat on queue 'ns43'. [noaccess] We could not grant you this wish",
  }

  const listenResponse = await listen(dispatch, connection, authenticate)
  const processFn = processStub.args[0][1] // Get the internal job handler
  await assert.rejects(processFn(job), expectedError) // Call internal handler to make sure it throws

  assert.equal(listenResponse.status, 'ok')
  assert.equal(authenticate.callCount, 1)
  assert.equal(dispatch.callCount, 0)
})
