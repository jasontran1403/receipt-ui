import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatMoney } from '../utils/formatMoney.js'
import { markReceiptMisa } from '../api.js'

const AMOUNT_TOLERANCE = 10000
const FLASH_MS = 1200
const TOAST_MS = 1500

// Natural sort: hỗ trợ "NĐ-05131 < NĐ-05830 < NĐ-05831" và "9999 < 10135"
const CODE_COLLATOR = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' })

// ============================================================
// Helpers
// ============================================================
const isValidInvoice = (code) => !!code && code !== 'N/A'

/** Làm tròn XUỐNG đến ngàn gần nhất: 3.786.002 → 3.786.000; 3.537.993 → 3.537.000. */
const roundToThousand = (n) => Math.floor((n || 0) / 1000) * 1000

/** Tổng tiền các đơn SAU khi làm tròn xuống ngàn. */
function sumOrdersRounded(orders) {
  return (orders || []).reduce((s, o) => s + roundToThousand(o.orderAmount), 0)
}

function receiptHasInvoice(r) {
  return (r.orders || []).some((o) => isValidInvoice(o.invoiceCode))
}

function receiptIsProcessed(r) {
  return !!r.misaProcessedAt
}

/** Diff dùng SUM ĐÃ LÀM TRÒN để so với receiptAmount. */
function receiptAmountDiff(r) {
  return Math.abs(sumOrdersRounded(r.orders) - (r.receiptAmount || 0))
}

function receiptAmountMismatch(r) {
  return receiptAmountDiff(r) > AMOUNT_TOLERANCE
}

function receiptStatus(r) {
  if (receiptIsProcessed(r)) return 'processed'
  if (!receiptHasInvoice(r)) return 'no-invoice'
  if (receiptAmountMismatch(r)) return 'mismatch'
  return 'ok'
}

const STATUS_STYLE = {
  processed:   { bg: 'bg-blue-50',   hover: 'hover:bg-blue-100',  label: 'Đã xử lý Misa' },
  'no-invoice':{ bg: 'bg-red-100',   hover: 'hover:bg-red-200',   label: 'Không có mã invoice' },
  mismatch:    { bg: 'bg-amber-100', hover: 'hover:bg-amber-200', label: 'Lệch tổng tiền' },
  ok:          { bg: '',             hover: 'hover:bg-slate-100', label: 'Chưa xử lý' },
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return true } catch { /* fallthrough */ }
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch { return false }
}

function matches(row, q) {
  if (!q) return true
  const s = q.toLowerCase()
  if ((row.receiptCode || '').toLowerCase().includes(s)) return true
  for (const o of row.orders || []) {
    if ((o.orderCode || '').toLowerCase().includes(s)) return true
    if ((o.invoiceCode || '').toLowerCase().includes(s)) return true
    if ((o.customerName || '').toLowerCase().includes(s)) return true
  }
  return false
}

/**
 * Flatten + sort orders theo orderCode ASC (natural).
 * Compute copyAmount cho mỗi dòng:
 *   - Đơn cuối (phiếu có ≥ 2 đơn) + phiếu CÓ mismatch (|total - sum| > tolerance):
 *       copyAmount = receiptAmount - sum(previous orders)
 *   - Các trường hợp khác (bao gồm diff ≤ tolerance do làm tròn):
 *       copyAmount = order.orderAmount
 */
function flatten(rows) {
  const out = []
  for (const r of rows) {
    const sorted = (r.orders || []).slice().sort(
      (a, b) => CODE_COLLATOR.compare(a.orderCode || '', b.orderCode || '')
    )
    const orders = sorted.length ? sorted : [null]
    const total = r.receiptAmount || 0
    // Dùng sum ĐÃ LÀM TRÒN để check mismatch
    const sumAllRounded = sumOrdersRounded(sorted)
    const isReceiptMismatch = Math.abs(total - sumAllRounded) > AMOUNT_TOLERANCE
    // Remainder cho đơn cuối vẫn dùng RAW previous amounts (theo spec gốc)
    const sumPrevUpTo = (idx) =>
      sorted.slice(0, idx).reduce((s, o) => s + (o.orderAmount || 0), 0)

    orders.forEach((o, idx) => {
      const isLast = sorted.length >= 2 && idx === sorted.length - 1 && !!o
      let copyAmount = o?.orderAmount ?? null
      let isAdjusted = false
      // Chỉ áp dụng remainder khi phiếu LỆCH THẬT (sau khi làm tròn).
      // Nếu sum rounded khớp total (chỉ do phần lẻ < 1000/đơn), copy đúng orderAmount.
      if (isLast && isReceiptMismatch) {
        const remainder = total - sumPrevUpTo(idx)
        copyAmount = remainder
        isAdjusted = remainder !== o.orderAmount
      }

      out.push({
        rowKey: `${r.id}-${o?.id ?? 'empty'}-${idx}`,
        isFirstOfReceipt: idx === 0,
        receipt: r,
        order: o,
        copyAmount,
        isAdjusted,
      })
    })
  }
  return out
}

// ============================================================
// Main
// ============================================================
export default function HistoryTable({ rows, onReceiptUpdated }) {
  const [q, setQ] = useState('')
  const [viewFilter, setViewFilter] = useState('all')
  const [pendingReceipt, setPendingReceipt] = useState(null)
  const [flashId, setFlashId] = useState(null)
  const [working, setWorking] = useState(false)
  const [toast, setToast] = useState(null)
  const flashTimerRef = useRef(null)
  const toastTimerRef = useRef(null)

  useEffect(() => () => {
    clearTimeout(flashTimerRef.current)
    clearTimeout(toastTimerRef.current)
  }, [])

  const filteredByView = useMemo(() => {
    if (viewFilter === 'hasInvoice') return rows.filter((r) => receiptHasInvoice(r))
    if (viewFilter === 'processed')  return rows.filter((r) => receiptIsProcessed(r) && receiptHasInvoice(r))
    return rows
  }, [rows, viewFilter])

  const filteredReceipts = useMemo(
    () => filteredByView.filter((r) => matches(r, q.trim())),
    [filteredByView, q]
  )
  const flatRows = useMemo(() => flatten(filteredReceipts), [filteredReceipts])

  const counts = useMemo(() => {
    let all = rows.length, hasInv = 0, processed = 0
    for (const r of rows) {
      const hi = receiptHasInvoice(r)
      if (hi) hasInv++
      if (receiptIsProcessed(r) && hi) processed++
    }
    return { all, hasInv, processed }
  }, [rows])

  const openModal = (receipt) => {
    const st = receiptStatus(receipt)
    if (st === 'processed' || st === 'no-invoice') return
    setPendingReceipt(receipt)
  }

  const confirmMark = useCallback(async () => {
    if (!pendingReceipt || working) return
    const r = pendingReceipt
    setWorking(true)
    try {
      const updated = await markReceiptMisa(r.id, true)
      onReceiptUpdated?.(updated)
      setPendingReceipt(null)
      setFlashId(r.id)
      clearTimeout(flashTimerRef.current)
      flashTimerRef.current = setTimeout(() => setFlashId(null), FLASH_MS)
    } catch (e) {
      alert('Lỗi khi đánh dấu: ' + e.message)
    } finally {
      setWorking(false)
    }
  }, [pendingReceipt, working, onReceiptUpdated])

  const cancelModal = useCallback(() => setPendingReceipt(null), [])

  const showToast = useCallback((text, error = false) => {
    const id = Date.now() + Math.random()
    setToast({ text, id, error })
    clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev))
    }, TOAST_MS)
  }, [])

  const handleCopyCell = useCallback(async (e, value, label) => {
    if (value == null || value === '') return
    e.stopPropagation()
    const text = String(value)
    const ok = await copyToClipboard(text)
    if (ok) showToast(`${label}: ${text}`)
    else    showToast('Copy thất bại', true)
  }, [showToast])

  return (
    <div className="flex flex-col h-full bg-white border rounded-lg shadow-sm overflow-hidden relative">
      {/* ======== Toolbar ======== */}
      <div className="shrink-0 p-3 border-b bg-white space-y-2">
        <div className="relative">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo mã phiếu thu / mã đơn / mã invoice / tên khách..."
            className="w-full pl-8 pr-8 py-2 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
          />
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          {q && (
            <button
              onClick={() => setQ('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-sm"
            >✕</button>
          )}
        </div>

        <div className="flex items-center gap-1 text-xs" role="radiogroup" aria-label="Bộ lọc phiếu thu">
          <FilterRadio label={`Tất cả (${counts.all})`}             checked={viewFilter === 'all'}        onChange={() => setViewFilter('all')} />
          <FilterRadio label={`Có mã invoice (${counts.hasInv})`}    checked={viewFilter === 'hasInvoice'} onChange={() => setViewFilter('hasInvoice')} />
          <FilterRadio label={`Đã xử lý Misa (${counts.processed})`} checked={viewFilter === 'processed'}  onChange={() => setViewFilter('processed')} />
          <span className="ml-auto text-slate-500">
            Hiển thị: {filteredReceipts.length} phiếu · {flatRows.length} dòng
          </span>
        </div>
      </div>

      {/* ======== Table ======== */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10">
            <tr>
              <th className="text-left px-3 py-2">Phiếu thu</th>
              <th className="text-left px-3 py-2">Ngày</th>
              <th className="text-left px-3 py-2">Mã đơn</th>
              <th className="text-left px-3 py-2">Tên khách</th>
              <th className="text-left px-3 py-2">Mã invoice</th>
              <th className="text-right px-3 py-2">Số tiền</th>
              <th className="text-right px-3 py-2">Tổng tiền</th>
              <th className="text-center px-3 py-2 w-28">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {flatRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-slate-400 py-10">
                  {rows.length === 0 ? 'Chưa có phiếu thu nào.' : 'Không có phiếu phù hợp bộ lọc.'}
                </td>
              </tr>
            ) : (
              flatRows.map(({ rowKey, isFirstOfReceipt, receipt, order, copyAmount, isAdjusted }) => {
                const st = receiptStatus(receipt)
                const style = STATUS_STYLE[st]
                const clickable = st !== 'processed' && st !== 'no-invoice'
                const isFlashing = flashId === receipt.id
                const bgCls = isFlashing ? 'bg-blue-200' : style.bg
                const hoverCls = clickable ? style.hover : ''
                const cursorCls = clickable ? 'cursor-pointer' : 'cursor-default'

                const orderCode = order?.orderCode
                const invoiceCode = isValidInvoice(order?.invoiceCode) ? order.invoiceCode : null
                const hasAmount = order?.orderAmount != null

                return (
                  <tr
                    key={rowKey}
                    onClick={() => clickable && openModal(receipt)}
                    title={clickable ? 'Click để đánh dấu đã xử lý Misa' : style.label}
                    className={`border-t transition-colors duration-700
                      ${isFirstOfReceipt ? 'border-slate-300' : 'border-slate-100'}
                      ${bgCls} ${hoverCls} ${cursorCls}`}
                  >
                    <td className={`px-3 py-2 font-mono ${isFirstOfReceipt ? 'font-semibold' : 'text-slate-300'}`}>
                      {isFirstOfReceipt ? receipt.receiptCode : ''}
                    </td>
                    <td className={`px-3 py-2 ${isFirstOfReceipt ? '' : 'text-slate-300'}`}>
                      {isFirstOfReceipt ? (receipt.receiptDate || '—') : ''}
                    </td>

                    {/* Mã đơn: click = copy */}
                    <CopyCell value={orderCode} label="Mã đơn" onCopy={handleCopyCell} />

                    <td className="px-3 py-2 truncate max-w-[200px]">{order?.customerName || '—'}</td>

                    {/* Mã invoice: click = copy */}
                    <CopyCell value={invoiceCode} label="Mã invoice" onCopy={handleCopyCell} />

                    {/* Số tiền: click = copy raw (đơn cuối = số còn lại) */}
                    <td className="px-3 py-2 text-right font-mono">
                      {hasAmount ? (
                        <span
                          className="cursor-copy hover:underline decoration-dotted underline-offset-2"
                          onClick={(e) => handleCopyCell(
                            e,
                            copyAmount,
                            isAdjusted ? 'Số còn lại' : 'Số tiền'
                          )}
                          title={
                            isAdjusted
                              ? `Click copy số còn lại: ${copyAmount} (hiển thị: ${order.orderAmount})`
                              : `Click copy: ${copyAmount}`
                          }
                        >
                          {formatMoney(order.orderAmount)}
                          {isAdjusted && <span className="ml-1 text-amber-600 text-[10px]" title="Khi copy sẽ là số còn lại của phiếu">※</span>}
                        </span>
                      ) : '—'}
                    </td>

                    <td className={`px-3 py-2 text-right font-mono ${isFirstOfReceipt ? 'font-semibold' : 'text-slate-300'}`}>
                      {isFirstOfReceipt ? formatMoney(receipt.receiptAmount) : ''}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {isFirstOfReceipt && <StatusBadge status={st} receipt={receipt} />}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {pendingReceipt && (
        <ConfirmMisaModal
          receipt={pendingReceipt}
          working={working}
          onConfirm={confirmMark}
          onCancel={cancelModal}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-6 right-6 z-[60]">
          <div className={`text-sm px-3 py-2 rounded-lg shadow-lg text-white
            ${toast.error ? 'bg-red-600' : 'bg-slate-900'}`}
          >
            {toast.error ? '✗ ' : '📋 '}
            <span className="font-mono font-semibold">{toast.text}</span>
            {!toast.error && <span className="ml-1 opacity-75">đã copy</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Sub-components
// ============================================================
function CopyCell({ value, label, onCopy }) {
  if (!value) return <td className="px-3 py-2 font-mono text-slate-400">—</td>
  return (
    <td
      className="px-3 py-2 font-mono"
      onClick={(e) => onCopy(e, value, label)}
      title={`Click để copy ${label}: ${value}`}
    >
      <span className="cursor-copy hover:underline decoration-dotted underline-offset-2">
        {value}
      </span>
    </td>
  )
}

function FilterRadio({ label, checked, onChange }) {
  return (
    <label
      className={`px-2.5 py-1 rounded border cursor-pointer select-none transition-colors
        ${checked ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'}`}
    >
      <input type="radio" className="sr-only" checked={checked} onChange={onChange} />
      {label}
    </label>
  )
}

function StatusBadge({ status, receipt }) {
  const map = {
    processed:   { cls: 'bg-blue-600 text-white',    text: '✓ Đã xử lý' },
    'no-invoice':{ cls: 'bg-red-600 text-white',     text: '✗ Không có invoice' },
    mismatch:    { cls: 'bg-amber-500 text-white',   text: '⚠ Lệch tổng' },
    ok:          { cls: 'bg-slate-200 text-slate-700', text: 'Chưa xử lý' },
  }
  const m = map[status]
  const diff = receiptAmountDiff(receipt)
  const title = status === 'mismatch'
    ? `Lệch ${formatMoney(diff)} đ`
    : status === 'processed' && receipt.misaProcessedAt
      ? `Đã xử lý: ${new Date(receipt.misaProcessedAt).toLocaleString('vi-VN')}`
      : undefined
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${m.cls}`}
      title={title}
    >
      {m.text}
    </span>
  )
}

function ConfirmMisaModal({ receipt, working, onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onConfirm() }
      else if (e.key === 'Escape') { e.preventDefault(); onCancel() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onConfirm, onCancel])

  const diff = receiptAmountDiff(receipt)
  const mismatch = receiptAmountMismatch(receipt)
  const sumRaw = (receipt.orders || []).reduce((s, o) => s + (o.orderAmount || 0), 0)
  const sumRounded = sumOrdersRounded(receipt.orders)
  const roundingApplied = sumRaw !== sumRounded

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="font-semibold text-base">Đánh dấu đã xử lý Misa</h2>
          <div className="text-xs text-slate-500">
            <kbd className="px-2 py-0.5 bg-slate-100 border rounded">Enter</kbd> xác nhận ·{' '}
            <kbd className="px-2 py-0.5 bg-slate-100 border rounded">Esc</kbd> hủy
          </div>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div>
            Đánh dấu phiếu thu <b className="font-mono">{receipt.receiptCode}</b> ngày{' '}
            <b>{receipt.receiptDate || '—'}</b> là đã xử lý lên Misa?
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 border rounded p-2">
            <div>Số đơn: <b>{receipt.orders?.length || 0}</b></div>
            <div>Tổng tiền phiếu: <b className="font-mono">{formatMoney(receipt.receiptAmount)}</b></div>
            <div
              title={roundingApplied ? `Chưa làm tròn: ${formatMoney(sumRaw)}` : undefined}
              className={roundingApplied ? 'cursor-help' : ''}
            >
              Tổng tiền đơn{roundingApplied ? ' (làm tròn ngàn)' : ''}:{' '}
              <b className="font-mono">{formatMoney(sumRounded)}</b>
            </div>
            <div className={mismatch ? 'text-amber-700' : 'text-slate-600'}>
              Lệch: <b className="font-mono">{formatMoney(diff)}</b>
              {mismatch ? ' ⚠' : ''}
            </div>
          </div>
        </div>
        <div className="px-4 py-3 border-t bg-slate-50 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={working}
            className="px-4 py-2 text-sm rounded border hover:bg-slate-100 disabled:opacity-50"
          >
            Hủy (Esc)
          </button>
          <button
            onClick={onConfirm}
            disabled={working}
            className="px-4 py-2 text-sm rounded text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {working ? 'Đang lưu...' : 'Xác nhận (Enter)'}
          </button>
        </div>
      </div>
    </div>
  )
}