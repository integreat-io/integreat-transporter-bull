import { Action } from '../types'

export const isObject = (value: unknown): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === '[object Object]'

export const isAction = (value: unknown): value is Action =>
  isObject(value) && typeof value.type === 'string' && isObject(value.payload)
