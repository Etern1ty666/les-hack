import { describe, expect, it } from 'vitest'
import { useAppStore } from '@/state/store'
import { isIntroStartKey } from '../introKeys'

describe('интро → ready', () => {
  it('Enter и Space запускают только в фазе intro', () => {
    expect(isIntroStartKey('intro', 'Enter')).toBe(true)
    expect(isIntroStartKey('intro', ' ')).toBe(true)
    expect(isIntroStartKey('intro', 'a')).toBe(false)
    expect(isIntroStartKey('loading', 'Enter')).toBe(false)
    expect(isIntroStartKey('ready', 'Enter')).toBe(false)
  })

  it('обработчик переводит стор в ready', () => {
    useAppStore.getState().setPhase('intro')
    if (isIntroStartKey(useAppStore.getState().phase, 'Enter')) useAppStore.getState().setPhase('ready')
    expect(useAppStore.getState().phase).toBe('ready')
  })
})
