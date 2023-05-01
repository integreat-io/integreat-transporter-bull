import test from 'ava'
import sinon from 'sinon'
import type { Connection } from './types.js'

import disconnect from './disconnect.js'

// Tests

test('should disconnect', async (t) => {
  const closeStub = sinon.stub().resolves(undefined)
  const queue = {
    close: closeStub,
  }
  const conn = { status: 'ok', queue, namespace: 'ns1' }

  await disconnect(conn as unknown as Connection)

  t.is(closeStub.callCount, 1)
})

test('should do nothing when connection has no queue', async (t) => {
  const conn = { status: 'ok', queue: undefined, namespace: 'ns1' }

  await t.notThrowsAsync(disconnect(conn))
})

test('should do nothing when no connection', async (t) => {
  const conn = null

  await t.notThrowsAsync(disconnect(conn))
})
