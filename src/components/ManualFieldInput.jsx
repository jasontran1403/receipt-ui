import { useEffect, useRef, useState } from 'react'

/**
 * Input thủ công: Ctrl hoặc Enter để commit.
 * Combo tracking: Ctrl+phím-khác (copy/paste/select-all...) KHÔNG commit.
 *
 * Props:
 *  - placeholder            : hint text
 *  - onCommit(val)          : gọi khi user commit (có thể là chuỗi rỗng)
 *  - resetSignal            : đổi value này sẽ clear + focus lại input
 *  - inputMode              : 'numeric' | 'text' | ...
 *  - autoCommit             : nếu true, commit kể cả khi value rỗng (dùng để "chốt orderCodes")
 *  - autoUppercaseDelayMs   : >0 → sau N ms không gõ thêm sẽ tự uppercase (tiếng Việt OK)
 *  - formatThousands        : true → live format số với dấu "." phân cách hàng ngàn
 *                             (strip non-digits; giữ cursor dựa trên số-digits-trước-cursor)
 */
export default function ManualFieldInput({
  placeholder,
  onCommit,
  resetSignal,
  inputMode = 'text',
  autoCommit = true,
  autoUppercaseDelayMs = 0,
  formatThousands = false,
}) {
  const [val, setVal] = useState('')
  const inputRef = useRef(null)
  const ctrlComboRef = useRef(false)
  const uppercaseTimerRef = useRef(null)

  const clearUppercaseTimer = () => {
    if (uppercaseTimerRef.current) {
      clearTimeout(uppercaseTimerRef.current)
      uppercaseTimerRef.current = null
    }
  }

  // Reset + focus mỗi khi resetSignal đổi
  useEffect(() => {
    clearUppercaseTimer()
    setVal('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [resetSignal])

  // Cleanup on unmount
  useEffect(() => clearUppercaseTimer, [])

  const scheduleUppercase = () => {
    if (!autoUppercaseDelayMs) return
    clearUppercaseTimer()
    uppercaseTimerRef.current = setTimeout(() => {
      uppercaseTimerRef.current = null
      const el = inputRef.current
      if (!el) return
      const upper = el.value.toUpperCase()
      if (upper === el.value) return
      const start = el.selectionStart
      const end = el.selectionEnd
      setVal(upper)
      requestAnimationFrame(() => {
        if (inputRef.current === el && document.activeElement === el) {
          try { el.setSelectionRange(start, end) } catch { /* no-op */ }
        }
      })
    }, autoUppercaseDelayMs)
  }

  const commit = () => {
    clearUppercaseTimer()
    const trimmed = val.trim()
    if (!trimmed && !autoCommit) return
    onCommit(trimmed)
    setVal('')
  }

  /** Format "1234567" → "1.234.567" */
  const addThousandSep = (digits) =>
    digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

  const onChange = (e) => {
    const input = e.target
    const newVal = input.value
    const cursorPos = input.selectionStart ?? newVal.length

    if (formatThousands) {
      // Đếm số digits trước cursor trong value NGƯỜI DÙNG VỪA GÕ
      let digitsBeforeCursor = 0
      for (let i = 0; i < cursorPos; i++) {
        if (/\d/.test(newVal[i])) digitsBeforeCursor++
      }

      const raw = newVal.replace(/\D/g, '')
      const formatted = addThousandSep(raw)
      setVal(formatted)

      // Khôi phục cursor: đặt sau đủ "digitsBeforeCursor" chữ số trong chuỗi đã format
      requestAnimationFrame(() => {
        if (document.activeElement !== input) return
        let newPos = 0
        let seen = 0
        while (newPos < formatted.length && seen < digitsBeforeCursor) {
          if (/\d/.test(formatted[newPos])) seen++
          newPos++
        }
        try { input.setSelectionRange(newPos, newPos) } catch { /* no-op */ }
      })
      return
    }

    setVal(newVal)
    scheduleUppercase()
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
      return
    }
    // Nhấn Ctrl + phím khác → combo (Ctrl keyup KHÔNG commit)
    if (e.ctrlKey && e.key !== 'Control') {
      ctrlComboRef.current = true
    }
  }

  const onKeyUp = (e) => {
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
      if (ctrlComboRef.current) {
        ctrlComboRef.current = false
        return
      }
      commit()
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode={inputMode}
      value={val}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      placeholder={placeholder}
      autoFocus
      onBlur={() => {
        setTimeout(() => {
          const active = document.activeElement
          if (!active || active === document.body) {
            inputRef.current?.focus()
          }
        }, 0)
      }}
      className="w-full px-2 py-1.5 text-sm font-mono bg-white border border-blue-400
                 rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
    />
  )
}