import { formatMoney } from '../utils/formatMoney.js'
import ManualFieldInput from './ManualFieldInput.jsx'

const pad = (n) => String(n).padStart(2, '0')

export const FIELD_DEFS = [
  {
    key: 'receiptCode',
    label: 'Số phiếu thu',
    example: 'VD: "một ba bảy bảy chín"',
    manualPlaceholder: 'Gõ số phiếu, Ctrl để qua ô kế',
    manualInputMode: 'numeric',
    display: (v) => v || null,
  },
  {
    key: 'date',
    label: 'Ngày',
    example: 'VD: "hai chín bốn hai sáu" (DDMYY)',
    manualPlaceholder: 'VD: 29/4/26 hoặc 290426',
    manualInputMode: 'text',
    display: (v) => (v ? `${pad(v.day)}/${pad(v.month)}/${v.year}` : null),
  },
  {
    key: 'orderCodes',
    label: 'Mã đơn & số tiền',
    example: 'Space: mã đơn · Space: số tiền · … · Ctrl: xong',
    manualInputMode: 'text',
    display: (v) => {
      if (!v || !v.length) return null
      return v.map((o) =>
        o.amount == null ? `${o.code} ⏳` : `${o.code}: ${formatMoney(o.amount)}`
      ).join(' · ')
    },
  },
  {
    key: 'receiptAmount',
    label: 'Tổng tiền',
    example: 'VD: "ba triệu sáu" hoặc "tám mươi triệu"',
    manualPlaceholder: 'Gõ số tiền, Ctrl để tiếp tục',
    manualInputMode: 'numeric',
    display: (v) => (v != null ? formatMoney(v) : null),
  },
]

export function isFieldFilled(fieldKey, value, extras = {}) {
  if (fieldKey === 'orderCodes') {
    if (!extras.orderCodesConfirmed) return false
    return Array.isArray(value) && value.length > 0 &&
      value.every((o) => o.code && o.amount != null)
  }
  const def = FIELD_DEFS.find((f) => f.key === fieldKey)
  return def?.display(value) != null
}

export function allFieldsFilled(fields, extras = {}) {
  return FIELD_DEFS.every((f) => isFieldFilled(f.key, fields[f.key], extras))
}

export function nextEmptyField(fields, extras = {}) {
  const f = FIELD_DEFS.find((d) => !isFieldFilled(d.key, fields[d.key], extras))
  return f ? f.key : null
}

/** Sub-step within orderCodes: 'code' (đợi nhập mã đơn) hoặc 'amount' (đợi nhập số tiền). */
export function orderCodesSubStep(orderCodes) {
  if (!orderCodes || orderCodes.length === 0) return 'code'
  const last = orderCodes[orderCodes.length - 1]
  return last.amount == null ? 'amount' : 'code'
}

export default function FieldSlots({
  fields,
  effectiveTarget,
  holding,
  onFieldClick,
  orderCodesConfirmed,
  onRemoveOrderCode,
  mode = 'voice',
  manualHandlers = null,
}) {
  const isManual = mode === 'manual'
  const subStep = orderCodesSubStep(fields.orderCodes)
  const pairCount = (fields.orderCodes || []).length

  return (
    <div className="space-y-2">
      {FIELD_DEFS.map((f) => {
        const v = fields[f.key]
        const hasContent = f.display(v) != null
        const isTarget = effectiveTarget === f.key
        const listening = isTarget && holding // voice-only

        const showGreen = f.key === 'orderCodes'
          ? orderCodesConfirmed && hasContent
          : hasContent

        let cls = 'w-full text-left p-3 rounded-lg border-2 transition-all focus:outline-none '
        if (listening)       cls += 'border-red-500 bg-red-50 ring-4 ring-red-200 animate-pulse'
        else if (isTarget)   cls += 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
        else if (showGreen)  cls += 'border-green-400 bg-white hover:border-green-600'
        else if (hasContent) cls += 'border-slate-400 bg-white hover:border-slate-600'
        else                 cls += 'border-slate-300 border-dashed bg-white hover:border-slate-500'

        let subLabel = null
        if (isTarget && f.key === 'orderCodes' && !orderCodesConfirmed) {
          const nextIdx = subStep === 'code' ? pairCount + 1 : pairCount
          const codeOfLast = subStep === 'amount' ? fields.orderCodes[pairCount - 1]?.code : null
          if (isManual) {
            subLabel = subStep === 'code'
              ? `→ gõ mã đơn #${nextIdx}`
              : `→ gõ số tiền cho ${codeOfLast}`
          } else if (holding) {
            subLabel = subStep === 'code'
              ? `● đang nghe mã đơn #${nextIdx}`
              : `● đang nghe số tiền cho ${codeOfLast}`
          } else {
            subLabel = subStep === 'code'
              ? `→ nói mã đơn #${nextIdx}`
              : `→ nói số tiền cho ${codeOfLast}`
          }
        } else if (isTarget) {
          subLabel = isManual ? '→ gõ ở đây' : (holding ? '● đang nghe' : '→ tiếp theo')
        }

        const renderBadge = (o, idx) => {
          const isIncomplete = o.amount == null
          return (
            <div
              key={idx}
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation()
                onRemoveOrderCode?.(idx)
              }}
              title="Click để xóa đơn này"
              className="flex items-center justify-between px-3 py-1.5 rounded-md
                         border-2 border-black bg-white text-slate-900
                         font-mono text-sm cursor-pointer select-none
                         hover:border-red-500 hover:text-red-600
                         transition-colors"
            >
              <span className="truncate">
                {o.code}
                {isIncomplete ? ' - ⏳' : ` - ${formatMoney(o.amount)}`}
              </span>
              <span className="ml-2 shrink-0 text-slate-400 text-xs">✕</span>
            </div>
          )
        }

        const renderBody = () => {
          // Manual mode + đang là target: render input
          if (isManual && isTarget && !(f.key === 'orderCodes' && orderCodesConfirmed)) {
            if (f.key === 'orderCodes') {
              const isAmount = subStep === 'amount'
              const placeholder = isAmount
                ? `Số tiền cho ${fields.orderCodes[pairCount - 1]?.code}`
                : `Mã đơn #${pairCount + 1} (Ctrl rỗng = xong)`
              return (
                <>
                  {hasContent && (
                    <div className="space-y-1.5 mb-2">
                      {v.map((o, idx) => renderBadge(o, idx))}
                    </div>
                  )}
                  <ManualFieldInput
                    placeholder={placeholder}
                    inputMode={isAmount ? 'numeric' : 'text'}
                    resetSignal={`${f.key}-${pairCount}-${subStep}`}
                    autoCommit={true}
                    autoUppercaseDelayMs={isAmount ? 0 : 600}
                    formatThousands={isAmount}
                    onCommit={(val) => manualHandlers?.onCommit(f.key, val)}
                  />
                </>
              )
            }
            // Field thường
            return (
              <ManualFieldInput
                placeholder={f.manualPlaceholder || ''}
                inputMode={f.manualInputMode || 'text'}
                resetSignal={`${f.key}-active`}
                autoCommit={false}
                formatThousands={f.key === 'receiptAmount'}
                onCommit={(val) => manualHandlers?.onCommit(f.key, val)}
              />
            )
          }

          // Đã có nội dung
          if (hasContent) {
            if (f.key === 'orderCodes') {
              return (
                <div className="space-y-1.5 mt-1">
                  {v.map((o, idx) => renderBadge(o, idx))}
                </div>
              )
            }
            return (
              <div className="text-sm font-mono font-semibold text-slate-900 break-words">
                {f.display(v)}
              </div>
            )
          }

          // Chưa có gì
          return <div className="text-xs text-slate-400 italic break-words">{f.example}</div>
        }

        // Bọc: manual + target → không bọc <button> (vì input bên trong)
        const Wrapper = (isManual && isTarget) ? 'div' : 'button'
        const wrapperProps = (isManual && isTarget)
          ? { className: cls }
          : { className: cls, type: 'button', onClick: () => onFieldClick(f.key) }

        return (
          <Wrapper key={f.key} {...wrapperProps}>
            <div className="flex items-center justify-between mb-1 gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {f.label}
              </span>
              {subLabel && (
                <span className="text-xs text-blue-600 font-medium truncate">{subLabel}</span>
              )}
            </div>

            {renderBody()}

            {f.key === 'orderCodes' && isTarget && !orderCodesConfirmed && (
              <div className="mt-1.5 text-[11px] text-slate-500 space-y-0.5">
                {pairCount > 0 && (
                  <div>
                    Nhấn <kbd className="px-1 bg-slate-100 border rounded">Ctrl</kbd>
                    {isManual ? ' (input rỗng) ' : ' '}để chốt và qua Tổng tiền
                  </div>
                )}
                <div>
                  Nhấn <kbd className="px-1 bg-slate-100 border rounded">Shift</kbd> để xóa đơn cuối
                  {' · '}hoặc click vào từng đơn để xóa
                </div>
              </div>
            )}
          </Wrapper>
        )
      })}
    </div>
  )
}