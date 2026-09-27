import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SymbolCell } from '../cells'

vi.mock('../featureFlags', () => ({ INSTRUMENT_DRAWER_ENABLED: false }))

describe('SymbolCell with the drill-down drawer switched off', () => {
  it('renders the symbol as plain text, and clicking it does nothing', async () => {
    const onSelect = vi.fn()
    render(<SymbolCell symbol="RELIANCE26OCTFUT" onSelect={onSelect} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByText('RELIANCE26OCTFUT'))
    expect(onSelect).not.toHaveBeenCalled()
  })
})
