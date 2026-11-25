import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HoverCard } from '@/features/calendar/events'
import { placeNear } from './placeNear'

describe('an anchor that has left the page', () => {
  it('leaves a popover where it is, instead of moving it to the corner', () => {
    const panel = document.createElement('div')
    panel.style.left = '200px'
    panel.style.top = '300px'
    const gone = document.createElement('button')
    placeNear(panel, gone)
    expect(panel.style.left).toBe('200px')
    expect(panel.style.top).toBe('300px')
  })

  it('gets no hover card', () => {
    render(<HoverCard anchor={document.createElement('button')}>Details</HoverCard>)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
