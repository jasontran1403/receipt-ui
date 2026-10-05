import { useRef, useState } from 'react'
import VolumeMeter from './VolumeMeter.jsx'

export default function MicPanel({ mic }) {
  const { level, stream, refresh } = mic
  const [recorder, setRecorder] = useState(null)
  const [recording, setRecording] = useState(false)
  const [blobUrl, setBlobUrl] = useState(null)
  const chunksRef = useRef([])

  const startTest = () => {
    if (!stream) return
    chunksRef.current = []
    const mr = new MediaRecorder(stream)
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = () => setBlobUrl(URL.createObjectURL(new Blob(chunksRef.current, { type: 'audio/webm' })))
    mr.start()
    setRecorder(mr)
    setRecording(true)
  }
  const stopTest = () => { recorder?.stop(); setRecording(false) }

  return (
    <div className="bg-white border rounded-lg p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-medium">Micro đã kết nối</span>
        </div>
        <button onClick={refresh} className="text-xs text-slate-500 hover:text-slate-800">⟳</button>
      </div>
      <VolumeMeter level={level} />
      <div className="flex items-center gap-2 mt-2">
        {!recording ? (
          <button onClick={startTest} className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
            ● Test
          </button>
        ) : (
          <button onClick={stopTest} className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">
            ■ Stop
          </button>
        )}
        {blobUrl && <audio controls src={blobUrl} className="h-7 flex-1 min-w-0" />}
      </div>
    </div>
  )
}
