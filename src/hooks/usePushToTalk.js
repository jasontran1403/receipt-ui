import { useEffect, useRef, useState } from 'react'

/**
 * Bind Space key to a start/stop pair.
 * Ignores when focus is in an input/textarea/contenteditable.
 * enabled=false disables entirely (e.g. when a modal is open).
 */
export function usePushToTalk({ enabled, onStart, onStop }) {
  const [holding, setHolding] = useState(false)
  const holdingRef = useRef(false)

  useEffect(() => {
    if (!enabled) return

    const isTyping = () => {
      const el = document.activeElement
      if (!el) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
    }

    const down = (e) => {
      if (e.code !== 'Space' || e.repeat || isTyping()) return
      e.preventDefault()
      if (holdingRef.current) return
      holdingRef.current = true
      setHolding(true)
      onStart?.()
    }
    const up = (e) => {
      if (e.code !== 'Space' || isTyping()) return
      e.preventDefault()
      if (!holdingRef.current) return
      holdingRef.current = false
      setHolding(false)
      onStop?.()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [enabled, onStart, onStop])

  return { holding }
}
