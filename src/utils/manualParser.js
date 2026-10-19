/**
 * Các hàm parse dành riêng cho chế độ nhập tay.
 * Chấp nhận input "thô" người dùng gõ bằng bàn phím.
 */

const y2k = (yy) => 2000 + parseInt(yy, 10)

/**
 * Parse ngày từ chuỗi tay. Hỗ trợ:
 *   Có dấu phân cách:
 *     - "29/4/2026", "29-4-26", "29.4.26"
 *   Chỉ digits, năm hiện tại khi không nhập năm:
 *     - "14"      → DM        → 01/04/<thisYear>
 *     - "014"     → DDM       → 01/04/<thisYear>  (= "113" → 11/03)
 *     - "0104"    → DDMM      → 01/04/<thisYear>
 *     - "01426"   → DDMYY     → 01/04/2026
 *     - "011025"  → DDMMYY    → 01/10/2025
 *     - "2912025" → DDMYYYY   → 29/12/0025  (hiếm; vẫn parse theo rule)
 *     - "01102025"→ DDMMYYYY  → 01/10/2025
 *
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

  // Digits-only
  const d = s.replace(/\D/g, '')
  if (!d) return null

  const curYear = new Date().getFullYear()
  let day, month, year
  switch (d.length) {
    case 2: // DM — "14" = 1/4
      day = +d[0]; month = +d[1]; year = curYear
      break
    case 3: // DDM — "113" = 11/3; "014" = 01/4
      day = +d.slice(0, 2); month = +d.slice(2, 3); year = curYear
      break
    case 4: // DDMM — "2912" = 29/12; "0104" = 01/04
      day = +d.slice(0, 2); month = +d.slice(2, 4); year = curYear
      break
    case 5: // DDMYY — "11326" = 11/3/26
      day = +d.slice(0, 2); month = +d.slice(2, 3); year = y2k(d.slice(3, 5))
      break
    case 6: // DDMMYY
      day = +d.slice(0, 2); month = +d.slice(2, 4); year = y2k(d.slice(4, 6))
      break
    case 7: // DDMYYYY
      day = +d.slice(0, 2); month = +d.slice(2, 3); year = +d.slice(3, 7)
      break
    case 8: // DDMMYYYY
      day = +d.slice(0, 2); month = +d.slice(2, 4); year = +d.slice(4, 8)
      break
    default:
      return null
  }
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

/** Mã đơn hàng: chuẩn hoá uppercase, giữ chữ-số-dấu gạch (có giữ dấu tiếng Việt viết hoa). */
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