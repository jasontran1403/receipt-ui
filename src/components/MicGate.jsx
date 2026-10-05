export default function MicGate({ mic, children }) {
  const { status, error, refresh } = mic

  if (status === 'checking') {
    return <div className="p-6 text-center text-slate-500">Đang kiểm tra micro...</div>
  }

  if (status === 'error') {
    return (
      <div className="max-w-lg mx-auto mt-16 p-6 bg-red-50 border border-red-300 rounded-lg">
        <h2 className="text-lg font-semibold text-red-800 mb-2">Không tìm thấy micro</h2>
        <p className="text-red-700 mb-3">{error || 'Vui lòng cắm tai nghe hoặc cấp quyền truy cập mic.'}</p>
        <button onClick={refresh} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
          Refresh
        </button>
      </div>
    )
  }

  return children
}
