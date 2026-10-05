import { useEffect, useRef, useState } from 'react'

export function useMic() {
  const [status, setStatus] = useState('checking') // checking | ok | error
  const [error, setError] = useState('')
  const [level, setLevel] = useState(0)
  const streamRef = useRef(null)
  const ctxRef = useRef(null)
  const rafRef = useRef(null)

  const cleanup = () => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    ctxRef.current?.close().catch(() => {})
    streamRef.current = null
    ctxRef.current = null
  }

  const init = async () => {
    cleanup()
    setStatus('checking')
    setError('')
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Trình duyệt không hỗ trợ mic API. Dùng Chrome.')
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      ctxRef.current = ctx
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      src.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)

      const tick = () => {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        setLevel(Math.sqrt(sum / data.length))
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
      setStatus('ok')
    } catch (e) {
      setStatus('error')
      setError(e.message || 'Không truy cập được mic')
    }
  }

  useEffect(() => {
    init()
    return cleanup
    // eslint-disable-next-line
  }, [])

  return { status, error, level, stream: streamRef.current, refresh: init }
}
