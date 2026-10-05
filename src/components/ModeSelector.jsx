export default function ModeSelector({ onPick }) {
  return (
    <div className="h-dvh flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-2xl w-full">
        <h1 className="text-2xl font-semibold text-center mb-2">Receipt Entry</h1>
        <p className="text-center text-slate-500 mb-8 text-sm">
          Chọn chế độ nhập liệu
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => onPick('voice')}
            className="group p-6 bg-white border-2 border-slate-200 rounded-xl
                       hover:border-blue-500 hover:shadow-lg transition-all text-left"
            type="button"
          >
            <div className="text-4xl mb-3">🎙️</div>
            <div className="text-lg font-semibold mb-1 group-hover:text-blue-700">
              Voice
            </div>
            <div className="text-sm text-slate-500">
              Nhập bằng giọng nói. Giữ <kbd className="px-1 bg-slate-100 border rounded text-xs">Space</kbd> để nói.
              Cần micro + Chrome.
            </div>
          </button>

          <button
            onClick={() => onPick('manual')}
            className="group p-6 bg-white border-2 border-slate-200 rounded-xl
                       hover:border-green-500 hover:shadow-lg transition-all text-left"
            type="button"
          >
            <div className="text-4xl mb-3">⌨️</div>
            <div className="text-lg font-semibold mb-1 group-hover:text-green-700">
              Nhập thủ công
            </div>
            <div className="text-sm text-slate-500">
              Gõ bằng bàn phím. Nhấn <kbd className="px-1 bg-slate-100 border rounded text-xs">Ctrl</kbd> để qua ô kế tiếp.
              Không cần micro.
            </div>
          </button>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Có thể đổi chế độ bất cứ lúc nào ở góc trên bên trái.
        </p>
      </div>
    </div>
  )
}