import { useEffect, useRef, useState } from 'react'

export function useSpeechRecognition({ onFinal, onInterim, lang = 'vi-VN' } = {}) {
  const recRef = useRef(null)
  const finalTextRef = useRef('')
  const startedRef = useRef(false)
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setSupported(false); return }
    const r = new SR()
    r.lang = lang
    r.continuous = true
    r.interimResults = true
    r.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript.trim()
        if (!t) continue
        if (e.results[i].isFinal) {
          // Insert "|" between separate final results — signals a user pause,
          // which we use to separate code from amount within one order.
          if (finalTextRef.current) finalTextRef.current += ' | '
          finalTextRef.current += t
        } else {
          interim += t + ' '
        }
      }
      const display = finalTextRef.current + (interim.trim() ? ' ' + interim.trim() : '')
      if (onInterim) onInterim(display)
    }
    r.onend = () => {
      startedRef.current = false
      if (finalTextRef.current.trim() && onFinal) onFinal(finalTextRef.current.trim())
    }
    r.onerror = () => { startedRef.current = false }
    recRef.current = r
    return () => { try { r.stop() } catch {} }
    // eslint-disable-next-line
  }, [lang])

  const start = () => {
    if (!recRef.current || startedRef.current) return
    finalTextRef.current = ''
    try { recRef.current.start(); startedRef.current = true } catch {}
  }
  const stop = () => {
    if (!recRef.current || !startedRef.current) return
    try { recRef.current.stop() } catch {}
  }

  return { supported, start, stop }
}