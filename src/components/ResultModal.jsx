import { formatMoney } from '../utils/formatMoney.js'

const pad = (n) => String(n).padStart(2, '0')

export default function ResultModal({ fields, lookups, validation, onSave, onClose }) {
  if (!fields) return null

  const orders = (fields.orderCodes || []).map((o) => {
    const l = lookups[o.code] || { customerName: null, invoiceCode: 'N/A', found: false }
    return {
      code: o.code,
      voiceAmount: o.amount,
      customerName: l.customerName,
      invoiceCode: l.invoiceCode || 'N/A',
      found: l.found,
    }
  })

  const isDuplicate = validation?.status === 'duplicate'
  const isNotContinuous = validation?.status === 'not_continuous'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-lg shadow-xl flex flex-col overflow-hidden"
        style={{ width: '60dvw', height: '50dvh', minWidth: '520px', minHeight: '380px' }}
      >
        <div className="shrink-0 px-5 py-3 border-b flex items-center justify-between">
          <h2 className="text-base font-semibold">Kết quả tìm được</h2>
          <div className="text-xs text-slate-500">
            <kbd className="px-2 py-1 bg-slate-100 rounded border">Enter</kbd> lưu ·{' '}
            <kbd className="px-2 py-1 bg-slate-100 rounded border">Esc</kbd> hủy
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col p-5 gap-3 overflow-hidden">
          {/* Validation banner */}
          {isDuplicate && (
            <div className="shrink-0 p-3 rounded border-2 border-red-400 bg-red-50 text-red-800 text-sm">
              <div className="font-semibold">⛔ Phiếu thu trùng</div>
              <div className="mt-0.5 text-xs">{validation.message}</div>
              <div className="mt-1 text-xs italic">Không thể lưu. Nhấn Esc rồi click ô Số phiếu thu để nói lại.</div>
            </div>
          )}
          {isNotContinuous && (
            <div className="shrink-0 p-3 rounded border-2 border-amber-400 bg-amber-50 text-amber-900 text-sm">
              <div className="font-semibold">⚠️ Số phiếu thu không liên tục</div>
              <div className="mt-0.5 text-xs">{validation.message}</div>
              <div className="mt-1 text-xs italic">Enter vẫn lưu vào DB, nhưng sẽ không hiển thị trong bảng bên phải (cần reload để thấy).</div>
            </div>
          )}

          {/* Header info */}
          <div className="grid grid-cols-3 gap-4 text-sm shrink-0">
            <Field label="Phiếu thu" value={fields.receiptCode || '—'} strong />
            <Field label="Ngày" value={fields.date ? `${pad(fields.date.day)}/${pad(fields.date.month)}/${fields.date.year}` : '—'} />
            <Field label="Tổng tiền" value={fields.receiptAmount != null ? formatMoney(fields.receiptAmount) : '—'} strong />
          </div>

          {/* Orders */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="text-sm font-semibold mb-2 shrink-0">Đơn hàng ({orders.length})</div>
            <div className="flex-1 min-h-0 border rounded overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-slate-700 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2">Mã đơn</th>
                    <th className="text-left px-3 py-2">Tên khách</th>
                    <th className="text-left px-3 py-2">Mã invoice</th>
                    <th className="text-right px-3 py-2">Số tiền</th>
                    <th className="text-center px-3 py-2">Excel</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.code} className="border-t">
                      <td className="px-3 py-2 font-mono">{o.code}</td>
                      <td className="px-3 py-2">{o.customerName || '—'}</td>
                      <td className="px-3 py-2 font-mono">{o.invoiceCode}</td>
                      <td className="px-3 py-2 text-right font-mono">{o.voiceAmount != null ? formatMoney(o.voiceAmount) : '—'}</td>
                      <td className="px-3 py-2 text-center">
                        {o.found
                          ? <span className="text-green-600" title="Tìm thấy trong Excel">✓</span>
                          : <span className="text-red-500 text-xs" title="Không có trong Excel">✗</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="shrink-0 px-4 py-3 border-t bg-slate-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded border hover:bg-slate-100">
            Hủy (Esc)
          </button>
          <button
            onClick={onSave}
            disabled={isDuplicate}
            className={`px-4 py-2 text-sm rounded text-white ${
              isDuplicate
                ? 'bg-slate-300 cursor-not-allowed'
                : isNotContinuous
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isDuplicate ? 'Không thể lưu' : isNotContinuous ? 'Lưu (không append)' : 'Lưu (Enter)'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, strong }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`truncate ${strong ? 'font-semibold' : ''}`}>{value}</div>
    </div>
  )
}