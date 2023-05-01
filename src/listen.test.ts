import test from 'ava'
import sinon from 'sinon'
import type { Queue } from 'bull'

import listen from './listen.js'

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
  const connection = { status: 'ok', queue, queueId: 'great' }
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const expected = { status: 'ok' }
  const expectedAction = action
  const expectedQueueResponse = { status: 'ok', data: [] }

  const listenResponse = await listen(dispatch, connection)
  const processFn = processStub.args[0][1] // Get the internal job handler
  const processResponse = await processFn({ data: action, id: 'job1' }) // Call internal handler to make sure it calls dispatch

  t.deepEqual(listenResponse, expected)
  t.is(dispatch.callCount, 1)
  t.deepEqual(dispatch.args[0][0], expectedAction)
  t.is(processStub.args[0][0], 1) // Default max concurrency
  t.deepEqual(processResponse, expectedQueueResponse)
})

test('should listen to subQueueId', async (t) => {
  const processStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const connection1 = {
    status: 'ok',
    queue,
    queueId: 'great',
    subQueueId: 'ns1',
  }
  const connection2 = {
    status: 'ok',
    queue,
    queueId: 'great',
    subQueueId: 'ns2',
  }
  const dispatch1 = sinon.stub().resolves({ status: 'ok', data: [] })
  const dispatch2 = sinon.stub().resolves({ status: 'ok', data: [] })
  const expected = { status: 'ok' }
  const expectedAction = action
  const expectedQueueResponse = { status: 'ok', data: [] }

  const listenResponse1 = await listen(dispatch1, connection1)
  const listenResponse2 = await listen(dispatch2, connection2)

  const processFn = processStub.args[0][2] // Get the internal job handler
  const processResponse = await processFn({
    data: action,
    id: 'job1',
    name: 'ns2',
  }) // Call internal handler to make sure it calls ns2 dispatch

  t.is(processStub.callCount, 1)
  t.is(processStub.args[0][0], '*') // Catch-all queue
  t.is(processStub.args[0][1], 1) // Default max concurrency
  t.is(dispatch1.callCount, 0)
  t.is(dispatch2.callCount, 1)
  t.deepEqual(dispatch2.args[0][0], expectedAction)
  t.deepEqual(processResponse, expectedQueueResponse)
  t.deepEqual(listenResponse1, expected)
  t.deepEqual(listenResponse2, expected)
})

test('should wrap non-action jobs in a REQUEST action and unwrap response', async (t) => {
  const processStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const connection = { status: 'ok', queue, queueId: 'great' }
  const dispatch = sinon
    .stub()
    .resolves({ status: 'ok', data: { ok: true, context: {} } })
  const job = { id: 'someJob' }
  const expectedAction = {
    type: 'REQUEST',
    payload: { data: job },
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
  const connection = { status: 'ok', queue, queueId: 'great' }
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const actionWithId = {
    ...action,
    meta: { id: 'action1' },
  }
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
  const connection = { status: 'ok', queue, queueId: 'great' }
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const expected = { status: 'ok' }

  const ret = await listen(dispatch, connection)
  const processFn = processStub.args[0][1] // Get the internal job handler
  await processFn({ data: action }) // Call internal handler to make sure it calls dispatch

  t.deepEqual(ret, expected)
  t.deepEqual(dispatch.args[0][0].meta, action.meta)
})

test('should update job progress when handler function support it', async (t) => {
  const progressStub = sinon.stub().resolves(undefined)
  const processStub = sinon.stub()
  const onProgressStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const connection = { status: 'ok', queue, queueId: 'great' }
  const dispatch = sinon.stub().callsFake(() => {
    const p = new Promise((resolve) => {
      setTimeout(() => {
        resolve({ status: 'ok', data: [] })
      }, 500)
    })
    return Object.assign(p, { onProgress: onProgressStub })
  })
  const expected = { status: 'ok' }
  const expectedAction = action
  const expectedQueueResponse = { status: 'ok', data: [] }
  const bullJob = { data: action, id: 'job1', progress: progressStub }

  const listenResponse = await listen(dispatch, connection)
  const processFn = processStub.args[0][1] // Get the internal job handler
  const processResponse = await processFn(bullJob) // Call internal handler to make sure it calls dispatch
  t.is(onProgressStub.callCount, 1)
  const progressFn = onProgressStub.args[0][0]
  progressFn(0.502)

  t.is(progressStub.callCount, 1)
  t.is(progressStub.args[0][0], 50)
  t.deepEqual(listenResponse, expected)
  t.is(dispatch.callCount, 1)
  t.deepEqual(dispatch.args[0][0], expectedAction)
  t.deepEqual(processStub.args[0][0], 1) // Default max concurrency
  t.deepEqual(processResponse, expectedQueueResponse)
})

test('should reject when action response is error', async (t) => {
  const processStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const connection = { status: 'ok', queue, queueId: 'great' }
  const dispatch = sinon
    .stub()
    .resolves({ status: 'notfound', error: 'Where?' })
  const expected = { status: 'ok' }

  const ret = await listen(dispatch, connection)
  const processFn = processStub.args[0][1] // Get the internal job handler
  const err = await t.throwsAsync(processFn({ data: action })) // Call internal handler to make sure it calls dispatch

  t.is(err?.message, '[notfound] Where?')
  t.deepEqual(ret, expected)
})

test('should not reject when action response is noaction', async (t) => {
  const processStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const connection = { status: 'ok', queue, queueId: 'great' }
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
  const connection = { status: 'ok', queue, queueId: 'great' }
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
  const connection = { status: 'ok', queue, queueId: 'great' }
  const dispatch = sinon.stub().resolves(null)
  const expected = { status: 'ok' }

  const ret = await listen(dispatch, connection)
  const processFn = processStub.args[0][1] // Get the internal job handler
  const err = await t.throwsAsync(processFn({ data: action })) // Call internal handler to make sure it calls dispatch

  t.is(err?.message, 'Queued action did not return a valid response')
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
    queueId: 'great',
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
  const connection = { status: 'ok', queue, queueId: 'great' }
  const expected = {
    status: 'error',
    error: 'Cannot listen to queue. Error: Will not listen',
  }

  const ret = await listen(dispatch, connection)

  t.deepEqual(ret, expected)
})

test('should return error when no queue', async (t) => {
  const connection = { status: 'ok', queue: undefined, queueId: 'great' }
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
