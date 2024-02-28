import ava, { TestFn } from 'ava'
import sinon from 'sinon'
import Bull from 'bull'

import transporter from '../index.js'

interface AvaContext {
  queue: Bull.Queue
}

// Setup

const test = ava as TestFn<AvaContext>

const bullOptions = {
  redis: { host: 'localhost', port: 6379 },
  enableReadyCheck: false,
}
const redisUrl = 'redis://localhost:6379'

const action = {
  type: 'SET',
  payload: { type: 'entry', data: { id: 'ent1', title: 'Entry 1' } },
  meta: {},
}

const metaWithIdent = { ident: { id: 'userFromIntegreat' } }
const authenticate = async () => ({ status: 'ok', access: metaWithIdent })
const emit = () => undefined

test.before(async (t) => {
  const queue = new Bull('testQueue1', bullOptions)
  t.context = { queue }
})

test.after.always(async (t) => {
  await t.context.queue.empty()
  await t.context.queue.close()
})

// Tests

test.serial(
  'shoulden listen to queue and dispatch action to Integreat',
  async (t) => {
    const queue = t.context.queue
    const options = { queueId: 'testQueue1', redis: redisUrl }
    const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
    const expectedAction = { ...action, meta: metaWithIdent }

    const preparedOptions = transporter.prepareOptions(options, 'queue')
    const connection = await transporter.connect(
      preparedOptions,
      null,
      null,
      emit,
    )
    const ret = await transporter.listen!(
      dispatch,
      connection,
      authenticate,
      emit,
    )
    await queue.add(action)
    await new Promise((resolve) => setTimeout(resolve, 500, undefined))
    await transporter.disconnect(connection)

    t.is(ret.status, 'ok', ret.error)
    t.is(dispatch.callCount, 1)
    t.deepEqual(dispatch.args[0][0], expectedAction)
  },
)

test.serial(
  'shoulden listen to sub queues and dispatch action to Integreat',
  async (t) => {
    const queue = t.context.queue
    const options = {
      queueId: 'testQueue1',
      subQueueId: 'sub1',
      redis: redisUrl,
    }
    const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
    const expectedAction = { ...action, meta: metaWithIdent }

    const preparedOptions = transporter.prepareOptions(options, 'queue')
    const connection = await transporter.connect(
      preparedOptions,
      null,
      null,
      emit,
    )
    const ret = await transporter.listen!(
      dispatch,
      connection,
      authenticate,
      emit,
    )
    await queue.add('sub1', action)
    await new Promise((resolve) => setTimeout(resolve, 500, undefined))
    await transporter.disconnect(connection)

    t.is(ret.status, 'ok', ret.error)
    t.is(dispatch.callCount, 1)
    t.deepEqual(dispatch.args[0][0], expectedAction)
  },
)

test.serial('shoulden not dispatch after we stop listening', async (t) => {
  const queue = t.context.queue
  const options = {
    queueId: 'testQueue1',
    subQueueId: 'sub2',
    redis: redisUrl,
  }
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })

  const preparedOptions = transporter.prepareOptions(options, 'queue')
  const connection = await transporter.connect(
    preparedOptions,
    null,
    null,
    emit,
  )
  const ret = await transporter.listen!(
    dispatch,
    connection,
    authenticate,
    emit,
  )
  await transporter.stopListening!(connection)
  await queue.add('sub2', action)
  await new Promise((resolve) => setTimeout(resolve, 500, undefined))
  await transporter.disconnect(connection)

  t.is(ret.status, 'ok', ret.error)
  t.is(dispatch.callCount, 0)
})
