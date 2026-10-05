export function formatMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return ''
  return new Intl.NumberFormat('vi-VN').format(n)
}
