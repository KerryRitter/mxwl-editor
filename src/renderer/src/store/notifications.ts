import { create } from 'zustand'
import type { AgentNotificationRecord } from '../../../shared/types'

export type AgentNotification = AgentNotificationRecord

type Delivery = { id: string; popup: boolean; sound: boolean }

type NotificationState = {
  items: AgentNotification[]
  lastDelivery: Delivery | null
  init: () => () => void
  markRead: (id: string) => void
  markAllRead: () => void
  clear: () => void
}

export const useNotificationsStore = create<NotificationState>((set) => ({
  items: [],
  lastDelivery: null,

  init: () => {
    let cancelled = false
    void window.api.attention.list().then((items) => {
      if (!cancelled) set({ items })
    })
    const offEvent = window.api.on('attention:event', (...args: unknown[]) => {
      const payload = args[0] as {
        record: AgentNotification
        popup: boolean
        sound: boolean
      }
      if (!payload?.record) return
      set((state) => ({
        items: [payload.record, ...state.items.filter((item) => item.id !== payload.record.id)],
        lastDelivery: {
          id: payload.record.id,
          popup: payload.popup,
          sound: payload.sound
        }
      }))
    })
    const offSync = window.api.on('attention:sync', (...args: unknown[]) => {
      const items = args[0] as AgentNotification[]
      if (Array.isArray(items)) set({ items })
    })
    return () => {
      cancelled = true
      offEvent()
      offSync()
    }
  },

  markRead: (id) => {
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, read: true } : item))
    }))
    void window.api.attention.markRead(id)
  },

  markAllRead: () => {
    set((state) => ({ items: state.items.map((item) => ({ ...item, read: true })) }))
    void window.api.attention.markAllRead()
  },

  clear: () => {
    set({ items: [], lastDelivery: null })
    void window.api.attention.clear()
  }
}))
