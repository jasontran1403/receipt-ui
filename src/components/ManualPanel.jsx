export default function ManualPanel({ onSwitchMode }) {
  return (
    <div className="bg-white border rounded-lg p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-xs font-medium">Chế độ nhập thủ công</span>
        </div>
        <button
          onClick={onSwitchMode}
          className="text-xs text-slate-500 hover:text-slate-800 underline"
          type="button"
        >
          Đổi chế độ
        </button>
      </div>
      <div className="mt-2 text-xs text-slate-500">
        Gõ giá trị, nhấn <kbd className="px-1 bg-slate-100 border rounded">Ctrl</kbd>{' '}
        (hoặc <kbd className="px-1 bg-slate-100 border rounded">Enter</kbd>) để qua ô kế tiếp.
      </div>
    </div>
  )
}
