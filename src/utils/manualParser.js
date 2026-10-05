/**
 * Các hàm parse dành riêng cho chế độ nhập tay.
 * Chấp nhận input "thô" người dùng gõ bằng bàn phím.
 */

const y2k = (yy) => 2000 + parseInt(yy, 10)

/**
 * Parse ngày từ chuỗi tay. Hỗ trợ:
 *   - "29/4/2026", "29-4-26", "29.4.26"
 *   - "290426", "29042026", "2942026", "29426" (DDMYY)
 * Trả về { day, month, year, iso } hoặc null.
 */
export function parseDateManual(text) {
  if (!text) return null
  const s = text.trim()

  // Format có dấu phân cách
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/)
  if (m) {
    const day = +m[1], month = +m[2]
    const y = m[3]
    const year = y.length === 2 ? y2k(y) : +y
    return buildDate(day, month, year)
  }

  // Format chỉ gồm digits
  const d = s.replace(/\D/g, '')
  let day, month, year
  if (d.length === 5) { day = +d.slice(0, 2); month = +d.slice(2, 3); year = y2k(d.slice(3, 5)) }
  else if (d.length === 6) { day = +d.slice(0, 2); month = +d.slice(2, 4); year = y2k(d.slice(4, 6)) }
  else if (d.length === 7) { day = +d.slice(0, 2); month = +d.slice(2, 3); year = +d.slice(3, 7) }
  else if (d.length === 8) { day = +d.slice(0, 2); month = +d.slice(2, 4); year = +d.slice(4, 8) }
  else return null
  return buildDate(day, month, year)
}

function buildDate(day, month, year) {
  if (!day || !month || !year || day > 31 || month > 12 || year < 1900) return null
  return {
    day, month, year,
    iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  }
}

/** Số phiếu thu: giữ nguyên digits do user gõ. */
export function parseReceiptCodeManual(text) {
  if (!text) return null
  const digits = text.replace(/\D/g, '')
  return digits || null
}

/** Mã đơn hàng: chuẩn hoá uppercase, giữ chữ-số-dấu gạch. */
export function parseOrderCodeManual(text) {
  if (!text) return null
  const cleaned = text.trim().toUpperCase().replace(/[^A-ZĐĂÂÊÔƠƯ0-9\-]/g, '')
  return cleaned || null
}

/** Số tiền (receiptAmount hoặc amount của order): trích digits. */
export function parseAmountManual(text) {
  if (!text) return null
  const digits = text.replace(/\D/g, '')
  if (!digits) return null
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : null
}