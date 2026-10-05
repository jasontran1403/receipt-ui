import { useCallback, useEffect, useRef, useState } from 'react'
import { useMic } from './hooks/useMic.js'
import { usePushToTalk } from './hooks/usePushToTalk.js'
import { useSpeechRecognition } from './hooks/useSpeechRecognition.js'
import MicGate from './components/MicGate.jsx'
import MicPanel from './components/MicPanel.jsx'
import ManualPanel from './components/ManualPanel.jsx'
import ModeSelector from './components/ModeSelector.jsx'
import FieldSlots, {
  allFieldsFilled, nextEmptyField, orderCodesSubStep, FIELD_DEFS,
} from './components/FieldSlots.jsx'
import ResultModal from './components/ResultModal.jsx'
import HistoryTable from './components/HistoryTable.jsx'
import { parseForField, parseOrderCode } from './utils/parser.js'
import { parseVietnameseNumber } from './utils/vietnameseNumber.js'
import {
  parseDateManual, parseReceiptCodeManual,
  parseOrderCodeManual, parseAmountManual,
} from './utils/manualParser.js'
import { lookupOrders, saveReceipt, listReceipts, validateReceipt } from './api.js'

const AUTO_LOOKUP_DELAY_MS = 1000
const MODE_STORAGE_KEY = 'receipt-entry-mode'

const emptyFields = () => ({
  receiptCode: null,
  date: null,
  orderCodes: [],
  receiptAmount: null,
})

const clearedValue = (fieldKey) => (fieldKey === 'orderCodes' ? [] : null)
const isEmptyValue = (v) => v === null || v === undefined || (Array.isArray(v) && v.length === 0)

export default function App() {
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem(MODE_STORAGE_KEY) || null } catch { return null }
  })
  const pickMode = (m) => {
    try { localStorage.setItem(MODE_STORAGE_KEY, m) } catch {}
    setMode(m)
  }
  const switchMode = () => {
    try { localStorage.removeItem(MODE_STORAGE_KEY) } catch {}
    setMode(null)
  }

  if (!mode) return <ModeSelector onPick={pickMode} />

  return <AppInner key={mode} mode={mode} onSwitchMode={switchMode} />
}

function AppInner({ mode, onSwitchMode }) {
  const isManual = mode === 'manual'
  const isVoice = mode === 'voice'

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const mic = isVoice ? useMic() : null

  const [fields, setFields] = useState(emptyFields())
  const [orderCodesConfirmed, setOrderCodesConfirmed] = useState(false)
  const [activeField, setActiveField] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [autoTriggerBlocked, setAutoTriggerBlocked] = useState(false)
  const [lookups, setLookups] = useState({})
  const [interim, setInterim] = useState('')
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [validation, setValidation] = useState(null)

  const extras = { orderCodesConfirmed }
  const effectiveTarget = activeField || nextEmptyField(fields, extras)

  const fieldsRef = useRef(fields)
  const activeFieldRef = useRef(activeField)
  const orderConfirmedRef = useRef(orderCodesConfirmed)
  const targetForCurrentUtterance = useRef(null)
  useEffect(() => { fieldsRef.current = fields }, [fields])
  useEffect(() => { activeFieldRef.current = activeField }, [activeField])
  useEffect(() => { orderConfirmedRef.current = orderCodesConfirmed }, [orderCodesConfirmed])

  useEffect(() => { listReceipts().then(setRows).catch(() => {}) }, [])

  // ✅ MỚI: callback khi 1 receipt được update từ HistoryTable (vd: đánh dấu Misa)
  const handleReceiptUpdated = useCallback((updated) => {
    if (!updated || updated.id == null) return
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
  }, [])

  // ============================================================
  // VOICE: Speech recognition + push-to-talk
  // ============================================================
  const onSpeechStart = useCallback(() => {
    const target = activeFieldRef.current || nextEmptyField(
      fieldsRef.current, { orderCodesConfirmed: orderConfirmedRef.current }
    )
    targetForCurrentUtterance.current = target
    setInterim('')
  }, [])

  const onFinal = useCallback((text) => {
    setInterim('')
    const target = targetForCurrentUtterance.current
    targetForCurrentUtterance.current = null
    if (!target) return

    if (target === 'orderCodes') {
      const list = fieldsRef.current.orderCodes || []
      const subStep = orderCodesSubStep(list)
      if (subStep === 'code') {
        const code = parseOrderCode(text)
        if (!code) return
        setFields((prev) => ({
          ...prev,
          orderCodes: [...(prev.orderCodes || []), { code, amount: null }],
        }))
      } else {
        const amount = parseVietnameseNumber(text)
        if (amount == null) return
        setFields((prev) => {
          const arr = [...(prev.orderCodes || [])]
          arr[arr.length - 1] = { ...arr[arr.length - 1], amount }
          return { ...prev, orderCodes: arr }
        })
      }
      return
    }

    const value = parseForField(text, target)
    if (isEmptyValue(value)) return
    setFields((prev) => ({ ...prev, [target]: value }))
    setActiveField(null)
  }, [])

  const speech = useSpeechRecognition({
    onFinal: isVoice ? onFinal : () => {},
    onInterim: isVoice ? setInterim : () => {},
    lang: 'vi-VN',
  })

  const { holding } = usePushToTalk({
    enabled: isVoice && mic?.status === 'ok' && !modalOpen,
    onStart: () => { onSpeechStart(); speech.start() },
    onStop: () => speech.stop(),
  })

  // ============================================================
  // MANUAL: commit từ ManualFieldInput
  // ============================================================
  const commitManual = useCallback((fieldKey, rawText) => {
    const current = fieldsRef.current

    if (fieldKey === 'orderCodes') {
      const subStep = orderCodesSubStep(current.orderCodes)
      if (!rawText) {
        if (!current.orderCodes || current.orderCodes.length === 0) return
        const kept = current.orderCodes.filter((o) => o.code && o.amount != null)
        setFields((prev) => ({ ...prev, orderCodes: kept }))
        setOrderCodesConfirmed(true)
        setActiveField(null)
        return
      }
      if (subStep === 'code') {
        const code = parseOrderCodeManual(rawText)
        if (!code) return
        setFields((prev) => ({
          ...prev,
          orderCodes: [...(prev.orderCodes || []), { code, amount: null }],
        }))
      } else {
        const amount = parseAmountManual(rawText)
        if (amount == null) return
        setFields((prev) => {
          const arr = [...(prev.orderCodes || [])]
          arr[arr.length - 1] = { ...arr[arr.length - 1], amount }
          return { ...prev, orderCodes: arr }
        })
      }
      return
    }

    let value = null
    if (fieldKey === 'receiptCode')        value = parseReceiptCodeManual(rawText)
    else if (fieldKey === 'date')          value = parseDateManual(rawText)
    else if (fieldKey === 'receiptAmount') value = parseAmountManual(rawText)

    if (isEmptyValue(value)) return
    setFields((prev) => ({ ...prev, [fieldKey]: value }))
    setActiveField(null)
  }, [])

  const removeOrderCodeAt = useCallback((idx) => {
    setFields((prev) => {
      const arr = [...(prev.orderCodes || [])]
      arr.splice(idx, 1)
      return { ...prev, orderCodes: arr }
    })
    setOrderCodesConfirmed(false)
    setAutoTriggerBlocked(false)
    setActiveField('orderCodes')
  }, [])

  // ============================================================
  // Keyboard: Ctrl + Shift
  // ============================================================
  useEffect(() => {
    const ctrl = { active: false, combo: false }
    const shift = { active: false, combo: false }
    const isCtrl = (e) => e.code === 'ControlLeft' || e.code === 'ControlRight'
    const isShift = (e) => e.code === 'ShiftLeft' || e.code === 'ShiftRight'
    const isTyping = () => ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)

    const onDown = (e) => {
      if (isCtrl(e)) {
        if (!ctrl.active) { ctrl.active = true; ctrl.combo = false }
      } else if (ctrl.active) {
        ctrl.combo = true
      }
      if (isShift(e)) {
        if (!shift.active && !ctrl.active) { shift.active = true; shift.combo = false }
      } else if (shift.active) {
        shift.combo = true
      }
    }

    const onUp = (e) => {
      if (isCtrl(e)) {
        const wasCombo = ctrl.combo
        ctrl.active = false
        ctrl.combo = false
        if (wasCombo || modalOpen) return
        if (isVoice) {
          if (isTyping() || holding) return
          confirmOrderCodes()
        }
      } else if (isShift(e)) {
        const wasCombo = shift.combo
        shift.active = false
        shift.combo = false
        if (wasCombo || modalOpen) return
        if (isVoice) {
          if (isTyping() || holding) return
        }
        removeLastOrderCode()
      }
    }

    const confirmOrderCodes = () => {
      const current = fieldsRef.current
      const confirmed = orderConfirmedRef.current
      const active = activeFieldRef.current
      const target = active || nextEmptyField(current, { orderCodesConfirmed: confirmed })
      if (target !== 'orderCodes') return
      if (!current.orderCodes || current.orderCodes.length === 0) return
      const kept = current.orderCodes.filter((o) => o.code && o.amount != null)
      setFields((prev) => ({ ...prev, orderCodes: kept }))
      setOrderCodesConfirmed(true)
      setActiveField(null)
    }

    const removeLastOrderCode = () => {
      const current = fieldsRef.current
      const confirmed = orderConfirmedRef.current
      const active = activeFieldRef.current
      const target = active || nextEmptyField(current, { orderCodesConfirmed: confirmed })
      if (target !== 'orderCodes') return
      if (!current.orderCodes || current.orderCodes.length === 0) return
      const arr = current.orderCodes.slice(0, -1)
      setFields((prev) => ({ ...prev, orderCodes: arr }))
    }

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [modalOpen, holding, isVoice, isManual])

  // ============================================================
  // Auto lookup
  // ============================================================
  useEffect(() => {
    if (modalOpen || autoTriggerBlocked) return
    if (!allFieldsFilled(fields, extras)) return
    const t = setTimeout(async () => {
      const codes = (fields.orderCodes || []).map((o) => o.code).filter(Boolean)
      setBusy(true)
      try {
        const [lookupMap, valResult] = await Promise.all([
          codes.length ? lookupOrders(codes) : Promise.resolve({}),
          validateReceipt(fields.receiptCode, fields.date?.iso || null).catch(() => null),
        ])
        setLookups(lookupMap)
        setValidation(valResult)
      } catch (e) {
        console.error(e)
        setLookups({})
        setValidation(null)
      } finally {
        setBusy(false)
      }
      setModalOpen(true)
    }, AUTO_LOOKUP_DELAY_MS)
    return () => clearTimeout(t)
  }, [fields, orderCodesConfirmed, modalOpen, autoTriggerBlocked])

  useEffect(() => {
    if (!modalOpen) return
    const onKey = async (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return
      if (e.code === 'Enter') { e.preventDefault(); await handleSave() }
      else if (e.code === 'Escape') { e.preventDefault(); closeModal() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line
  }, [modalOpen, fields, lookups])

  const handleSave = async () => {
    if (validation?.status === 'duplicate') return
    const payload = {
      receiptCode: fields.receiptCode,
      receiptDate: fields.date?.iso || null,
      customerNameVoice: null,
      receiptAmount: fields.receiptAmount,
      orders: (fields.orderCodes || []).map((o) => {
        const l = lookups[o.code] || {}
        return {
          orderCode: o.code,
          invoiceCode: l.invoiceCode || 'N/A',
          customerName: l.customerName || null,
          orderAmount: o.amount ?? null,
        }
      }),
    }
    try {
      const saved = await saveReceipt(payload)
      if (validation?.status !== 'not_continuous') {
        setRows((prev) => [saved, ...prev])
      }
      resetAll()
    } catch (e) {
      if (e.code === 'duplicate') {
        setValidation(e.payload)
        alert('Không thể lưu: ' + (e.payload?.message || e.message))
      } else {
        alert('Lỗi khi lưu: ' + e.message)
      }
    }
  }

  const closeModal = () => { setModalOpen(false); setAutoTriggerBlocked(true); setValidation(null) }

  const onFieldClick = (fieldKey) => {
    setModalOpen(false)
    setFields((prev) => ({ ...prev, [fieldKey]: clearedValue(fieldKey) }))
    setActiveField(fieldKey)
    setAutoTriggerBlocked(false)
    if (fieldKey === 'orderCodes') setOrderCodesConfirmed(false)
  }

  const resetAll = () => {
    setFields(emptyFields())
    setOrderCodesConfirmed(false)
    setLookups({})
    setActiveField(null)
    setValidation(null)
    setAutoTriggerBlocked(false)
    setModalOpen(false)
    setInterim('')
  }

  const anyFilled = FIELD_DEFS.some((f) => f.display(fields[f.key]) != null)

  const statusText = () => {
    if (isVoice && holding) {
      if (effectiveTarget === 'orderCodes') {
        const sub = orderCodesSubStep(fields.orderCodes)
        return sub === 'code'
          ? `Đang nghe mã đơn #${fields.orderCodes.length + 1}...`
          : `Đang nghe số tiền cho ${fields.orderCodes[fields.orderCodes.length - 1]?.code}...`
      }
      return `Đang nghe: ${labelOf(effectiveTarget)}...`
    }
    if (!effectiveTarget) return 'Tất cả đã fill. Chờ 1s để xem kết quả.'

    const verb = isManual ? 'gõ' : 'nói'
    const trigger = isManual ? 'Gõ' : 'Space'

    if (effectiveTarget === 'orderCodes') {
      const sub = orderCodesSubStep(fields.orderCodes)
      const n = fields.orderCodes.length
      if (sub === 'code') {
        return `${trigger}: ${verb} mã đơn #${n + 1}${n > 0 ? '  ·  Ctrl: xong  ·  Shift: xóa đơn cuối' : ''}`
      }
      return `${trigger}: ${verb} số tiền cho ${fields.orderCodes[n - 1]?.code}  ·  Shift: xóa đơn cuối`
    }
    return `${trigger}: ${verb} ${labelOf(effectiveTarget)}`
  }

  const sidebar = (
    <div className="min-w-0 min-h-0 overflow-y-auto space-y-3 pr-1">
      {isVoice
        ? <MicPanel mic={mic} />
        : <ManualPanel onSwitchMode={onSwitchMode} />}

      {isVoice && !speech.supported && (
        <div className="p-3 bg-amber-50 border border-amber-300 text-amber-800 rounded text-sm">
          Trình duyệt không hỗ trợ Web Speech API. Vui lòng dùng Chrome.
        </div>
      )}

      <div className={`p-2.5 rounded-lg border-2 transition-all ${
        isVoice && holding ? 'border-red-500 bg-red-50' : 'border-slate-200 bg-white'
      }`}>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            isVoice && holding ? 'bg-red-500 animate-pulse' : 'bg-slate-300'
          }`} />
          <span className="text-xs text-slate-700 truncate flex-1">{statusText()}</span>
          {busy && <span className="text-xs text-slate-500">Tra cứu...</span>}
          {anyFilled && !modalOpen && (
            <button
              onClick={resetAll}
              className="text-xs text-slate-500 hover:text-red-600 underline shrink-0"
            >
              Xoá
            </button>
          )}
        </div>
        {isVoice && (
          <div className="mt-1 text-xs text-slate-500 italic min-h-[16px] truncate">
            {interim ? `"${interim}"` : ''}
          </div>
        )}
      </div>

      <FieldSlots
        fields={fields}
        effectiveTarget={effectiveTarget}
        holding={isVoice ? holding : false}
        onFieldClick={onFieldClick}
        orderCodesConfirmed={orderCodesConfirmed}
        onRemoveOrderCode={removeOrderCodeAt}
        mode={mode}
        manualHandlers={isManual ? { onCommit: commitManual } : null}
      />

      <details className="text-xs text-slate-600 bg-white p-2 rounded border">
        <summary className="cursor-pointer font-medium">Hướng dẫn</summary>
        {isVoice ? (
          <div className="mt-1.5 space-y-1">
            <div>• Giữ <kbd className="px-1 bg-slate-100 border rounded">Space</kbd> nói, thả để parse.</div>
            <div>• Ô <b>Mã đơn & số tiền</b>: xen kẽ mã → tiền → mã → tiền → ...</div>
            <div className="pl-4">VD: Space "10135" → Space "ba triệu sáu" → Space "3016" → Space "1 6 2 3 5 0 1"</div>
            <div>• Nhấn <kbd className="px-1 bg-slate-100 border rounded">Ctrl</kbd> để chốt (bỏ đơn thiếu tiền) và qua Tổng tiền.</div>
            <div>• Nhấn <kbd className="px-1 bg-slate-100 border rounded">Shift</kbd> để xóa đơn cuối cùng.</div>
            <div>• Click vào từng badge đơn để xóa đơn đó.</div>
            <div>• Prefix chữ: "nờ gờ 03567" → NG-03567.</div>
            <div>• Click ô field để nói lại (xoá ô đó).</div>
          </div>
        ) : (
          <div className="mt-1.5 space-y-1">
            <div>• Gõ giá trị vào ô, nhấn <kbd className="px-1 bg-slate-100 border rounded">Ctrl</kbd> (hoặc <kbd className="px-1 bg-slate-100 border rounded">Enter</kbd>) để qua ô kế tiếp.</div>
            <div>• <b>Số phiếu thu</b>: digits (VD: <code>13779</code>).</div>
            <div>• <b>Ngày</b>: <code>29/4/26</code>, <code>29-04-2026</code>, hoặc <code>290426</code>.</div>
            <div>• <b>Mã đơn & số tiền</b>: gõ mã (VD <code>nđ-06503</code> → <code>NĐ-06503</code> sau 600ms) → Ctrl → gõ số tiền (có dấu "." tự động) → Ctrl → mã kế → ...</div>
            <div>• Nhấn <kbd className="px-1 bg-slate-100 border rounded">Ctrl</kbd> khi input rỗng để chốt và qua <b>Tổng tiền</b>.</div>
            <div>• Nhấn <kbd className="px-1 bg-slate-100 border rounded">Shift</kbd> để xóa đơn cuối.</div>
            <div>• Click ô field đã nhập để gõ lại.</div>
          </div>
        )}
      </details>
    </div>
  )

  const main = (
    <div className="h-full grid grid-cols-[30%_1fr] gap-4 p-4 overflow-hidden">
      {sidebar}
      <div className="min-w-0 min-h-0 flex flex-col overflow-hidden">
        <div className="text-sm font-semibold mb-2 shrink-0">Lịch sử phiếu thu</div>
        <div className="flex-1 min-h-0">
          {/* ✅ MỚI: truyền onReceiptUpdated để HistoryTable gọi khi mark Misa */}
          <HistoryTable rows={rows} onReceiptUpdated={handleReceiptUpdated} />
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-dvh flex flex-col overflow-hidden bg-slate-50">
      <header className="shrink-0 bg-white border-b">
        <div className="px-6 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onSwitchMode}
              className="flex items-center gap-1 px-2.5 py-1 text-sm border rounded
                         hover:bg-slate-100 text-slate-700"
              type="button"
              title="Về trang chọn chế độ"
            >
              <span className="text-base leading-none">←</span>
              <span>Chọn chế độ</span>
            </button>
            <h1 className="text-lg font-semibold">
              Receipt {isVoice ? 'Voice' : 'Manual'} Entry
            </h1>
          </div>

          <div className="text-xs text-slate-500">
            {isVoice ? (
              <span>
                <kbd className="px-2 py-0.5 bg-slate-100 border rounded">Space</kbd> nói ·{' '}
                <kbd className="px-2 py-0.5 bg-slate-100 border rounded">Ctrl</kbd> xong mã đơn ·{' '}
                <kbd className="px-2 py-0.5 bg-slate-100 border rounded">Shift</kbd> xóa đơn cuối ·{' '}
                <kbd className="px-2 py-0.5 bg-slate-100 border rounded">Enter</kbd> lưu
              </span>
            ) : (
              <span>
                <kbd className="px-2 py-0.5 bg-slate-100 border rounded">Ctrl</kbd> qua ô kế ·{' '}
                <kbd className="px-2 py-0.5 bg-slate-100 border rounded">Shift</kbd> xóa đơn cuối ·{' '}
                <kbd className="px-2 py-0.5 bg-slate-100 border rounded">Enter</kbd> lưu
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden">
        {isVoice ? <MicGate mic={mic}>{main}</MicGate> : main}
      </main>

      {modalOpen && (
        <ResultModal
          fields={fields}
          lookups={lookups}
          validation={validation}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}
    </div>
  )
}

const labelOf = (key) => FIELD_DEFS.find((f) => f.key === key)?.label || ''