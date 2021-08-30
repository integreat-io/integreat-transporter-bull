import test from 'ava'
import { Queue } from 'bull'
import sinon = require('sinon')

import listen from './listen'

// Setup
const action = {
  type: 'SET',
  payload: { type: 'entry', data: { id: 'ent1', title: 'Entry 1' } },
  meta: {},
}

const dispatch = async () => ({ status: 'ok', data: [] })

// Tests

test('should listen to queue and dispatch action', async (t) => {
  const processStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const connection = { status: 'ok', queue, namespace: 'great' }
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const expected = { status: 'ok' }
  const expectedAction = { ...action, meta: { id: 'job1' } }
  const expectedQueueResponse = { status: 'ok', data: [] }

  const listenResponse = await listen(dispatch, connection)
  const processFn = processStub.args[0][1] // Get the internal job handler
  const processResponse = await processFn({ data: action, id: 'job1' }) // Call internal handler to make sure it calls dispatch

  t.deepEqual(listenResponse, expected)
  t.is(dispatch.callCount, 1)
  t.deepEqual(dispatch.args[0][0], expectedAction)
  t.deepEqual(processStub.args[0][0], 1) // Default max concurrency
  t.deepEqual(processResponse, expectedQueueResponse)
})

test('should wrap non-action jobs in a REQUEST action and unwrap response', async (t) => {
  const processStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const connection = { status: 'ok', queue, namespace: 'great' }
  const dispatch = sinon
    .stub()
    .resolves({ status: 'ok', data: { ok: true, context: {} } })
  const job = { id: 'someJob' }
  const expectedAction = {
    type: 'REQUEST',
    payload: { data: job },
    meta: { id: 'job2' },
  }
  const expectedQueueResponse = { ok: true, context: {} }

  const listenResponse = await listen(dispatch, connection)
  const processFn = processStub.args[0][1] // Get the internal job handler
  const processResponse = await processFn({ data: job, id: 'job2' }) // Call internal handler to make sure it calls dispatch

  t.deepEqual(listenResponse.status, 'ok')
  t.is(dispatch.callCount, 1)
  t.deepEqual(dispatch.args[0][0], expectedAction)
  t.deepEqual(processResponse, expectedQueueResponse)
})

test('should not override action id', async (t) => {
  const processStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const connection = { status: 'ok', queue, namespace: 'great' }
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const actionWithId = { ...action, meta: { id: 'action1' } }
  const expected = { status: 'ok' }

  const ret = await listen(dispatch, connection)
  const processFn = processStub.args[0][1] // Get the internal job handler
  await processFn({ data: actionWithId, id: 'job1' }) // Call internal handler to make sure it calls dispatch

  t.deepEqual(ret, expected)
  t.deepEqual(dispatch.args[0][0], actionWithId)
})

test('should not set action id when job is missing id', async (t) => {
  const processStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const connection = { status: 'ok', queue, namespace: 'great' }
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const expected = { status: 'ok' }

  const ret = await listen(dispatch, connection)
  const processFn = processStub.args[0][1] // Get the internal job handler
  await processFn({ data: action }) // Call internal handler to make sure it calls dispatch

  t.deepEqual(ret, expected)
  t.deepEqual(dispatch.args[0][0], action)
})

test('should reject when action response is error', async (t) => {
  const processStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const connection = { status: 'ok', queue, namespace: 'great' }
  const dispatch = sinon
    .stub()
    .resolves({ status: 'notfound', error: 'Where?' })
  const expected = { status: 'ok' }

  const ret = await listen(dispatch, connection)
  const processFn = processStub.args[0][1] // Get the internal job handler
  const err = await t.throwsAsync(processFn({ data: action })) // Call internal handler to make sure it calls dispatch

  t.is(err.message, '[notfound] Where?')
  t.deepEqual(ret, expected)
})

test('should not reject when action response is noaction', async (t) => {
  const processStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const connection = { status: 'ok', queue, namespace: 'great' }
  const dispatch = sinon
    .stub()
    .resolves({ status: 'noaction', error: 'Nothing to do' })
  const expected = { status: 'ok' }

  const ret = await listen(dispatch, connection)
  const processFn = processStub.args[0][1] // Get the internal job handler
  await t.notThrowsAsync(processFn({ data: action })) // Call internal handler to make sure it calls dispatch

  t.deepEqual(ret, expected)
})

test('should not reject when action response is queued', async (t) => {
  const processStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const connection = { status: 'ok', queue, namespace: 'great' }
  const dispatch = sinon.stub().resolves({ status: 'queued' })
  const expected = { status: 'ok' }

  const ret = await listen(dispatch, connection)
  const processFn = processStub.args[0][1] // Get the internal job handler
  await t.notThrowsAsync(processFn({ data: action })) // Call internal handler to make sure it calls dispatch

  t.deepEqual(ret, expected)
})

test('should reject when response is not a valid response', async (t) => {
  const processStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const connection = { status: 'ok', queue, namespace: 'great' }
  const dispatch = sinon.stub().resolves(null)
  const expected = { status: 'ok' }

  const ret = await listen(dispatch, connection)
  const processFn = processStub.args[0][1] // Get the internal job handler
  const err = await t.throwsAsync(processFn({ data: action })) // Call internal handler to make sure it calls dispatch

  t.is(err.message, 'Queued action did not return a valid response')
  t.deepEqual(ret, expected)
})

test('should call process with max concurrency', async (t) => {
  const processStub = sinon.stub()
  const queue = {
    process: processStub,
    resume: sinon.stub().resolves(undefined),
  } as unknown as Queue
  const connection = {
    status: 'ok',
    queue,
    namespace: 'great',
    maxConcurrency: 5,
  }
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const expected = { status: 'ok' }

  const ret = await listen(dispatch, connection)

  t.deepEqual(ret, expected)
  t.is(processStub.callCount, 1)
  t.deepEqual(processStub.args[0][0], 5)
})

test('should return error when listening fails', async (t) => {
  const processStub = sinon.stub().throws(new Error('Will not listen'))
  const queue = { process: processStub } as unknown as Queue
  const connection = { status: 'ok', queue, namespace: 'great' }
  const expected = {
    status: 'error',
    error: 'Cannot listen to queue. Error: Will not listen',
  }

  const ret = await listen(dispatch, connection)

  t.deepEqual(ret, expected)
})

test('should return error when no queue', async (t) => {
  const connection = { status: 'ok', queue: undefined, namespace: 'great' }
  const expected = {
    status: 'error',
    error: 'Cannot listen to queue. No queue',
  }

  const ret = await listen(dispatch, connection)

  t.deepEqual(ret, expected)
})

test('should return error when no connection', async (t) => {
  const connection = null
  const expected = {
    status: 'error',
    error: 'Cannot listen to queue. No queue',
  }

  const ret = await listen(dispatch, connection)

  t.deepEqual(ret, expected)
})
