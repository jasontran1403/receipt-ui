// Parse Vietnamese spoken numbers to integer.
// Handles Chrome quirks: pure numeric ("3600000"), mixed ("3 triệu 6"),
// decimal separators ("3.600.000"), and no-scale digit sequences.

const DIGITS = {
  'không': 0, 'linh': 0, 'lẻ': 0,
  'một': 1, 'mốt': 1,
  'hai': 2,
  'ba': 3,
  'bốn': 4, 'tư': 4,
  'năm': 5, 'lăm': 5,
  'sáu': 6,
  'bảy': 7, 'bẩy': 7,
  'tám': 8,
  'chín': 9,
}

function parseUnder1000(words) {
  let hundreds = 0, tens = 0, units = 0
  let i = 0
  while (i < words.length) {
    const w = words[i]
    const next = words[i + 1]
    if (w === 'mười') { tens = 1; i++; continue }
    if (w === 'linh' || w === 'lẻ') { i++; continue }

    if (/^\d+$/.test(w)) {
      const n = parseInt(w, 10)
      if (n < 10) {
        if (next === 'trăm')      { hundreds = n; i += 2 }
        else if (next === 'mươi') { tens = n;     i += 2 }
        else                      { units = n;    i += 1 }
      } else if (n < 100) {
        tens = Math.floor(n / 10); units = n % 10; i += 1
      } else if (n < 1000) {
        hundreds = Math.floor(n / 100); tens = Math.floor((n % 100) / 10); units = n % 10; i += 1
      } else {
        return n
      }
      continue
    }

    if (DIGITS[w] !== undefined) {
      const d = DIGITS[w]
      if (next === 'trăm')      { hundreds = d; i += 2 }
      else if (next === 'mươi') { tens = d;     i += 2 }
      else                      { units = d;    i += 1 }
      continue
    }
    i++
  }
  return hundreds * 100 + tens * 10 + units
}

export function parseVietnameseNumber(text) {
  if (!text) return null
  let clean = text.toLowerCase().replace(/đồng/g, ' ').trim()

  // Pure numeric transcript
  if (/^[\d\s.,]+$/.test(clean)) {
    const n = parseInt(clean.replace(/[\s.,]/g, ''), 10)
    return isNaN(n) || n === 0 ? null : n
  }

  clean = clean.replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!clean) return null
  const words = clean.split(' ')
  const SCALES = { 'tỷ': 1_000_000_000, 'tỉ': 1_000_000_000, 'triệu': 1_000_000, 'nghìn': 1_000, 'ngàn': 1_000 }

  // No scale words → treat as digit-string ("một sáu hai ba năm không một" -> 1623501)
  const hasScale = words.some((w) => SCALES[w] !== undefined)
  if (!hasScale) {
    let ds = ''
    for (const w of words) {
      if (/^\d+$/.test(w)) { ds += w; continue }
      if (DIGITS[w] !== undefined) { ds += DIGITS[w]; continue }
    }
    if (!ds) return null
    const n = parseInt(ds, 10)
    return isNaN(n) || n === 0 ? null : n
  }

  let total = 0
  let buf = []
  let lastScale = null
  for (const w of words) {
    if (SCALES[w] !== undefined) {
      total += parseUnder1000(buf) * SCALES[w]
      buf = []
      lastScale = SCALES[w]
    } else {
      buf.push(w)
    }
  }

  const remainderVal = parseUnder1000(buf)
  const isSingleDigit = buf.length === 1 &&
    (DIGITS[buf[0]] !== undefined || /^\d$/.test(buf[0]))
  if (isSingleDigit && lastScale && lastScale >= 1_000_000) {
    total += remainderVal * (lastScale / 10)
  } else {
    total += remainderVal
  }
  return total || null
}