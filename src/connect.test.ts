import test from 'ava'
import sinon from 'sinon'
import Bull from 'bull'
import type { Connection } from './types.js'

import connect, { prepareRedisOptions } from './connect.js'

interface QueueWithInternals extends Bull.Queue {
  keyPrefix: string
  settings: {
    lockDuration: number
  }
}

// Setup

const emit = () => undefined

const wait = (ms: number) =>
  new Promise((resolve, _reject) => {
    setInterval(resolve, ms)
  })

// Tests

test('should connect to bull queue with redis url and default prefix', async (t) => {
  const options = {
    queueId: 'ns1',
    redis: 'redis://redis1.test:6380',
  }

  const conn = await connect(options, null, null, emit)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.is(conn?.queueId, 'ns1')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'ns1')
  t.is((conn?.queue as QueueWithInternals).keyPrefix, 'bull')
  t.is(conn?.queue?.client.options.host, 'redis1.test')
  t.is(conn?.queue?.client.options.port, 6380)
})

test('should reuse queue for same queueId', async (t) => {
  const options = {
    queueId: 'ns2',
    redis: 'redis://redis2.test:6380',
  }

  const conn1 = await connect(options, null, null, emit)
  const conn2 = await connect(options, null, null, emit)

  t.truthy(conn1?.queue)
  t.is(conn1?.queue, conn2?.queue)
})

test('should connect to bull queue with subQueueId', async (t) => {
  const options = {
    queueId: 'ns3',
    subQueueId: 'sub1',
    redis: 'redis://redis3.test:6380',
  }

  const conn = await connect(options, null, null, emit)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.is(conn?.queueId, 'ns3')
  t.is(conn?.subQueueId, 'sub1')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'ns3')
  t.is((conn?.queue as QueueWithInternals).keyPrefix, 'bull')
  t.is(conn?.queue?.client.options.host, 'redis3.test')
  t.is(conn?.queue?.client.options.port, 6380)
})

test('should connect to bull queue with specified prefix', async (t) => {
  const options = {
    queueId: 'ns4',
    redis: 'redis://redis4.test:6380',
    keyPrefix: 'something',
  }

  const conn = await connect(options, null, null, emit)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.is(conn?.queueId, 'ns4')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'ns4')
  t.is((conn?.queue as QueueWithInternals).keyPrefix, 'something')
  t.is(conn?.queue?.client.options.host, 'redis4.test')
  t.is(conn?.queue?.client.options.port, 6380)
})

test('should connect to bull queue with redis options', async (t) => {
  const options = {
    queueId: 'ns5',
    redis: { host: 'redis5.test', port: 6382 },
  }

  const conn = await connect(options, null, null, emit)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'ns5')
  t.is(conn?.queue?.client.options.host, 'redis5.test')
  t.is(conn?.queue?.client.options.port, 6382)
})

test('should connect to bull queue without options', async (t) => {
  const options = { queueId: 'ns6' }

  const conn = await connect(options, null, null, emit)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'ns6')
  t.is(conn?.queue?.client.options.host, '127.0.0.1')
  t.is(conn?.queue?.client.options.port, 6379)
})

test('should use provided bull queue as is', async (t) => {
  const queue = new Bull('ns7_b') // Different queueId than options
  const options = { queueId: 'ns7', queue }

  const conn = await connect(options, null, null, emit)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'ns7_b')
})

test('should use default queueId when none is provided', async (t) => {
  const options = {}

  const conn = await connect(options, null, null, emit)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.is(conn?.queueId, 'great')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'great')
})

test('should pass on some options to connection object', async (t) => {
  const options = {
    queueId: 'ns8',
    subQueueId: 'internal',
    maxConcurrency: 5,
  }

  const conn = await connect(options, null, null, emit)

  t.is(conn?.status, 'ok')
  t.is(conn?.queueId, 'ns8')
  t.is(conn?.subQueueId, 'internal')
  t.is(conn?.maxConcurrency, 5)
})

test('should pass on bull advanced settings object', async (t) => {
  const options = {
    queueId: 'ns9',
    redis: 'redis://localhost:6378',
    bullSettings: {
      lockDuration: 12345,
    },
  }
  const authentication = {
    status: 'granted',
    key: 'me',
    secret: 's3cr3t',
  }

  const conn = await connect(options, authentication, null, emit)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.truthy(conn?.queue)
  t.is((conn?.queue as QueueWithInternals).settings.lockDuration, 12345)
})

test('should pass on auth object', async (t) => {
  const options = {
    queueId: 'ns10',
    redis: 'redis://localhost:6378',
  }
  const authentication = {
    status: 'granted',
    key: 'me',
    secret: 's3cr3t',
  }

  const conn = await connect(options, authentication, null, emit)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.is(conn?.queueId, 'ns10')
  t.truthy(conn?.queue)
  t.is(conn?.queue?.name, 'ns10')
  t.is(conn?.queue?.client.options.username, 'me')
  t.is(conn?.queue?.client.options.password, 's3cr3t')
})

test('should reuse connection if still connected', async (t) => {
  const options1 = { queueId: 'ns11' }
  const options2 = { queueId: 'ns12' }

  const conn1 = await connect(options1, null, null, emit)
  const conn2 = await connect(options2, null, conn1, emit)

  t.true(typeof conn2 === 'object' && conn2 !== null)
  t.is(conn2?.status, 'ok')
  t.is(conn2?.queueId, 'ns11')
})

test('should create new connection when given one is closed', async (t) => {
  const options1 = { queueId: 'ns13' }
  const options2 = { queueId: 'ns14' }

  const conn1 = await connect(options1, null, null, emit)
  const conn1Closed = {
    ...conn1,
    queue: {
      ...conn1?.queue,
      client: { ...conn1?.queue?.client, status: 'end' },
    },
  } as Connection
  const conn2 = await connect(options2, null, conn1Closed, emit)

  t.true(typeof conn2 === 'object' && conn2 !== null)
  t.is(conn2?.status, 'ok')
  t.is(conn2?.queueId, 'ns14')
})

test('should create new connection if given one has an error', async (t) => {
  const options = { queueId: 'ns15' }
  const connection = { status: 'error', error: 'What happened?' }

  const conn = await connect(options, null, connection, emit)

  t.true(typeof conn === 'object' && conn !== null)
  t.is(conn?.status, 'ok')
  t.is(conn?.queueId, 'ns15')
})

test('should emit error from bull', async (t) => {
  const emit = sinon.stub()
  const options = {
    queueId: 'ns16',
    redis: 'http://unknown.test:9999',
  }

  await connect(options, null, null, emit)
  await wait(500)

  t.true(emit.callCount > 0)
  t.is(emit.args[1][0], 'error')
  const err = emit.args[1][1] as Error
  t.deepEqual(err.message, 'Bull error: getaddrinfo ENOTFOUND unknown.test')
})

// Tests -- redis options

test('should return redis options for an url string', (t) => {
  const options = 'redis://redis1.test:6380'
  const expected = {
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    uri: 'redis://redis1.test:6380',
  }

  const ret = prepareRedisOptions(options)

  t.deepEqual(ret, expected)
})

test('should return redis options from an object with uri', (t) => {
  const options = { uri: 'redis://redis1.test:6380' }
  const expected = {
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    uri: 'redis://redis1.test:6380',
  }

  const ret = prepareRedisOptions(options)

  t.deepEqual(ret, expected)
})

test('should return redis options from individual params', (t) => {
  const options = {
    host: 'redis1.test',
    port: 6380,
    tls: false,
    auth: { key: 'johnf', secret: 's3cr3t' },
  }
  const expected = {
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    host: 'redis1.test',
    port: 6380,
    username: 'johnf',
    password: 's3cr3t',
  }

  const ret = prepareRedisOptions(options)

  t.deepEqual(ret, expected)
})

test('should return redis options from individual params with tls', (t) => {
  const options = {
    host: 'redis1.test',
    port: 6380,
    tls: true,
    auth: { key: 'johnf', secret: 's3cr3t' },
  }
  const expected = {
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    host: 'redis1.test',
    port: 6380,
    username: 'johnf',
    password: 's3cr3t',
    tls: { host: 'redis1.test', port: 6380 },
  }

  const ret = prepareRedisOptions(options)

  t.deepEqual(ret, expected)
})

test('should return redis options with auth', (t) => {
  const options = 'redis://redis1.test:6380'
  const auth = { key: 'reidun', secret: 'passord1' }
  const expected = {
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    uri: 'redis://redis1.test:6380',
    username: 'reidun',
    password: 'passord1',
  }

  const ret = prepareRedisOptions(options, auth)

  t.deepEqual(ret, expected)
})

test('should return redis options with auth overriding the options key and secret', (t) => {
  const options = {
    host: 'redis1.test',
    port: 6380,
    tls: false,
    auth: { key: 'johnf', secret: 's3cr3t' },
  }
  const auth = { key: 'reidun', secret: 'passord1' }
  const expected = {
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    host: 'redis1.test',
    port: 6380,
    username: 'reidun',
    password: 'passord1',
  }

  const ret = prepareRedisOptions(options, auth)

  t.deepEqual(ret, expected)
})
