import test from 'node:test'
import assert from 'node:assert/strict'
import sinon from 'sinon'
import type { Connection } from './types.js'

import disconnect from './disconnect.js'

// Tests

test('should disconnect', async () => {
  const closeStub = sinon.stub().resolves(undefined)
  const queue = {
    close: closeStub,
  }
  const conn = { status: 'ok', queue, queueId: 'ns1' }

  await disconnect(conn as unknown as Connection)

  assert.equal(closeStub.callCount, 1)
})

test('should do nothing when connection has no queue', async () => {
  const conn = { status: 'ok', queue: undefined, queueId: 'ns1' }

  await assert.doesNotReject(disconnect(conn))
})

test('should do nothing when no connection', async () => {
  const conn = null

  await assert.doesNotReject(disconnect(conn))
})
