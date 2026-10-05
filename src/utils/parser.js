import { parseVietnameseNumber } from './vietnameseNumber.js'

const DIGIT_CHAR = {
  'không': '0', 'linh': '0', 'lẻ': '0', 'ô': '0',
  'một': '1', 'mốt': '1', 'hai': '2', 'ba': '3',
  'bốn': '4', 'tư': '4', 'năm': '5', 'lăm': '5',
  'sáu': '6', 'bảy': '7', 'bẩy': '7', 'tám': '8', 'chín': '9',
}

// Vietnamese letter pronunciation → Latin letter (for prefixes NĐ-, NG-, KH-, ...)
const LETTER_WORDS = {
  'a': 'A', 'bê': 'B', 'xê': 'C', 'dê': 'D', 'đê': 'Đ', 'đờ': 'Đ', 'e': 'E',
  'gờ': 'G', 'giê': 'G', 'hát': 'H', 'i': 'I', 'ka': 'K', 'ca': 'K',
  'lờ': 'L', 'el': 'L', 'em': 'M', 'mờ': 'M', 'en': 'N', 'nờ': 'N', 'o': 'O',
  'pê': 'P', 'phê': 'P', 'quy': 'Q', 'rờ': 'R', 'ét': 'S', 'sờ': 'S',
  'tê': 'T', 'u': 'U', 'vê': 'V', 'ích': 'X', 'xờ': 'X', 'y': 'Y',
}

function wordsToDigitString(words) {
  let out = ''
  for (const w of words) {
    if (/^\d+$/.test(w)) { out += w; continue }
    const v = DIGIT_CHAR[w]
    if (v !== undefined) out += v
  }
  return out
}

function normalize(text) {
  return (text || '').toLowerCase().replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim()
}

function findLeadingKeywordEnd(tokens, fieldName) {
  const t0 = tokens[0], t1 = tokens[1], t2 = tokens[2]
  if (fieldName === 'receiptCode' && t0 === 'phiếu' && t1 === 'thu') return (t2 === 'số') ? 3 : 2
  if (fieldName === 'date' && t0 === 'ngày') return 1
  if (fieldName === 'orderCodes' && t0 === 'mã' && t1 === 'đơn') return (t2 === 'hàng') ? 3 : 2
  if (fieldName === 'receiptAmount') {
    if (t0 === 'tổng' && (t1 === 'tiền' || t1 === 'cộng')) return 2
    if (t0 === 'số' && t1 === 'tiền') return 2
  }
  return 0
}

export function parseDate(words) {
  const d = wordsToDigitString(words)
  let day, month, year
  const y2k = (yy) => 2000 + parseInt(yy)
  if (d.length === 5) { day = +d.slice(0, 2); month = +d.slice(2, 3); year = y2k(d.slice(3, 5)) }
  else if (d.length === 6) { day = +d.slice(0, 2); month = +d.slice(2, 4); year = y2k(d.slice(4, 6)) }
  else if (d.length === 7) { day = +d.slice(0, 2); month = +d.slice(2, 3); year = +d.slice(3, 7) }
  else if (d.length === 8) { day = +d.slice(0, 2); month = +d.slice(2, 4); year = +d.slice(4, 8) }
  else return null
  if (!day || !month || !year || day > 31 || month > 12) return null
  return { day, month, year, iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` }
}

export function parseOrderCode(text) {
  const norm = normalize(text)
  const tokens = norm.split(' ').filter((t) => t && t !== '|')
  if (tokens.length === 0) return null
  let prefix = ''
  let rest = tokens
  if (tokens[0] === 'nờ' && LETTER_WORDS[tokens[1]]) {
    prefix = 'N' + LETTER_WORDS[tokens[1]] + '-'
    rest = tokens.slice(2)
  }
  const digits = wordsToDigitString(rest)
  if (!digits && !prefix) return null
  return prefix + digits
}

function parseOneOrderSegment(segmentWords) {
  if (segmentWords.length === 0) return null
  let prefix = ''
  let rest = segmentWords
  if (segmentWords[0] === 'nờ' && LETTER_WORDS[segmentWords[1]]) {
    prefix = 'N' + LETTER_WORDS[segmentWords[1]] + '-'
    rest = segmentWords.slice(2)
  }
  if (rest.length === 0) return { code: null, amount: null }

  let codeWords, amountWords
  const pipeIdx = rest.indexOf('|')
  if (pipeIdx > 0) {
    codeWords = rest.slice(0, pipeIdx)
    amountWords = rest.slice(pipeIdx + 1)
  } else if (pipeIdx === 0) {
    codeWords = []
    amountWords = rest.slice(1)
  } else {
    codeWords = [rest[0]]
    amountWords = rest.slice(1)
  }

  const digits = wordsToDigitString(codeWords)
  const code = (prefix || digits) ? (prefix + digits) : null
  const amount = amountWords.length ? parseVietnameseNumber(amountWords.join(' ')) : null
  if (!code && amount == null) return null
  return { code, amount }
}

export function parseOrderSegments(words) {
  const segments = []
  let group = []
  const flush = () => {
    if (group.length) {
      const r = parseOneOrderSegment(group)
      if (r) segments.push(r)
      group = []
    }
  }
  for (const w of words) {
    if (w === 'và' || w === 'với') { flush(); continue }
    group.push(w)
  }
  flush()
  return segments
}

export function parseForField(text, fieldName) {
  const norm = normalize(text)
  let tokens = norm.split(' ').filter(Boolean)
  const stripLen = findLeadingKeywordEnd(tokens, fieldName)
  if (stripLen > 0) tokens = tokens.slice(stripLen)
  const joined = tokens.filter((t) => t !== '|').join(' ').trim()

  switch (fieldName) {
    case 'receiptCode':
      return wordsToDigitString(tokens.filter((t) => t !== '|')) || null
    case 'date':
      return parseDate(tokens.filter((t) => t !== '|'))
    case 'orderCodes': {
      const segs = parseOrderSegments(tokens)
      const valid = segs.filter((s) => s.code)
      return valid.length ? valid : null
    }
    case 'receiptAmount':
      return parseVietnameseNumber(joined)
    default:
      return null
  }
}