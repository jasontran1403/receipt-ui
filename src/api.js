const BASE = '/api'

export async function lookupOrders(codes) {
  const r = await fetch(`${BASE}/lookup/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codes }),
  })
  if (!r.ok) throw new Error('lookup failed')
  return r.json()
}

export async function validateReceipt(receiptCode, receiptDate) {
  const r = await fetch(`${BASE}/receipts/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ receiptCode, receiptDate }),
  })
  if (!r.ok) throw new Error('validate failed')
  return r.json()
}

export async function saveReceipt(payload) {
  const r = await fetch(`${BASE}/receipts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (r.status === 409) {
    const err = await r.json()
    const e = new Error(err.message || 'Duplicate')
    e.code = 'duplicate'
    e.payload = err
    throw e
  }
  if (!r.ok) throw new Error('save failed')
  return r.json()
}

export async function listReceipts() {
  const r = await fetch(`${BASE}/receipts`)
  if (!r.ok) throw new Error('list failed')
  return r.json()
}

/**
 * Đánh dấu phiếu đã xử lý lên Misa.
 * processed=false để bỏ đánh dấu.
 */
export async function markReceiptMisa(id, processed = true) {
  const r = await fetch(`${BASE}/receipts/${id}/misa`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ processed }),
  })
  if (!r.ok) throw new Error('mark misa failed')
  return r.json()
}