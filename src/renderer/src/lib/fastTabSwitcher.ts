import { createStore } from './store'

const switcherStore = createStore({ open: false, openId: 0, cycleId: 0 }, 'fast-tab-switcher')

export function openFastTabSwitcher(): void {
  const current = switcherStore.get()
  if (current.open) {
    switcherStore.set({ cycleId: current.cycleId + 1 })
    return
  }
  switcherStore.set({ open: true, openId: current.openId + 1, cycleId: 0 })
}

export function commitFastTabSwitcher(): void {
  switcherStore.set({ open: false })
}

export function closeFastTabSwitcher(): void {
  switcherStore.set({ open: false })
}

export { switcherStore }
