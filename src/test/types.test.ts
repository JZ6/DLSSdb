import { describe, it, expect } from 'vitest'
import { getFrameGenLevel, getFrameGenLabel, getHltbHours } from '../types'
import type { DlssGame, HltbInfo } from '../types'

const makeGame = (overrides: Partial<DlssGame> = {}): DlssGame => ({
  sno: 1,
  name: 'Test Game',
  type: 'Game',
  'dlss multi frame generation': '',
  'dlss frame generation': '',
  'dlss super resolution': '',
  'dlss ray reconstruction': '',
  dlaa: '',
  'ray tracing': '',
  ai: '',
  ...overrides,
})

describe('getFrameGenLevel', () => {
  it('returns 3 for NV, 6X', () => {
    expect(getFrameGenLevel(makeGame({ 'dlss multi frame generation': 'NV, 6X' }))).toBe(3)
  })

  it('returns 2 for NV, 4X', () => {
    expect(getFrameGenLevel(makeGame({ 'dlss multi frame generation': 'NV, 4X' }))).toBe(2)
  })

  it('returns 1 for any frame gen value with no MFG', () => {
    expect(getFrameGenLevel(makeGame({ 'dlss frame generation': 'Yes' }))).toBe(1)
    expect(getFrameGenLevel(makeGame({ 'dlss frame generation': 'NV, U' }))).toBe(1)
  })

  it('returns 0 when no frame gen at all', () => {
    expect(getFrameGenLevel(makeGame())).toBe(0)
  })

  it('prioritises MFG over legacy FG', () => {
    expect(getFrameGenLevel(makeGame({
      'dlss multi frame generation': 'NV, 6X',
      'dlss frame generation': 'Yes',
    }))).toBe(3)
  })
})

describe('getFrameGenLabel', () => {
  it('returns correct labels', () => {
    expect(getFrameGenLabel(makeGame({ 'dlss multi frame generation': 'NV, 6X' }))).toBe('6X')
    expect(getFrameGenLabel(makeGame({ 'dlss multi frame generation': 'NV, 4X' }))).toBe('4X')
    expect(getFrameGenLabel(makeGame({ 'dlss frame generation': 'Yes' }))).toBe('2X')
    expect(getFrameGenLabel(makeGame())).toBe('')
  })
})

describe('getHltbHours', () => {
  it('returns undefined for missing data', () => {
    expect(getHltbHours(undefined)).toBeUndefined()
  })

  it('averages all available values', () => {
    const h: HltbInfo = { main: 10, extra: 20, complete: 30 }
    expect(getHltbHours(h)).toBeCloseTo(20)
  })

  it('averages two values if one missing', () => {
    const h: HltbInfo = { extra: 20, complete: 30 }
    expect(getHltbHours(h)).toBeCloseTo(25)
  })

  it('returns single value if only one present', () => {
    const h: HltbInfo = { complete: 30 }
    expect(getHltbHours(h)).toBe(30)
  })

  it('returns undefined for fully empty object', () => {
    expect(getHltbHours({})).toBeUndefined()
  })
})
