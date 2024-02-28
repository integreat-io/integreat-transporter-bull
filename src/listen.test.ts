import test from 'ava'
import sinon from 'sinon'
import type { Dispatch } from 'integreat'
import type { Queue } from 'bull'
import type { ActiveQueue } from './types.js'

import listen from './listen.js'

// Setup

const action = {
  type: 'SET',
  payload: { type: 'entry', data: { id: 'ent1', title: 'Entry 1' } },
  meta: {},
}
const metaWithIdent = { ident: { id: 'userFromIntegreat' } }

const dispatch = (async () => ({
  status: 'ok',
  data: [],
})) as unknown as Dispatch // We don't mind this function not returning a PPromise
const authenticate = async () => ({
  status: 'ok',
  access: { ident: { id: 'userFromIntegreat' } },
})

function createQueues(queue: Queue) {
  const queues = new Map<string, ActiveQueue>()
  const greatQueue = { queue, listeners: new Map() }
  queues.set('great', greatQueue)
  return queues
}

// Tests

test('should listen to queue and dispatch action, authenticating with Integreat', async (t) => {
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const processStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const connection = { status: 'ok', queue, queueId: 'great' }
  const queues = createQueues(queue)
  const authenticate = sinon
    .stub()
    .resolves({ status: 'ok', access: { ident: { id: 'userFromIntegreat' } } })
  const expected = { status: 'ok' }
  const expectedAction = { ...action, meta: metaWithIdent }
  const expectedAuthentication = { status: 'granted' }
  const expectedQueueResponse = { status: 'ok', data: [] }

  const listenResponse = await listen(queues)(
    dispatch,
    connection,
    authenticate,
  )
  const processFn = processStub.args[0][2] // Get the internal job handler
  const processResponse = await processFn({ data: action, id: 'job1' }) // Call internal handler to make sure it calls dispatch

  t.deepEqual(listenResponse, expected)
  t.is(authenticate.callCount, 1)
  t.deepEqual(authenticate.args[0][0], expectedAuthentication)
  t.deepEqual(authenticate.args[0][1], action)
  t.is(dispatch.callCount, 1)
  t.deepEqual(dispatch.args[0][0], expectedAction)
  t.is(processStub.args[0][0], '*')
  t.is(processStub.args[0][1], 1) // Default max concurrency
  t.deepEqual(processResponse, expectedQueueResponse)
})

test('should listen to subQueueId', async (t) => {
  const processStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const queues = createQueues(queue)
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
  const authenticate1 = sinon
    .stub()
    .resolves({ status: 'ok', access: { ident: { id: 'user1FromIntegreat' } } })
  const authenticate2 = sinon
    .stub()
    .resolves({ status: 'ok', access: { ident: { id: 'user2FromIntegreat' } } })
  const expected = { status: 'ok' }
  const expectedAction2 = {
    ...action,
    meta: { ident: { id: 'user2FromIntegreat' } },
  }
  const expectedAuthentication = { status: 'granted' }
  const expectedQueueResponse = { status: 'ok', data: [] }

  const listenResponse1 = await listen(queues)(
    dispatch1,
    connection1,
    authenticate1,
  )
  const listenResponse2 = await listen(queues)(
    dispatch2,
    connection2,
    authenticate2,
  )

  const processFn = processStub.args[0][2] // Get the internal job handler
  const processResponse = await processFn({
    data: action,
    id: 'job1',
    name: 'ns2',
  }) // Call internal handler to make sure it calls ns2 dispatch

  t.is(processStub.callCount, 1)
  t.is(processStub.args[0][0], '*') // Catch-all queue
  t.is(processStub.args[0][1], 1) // Default max concurrency
  t.is(authenticate1.callCount, 0)
  t.is(authenticate2.callCount, 1)
  t.deepEqual(authenticate2.args[0][0], expectedAuthentication)
  t.deepEqual(authenticate2.args[0][1], action)
  t.is(dispatch1.callCount, 0)
  t.is(dispatch2.callCount, 1)
  t.deepEqual(dispatch2.args[0][0], expectedAction2)
  t.deepEqual(processResponse, expectedQueueResponse)
  t.deepEqual(listenResponse1, expected)
  t.deepEqual(listenResponse2, expected)
})

// TODO: Fix this test when we have implemented `stopListening()`
test.skip('should not register handler twice', async (t) => {
  const processStub = sinon.stub()
  const queue = {
    process: processStub,
    close: async () => undefined,
  } as unknown as Queue
  const connection = { status: 'ok', queue, queueId: 'great' }
  const expected = { status: 'ok' }
  const queues = createQueues(queue)

  await listen(queues)(dispatch, connection, authenticate)
  // await stopListening(queues)(connection)
  const listenResponse = await listen(queues)(
    dispatch,
    connection,
    authenticate,
  )

  t.is(processStub.callCount, 1)
  t.deepEqual(listenResponse, expected)
})

test('should wrap non-action jobs in a REQUEST action and unwrap response', async (t) => {
  const dispatch = sinon
    .stub()
    .resolves({ status: 'ok', data: { ok: true, context: {} } })
  const processStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const queues = createQueues(queue)
  const connection = { status: 'ok', queue, queueId: 'great' }
  const job = { id: 'someJob' }
  const expectedAction = {
    type: 'REQUEST',
    payload: { data: job },
    meta: metaWithIdent,
  }
  const expectedQueueResponse = { ok: true, context: {} }

  const listenResponse = await listen(queues)(
    dispatch,
    connection,
    authenticate,
  )
  const processFn = processStub.args[0][2] // Get the internal job handler
  const processResponse = await processFn({ data: job, id: 'job2' }) // Call internal handler to make sure it calls dispatch

  t.deepEqual(listenResponse.status, 'ok')
  t.is(dispatch.callCount, 1)
  t.deepEqual(dispatch.args[0][0], expectedAction)
  t.deepEqual(processResponse, expectedQueueResponse)
})

test('should not touch action id', async (t) => {
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const actionWithId = {
    ...action,
    meta: { ...metaWithIdent, id: 'action1' },
  }
  const processStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const queues = createQueues(queue)
  const connection = { status: 'ok', queue, queueId: 'great' }
  const expectedAction = actionWithId

  const ret = await listen(queues)(dispatch, connection, authenticate)
  const processFn = processStub.args[0][2] // Get the internal job handler
  await processFn({ data: actionWithId, id: 'job1' }) // Call internal handler to make sure it calls dispatch

  t.deepEqual(ret.status, 'ok', ret.error)
  t.deepEqual(dispatch.args[0][0], expectedAction)
})

test('should not set action id when missing', async (t) => {
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const processStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const queues = createQueues(queue)
  const connection = { status: 'ok', queue, queueId: 'great' }
  const expectedAction = { ...action, meta: metaWithIdent }

  const ret = await listen(queues)(dispatch, connection, authenticate)
  const processFn = processStub.args[0][2] // Get the internal job handler
  await processFn({ data: action, id: 'job1' }) // Call internal handler to make sure it calls dispatch

  t.deepEqual(ret.status, 'ok', ret.error)
  t.deepEqual(dispatch.args[0][0], expectedAction)
})

test('should update job progress when handler function support it', async (t) => {
  const dispatch = sinon.stub().callsFake(() => {
    const p = new Promise((resolve) => {
      setTimeout(() => {
        resolve({ status: 'ok', data: [] })
      }, 500)
    })
    return Object.assign(p, { onProgress: onProgressStub })
  })
  const progressStub = sinon.stub().resolves(undefined)
  const processStub = sinon.stub()
  const onProgressStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const queues = createQueues(queue)
  const connection = { status: 'ok', queue, queueId: 'great' }
  const expected = { status: 'ok' }
  const expectedAction = { ...action, meta: metaWithIdent }
  const expectedQueueResponse = { status: 'ok', data: [] }
  const bullJob = { data: action, id: 'job1', progress: progressStub }

  const listenResponse = await listen(queues)(
    dispatch,
    connection,
    authenticate,
  )
  const processFn = processStub.args[0][2] // Get the internal job handler
  const processResponse = await processFn(bullJob) // Call internal handler to make sure it calls dispatch
  t.is(onProgressStub.callCount, 1)
  const progressFn = onProgressStub.args[0][0]
  progressFn(0.502)

  t.is(progressStub.callCount, 1)
  t.is(progressStub.args[0][0], 50)
  t.deepEqual(listenResponse, expected)
  t.is(dispatch.callCount, 1)
  t.deepEqual(dispatch.args[0][0], expectedAction)
  t.deepEqual(processStub.args[0][0], '*')
  t.deepEqual(processStub.args[0][1], 1) // Default max concurrency
  t.deepEqual(processResponse, expectedQueueResponse)
})

test('should reject when action response is error', async (t) => {
  const dispatch = sinon
    .stub()
    .resolves({ status: 'notfound', error: 'Where?' })
  const processStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const queues = createQueues(queue)
  const connection = { status: 'ok', queue, queueId: 'great' }
  const expected = { status: 'ok' }

  const ret = await listen(queues)(dispatch, connection, authenticate)
  const processFn = processStub.args[0][2] // Get the internal job handler
  const err = await t.throwsAsync(processFn({ data: action })) // Call internal handler to make sure it calls dispatch

  t.is(err?.message, '[notfound] Where?')
  t.deepEqual(ret, expected)
})

test('should not reject when action response is noaction', async (t) => {
  const dispatch = sinon
    .stub()
    .resolves({ status: 'noaction', error: 'Nothing to do' })
  const processStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const queues = createQueues(queue)
  const connection = { status: 'ok', queue, queueId: 'great' }
  const expected = { status: 'ok' }

  const ret = await listen(queues)(dispatch, connection, authenticate)
  const processFn = processStub.args[0][2] // Get the internal job handler
  await t.notThrowsAsync(processFn({ data: action })) // Call internal handler to make sure it calls dispatch

  t.deepEqual(ret, expected)
})

test('should not reject when action response is queued', async (t) => {
  const dispatch = sinon.stub().resolves({ status: 'queued' })
  const processStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const queues = createQueues(queue)
  const connection = { status: 'ok', queue, queueId: 'great' }
  const expected = { status: 'ok' }

  const ret = await listen(queues)(dispatch, connection, authenticate)
  const processFn = processStub.args[0][2] // Get the internal job handler
  await t.notThrowsAsync(processFn({ data: action })) // Call internal handler to make sure it calls dispatch

  t.deepEqual(ret, expected)
})

test('should reject when response is not a valid response', async (t) => {
  const dispatch = sinon.stub().resolves(null)
  const processStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const queues = createQueues(queue)
  const connection = { status: 'ok', queue, queueId: 'great' }
  const expected = { status: 'ok' }

  const ret = await listen(queues)(dispatch, connection, authenticate)
  const processFn = processStub.args[0][2] // Get the internal job handler
  const err = await t.throwsAsync(processFn({ data: action })) // Call internal handler to make sure it calls dispatch

  t.is(err?.message, 'Queued action did not return a valid response')
  t.deepEqual(ret, expected)
})

test('should call process with max concurrency', async (t) => {
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const processStub = sinon.stub()
  const queue = {
    process: processStub,
    resume: sinon.stub().resolves(undefined),
  } as unknown as Queue
  const queues = createQueues(queue)
  const connection = {
    status: 'ok',
    queue,
    queueId: 'great',
    maxConcurrency: 5,
  }
  const expected = { status: 'ok' }

  const ret = await listen(queues)(dispatch, connection, authenticate)

  t.deepEqual(ret, expected)
  t.is(processStub.callCount, 1)
  t.deepEqual(processStub.args[0][0], '*')
  t.deepEqual(processStub.args[0][1], 5)
})

test('should return error when listening fails', async (t) => {
  const processStub = sinon.stub().throws(new Error('Will not listen'))
  const queue = { process: processStub } as unknown as Queue
  const queues = createQueues(queue)
  const connection = { status: 'ok', queue, queueId: 'great' }
  const expected = {
    status: 'error',
    error: "Cannot listen to queue 'great'. Will not listen",
  }

  const ret = await listen(queues)(dispatch, connection, authenticate)

  t.deepEqual(ret, expected)
})

test('should return error when no queue', async (t) => {
  const queues = createQueues({} as unknown as Queue)
  const connection = { status: 'ok', queue: undefined, queueId: 'great' }
  const expected = {
    status: 'error',
    error: 'Cannot listen to queue. No queue',
  }

  const ret = await listen(queues)(dispatch, connection, authenticate)

  t.deepEqual(ret, expected)
})

test('should return error when no connection', async (t) => {
  const queues = createQueues({} as unknown as Queue)
  const connection = null
  const expected = {
    status: 'error',
    error: 'Cannot listen to queue. No queue',
  }

  const ret = await listen(queues)(dispatch, connection, authenticate)

  t.deepEqual(ret, expected)
})

test('should throw when authenticating with Integreat fails', async (t) => {
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const processStub = sinon.stub()
  const queue = { process: processStub } as unknown as Queue
  const queues = createQueues(queue)
  const connection = { status: 'ok', queue, queueId: 'great' }
  const authenticate = sinon
    .stub()
    .resolves({ status: 'noaccess', error: 'We could not grant you this wish' })

  const listenResponse = await listen(queues)(
    dispatch,
    connection,
    authenticate,
  )
  const processFn = processStub.args[0][2] // Get the internal job handler
  const error = await t.throwsAsync(processFn({ data: action, id: 'job1' })) // Call internal handler to make sure it throws

  t.is(listenResponse.status, 'ok')
  t.is(authenticate.callCount, 1)
  t.is(dispatch.callCount, 0)
  t.true(error instanceof Error)
  t.is(
    error?.message,
    "Could not get authenticated ident from Integreat on queue 'great'. [noaccess] We could not grant you this wish",
  )
})

test('should return badrequest when queue object is not set up', async (t) => {
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const queue = { process: () => {} } as unknown as Queue
  const connection = { status: 'ok', queue, queueId: 'great' }
  const queues = new Map() // Set up with no queues
  const authenticate = sinon
    .stub()
    .resolves({ status: 'ok', access: { ident: { id: 'userFromIntegreat' } } })
  const expected = {
    status: 'error',
    error:
      "Cannot listen to queue 'great'. Please connect to the queue before listening",
  }

  const listenResponse = await listen(queues)(
    dispatch,
    connection,
    authenticate,
  )

  t.deepEqual(listenResponse, expected)
  t.is(authenticate.callCount, 0)
  t.is(dispatch.callCount, 0)
})
