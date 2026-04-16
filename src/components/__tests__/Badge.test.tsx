import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FrameGenBadge, FeatureBadge, SteamBadge, HltbBadge } from '../Badge'
import type { DlssGame } from '../../types'

const makeGame = (overrides: Partial<DlssGame> = {}): DlssGame => ({
  sno: 1, name: 'Test', type: 'Game',
  'dlss multi frame generation': '', 'dlss frame generation': '',
  'dlss super resolution': '', 'dlss ray reconstruction': '',
  dlaa: '', 'ray tracing': '', ai: '',
  ...overrides,
})

describe('FrameGenBadge', () => {
  it('shows 6X badge for MFG 6X', () => {
    render(<FrameGenBadge game={makeGame({ 'dlss multi frame generation': 'NV, 6X' })} />)
    expect(screen.getByText('6X')).toBeInTheDocument()
  })

  it('shows 4X badge for MFG 4X', () => {
    render(<FrameGenBadge game={makeGame({ 'dlss multi frame generation': 'NV, 4X' })} />)
    expect(screen.getByText('4X')).toBeInTheDocument()
  })

  it('shows 2X badge for legacy FG', () => {
    render(<FrameGenBadge game={makeGame({ 'dlss frame generation': 'Yes' })} />)
    expect(screen.getByText('2X')).toBeInTheDocument()
  })

  it('shows dash when no frame gen', () => {
    render(<FrameGenBadge game={makeGame()} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('FeatureBadge', () => {
  it('shows NV-T for transformer model', () => {
    render(<FeatureBadge value="NV, T" />)
    expect(screen.getByText('NV-T')).toBeInTheDocument()
  })

  it('shows checkmark for Yes', () => {
    render(<FeatureBadge value="Yes" />)
    expect(screen.getByText('✓')).toBeInTheDocument()
  })

  it('shows dash for empty', () => {
    render(<FeatureBadge value="" />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('SteamBadge', () => {
  it('shows rating and percentage', () => {
    render(<SteamBadge info={{ rating: 'Very Positive', pct: 89 }} />)
    expect(screen.getByText('Very Positive')).toBeInTheDocument()
    expect(screen.getByText('89%')).toBeInTheDocument()
  })

  it('shows dash when no data', () => {
    render(<SteamBadge info={undefined} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('HltbBadge', () => {
  it('shows rounded hours from main', () => {
    render(<HltbBadge data={{ main: 26.7, extra: 45.2, complete: 72 }} />)
    expect(screen.getByText('27h')).toBeInTheDocument()
  })

  it('rounds up to avoid 0h', () => {
    render(<HltbBadge data={{ main: 0.3 }} />)
    expect(screen.getByText('1h')).toBeInTheDocument()
  })

  it('falls back to extra when main missing', () => {
    render(<HltbBadge data={{ extra: 15.1 }} />)
    expect(screen.getByText('16h')).toBeInTheDocument()
  })

  it('shows tooltip with full breakdown', () => {
    const { container } = render(<HltbBadge data={{ main: 10, extra: 20, complete: 40 }} />)
    const cell = container.querySelector('.hltb-cell')
    expect(cell?.getAttribute('title')).toContain('Main Story: 10h')
    expect(cell?.getAttribute('title')).toContain('Main + Extras: 20h')
    expect(cell?.getAttribute('title')).toContain('Completionist: 40h')
  })

  it('shows dash for no data', () => {
    render(<HltbBadge data={undefined} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows dash for empty object', () => {
    render(<HltbBadge data={{}} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
