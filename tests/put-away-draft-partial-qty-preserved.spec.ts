/**
 * Bug (Notion Bugs page): put-away, scan a plain SKU's qty from 0→1, Save as draft,
 * Continue put-away → the qty that was 1 came back as 0. Two root causes, both fixed:
 *   1) getPutAwayLineItems echoed the drafted qty as the "Received qty" ceiling for
 *      plain SKUs, shrinking it (2 received → showed 1) and losing the remainder.
 *   2) PutAwayItemsPage seeded every draft row's qty at 0 instead of its saved `stored`.
 * This pins the data-layer contract: after a partial draft, `qty` (ceiling) stays the
 * full received total and `stored` (progress) reflects what was put away.
 */
import { describe, it, expect } from 'vitest'
import { receipts } from '~/data/receipts'
import { DEMO_RECEIPT_ID } from '~/data/receiptLineItems'
import { createReceivingTask, startReceiving, endReceiving } from '~/data/receivingTasks'
import { addPutAwayTask, startPutAway, savePutAwayDraft } from '~/data/putAwayTasks'
import { getPutAwayLineItems } from '~/data/putAwayTaskDetails'

const WH = 'wh-006', PLAIN = '3004' // Coffee Scale — plain SKU

describe('Put-away partial draft — qty ceiling + stored progress preserved on reopen', () => {
  it('save draft of 1 of 2 received → ceiling stays 2, stored is 1', () => {
    const receipt = receipts.find((r) => r.id === DEMO_RECEIPT_ID)!
    const rt = createReceivingTask({ receiptId: receipt.id, assignee: 'Op', skus: [PLAIN] })!
    startReceiving(rt.id)
    endReceiving(rt.id, { [PLAIN]: 2 }) // 2 physically received
    const pa = addPutAwayTask({ receivingTaskIds: [rt.id], receivingTaskNos: [rt.taskNo], warehouseId: WH, warehouseName: 'x', assignee: 'Op' })
    startPutAway(pa.id)

    // Put away only 1 of 2, then save as a draft (Continue later).
    savePutAwayDraft(pa.id, [{ skuCode: PLAIN, qty: 1, binLocation: 'Bin 04' }])

    const row = getPutAwayLineItems(pa.id).find((r) => r.skuCode === PLAIN)!
    expect(row.qty).toBe(2)    // Received qty ceiling — NOT shrunk to the drafted 1
    expect(row.stored).toBe(1) // progress restored — the 1 that was put away
    expect(row.binLocation).toBe('Bin 04')
  })

  it('fully drafting all received keeps ceiling and stored equal', () => {
    const receipt = receipts.find((r) => r.id === DEMO_RECEIPT_ID)!
    const rt = createReceivingTask({ receiptId: receipt.id, assignee: 'Op', skus: [PLAIN] })!
    startReceiving(rt.id)
    endReceiving(rt.id, { [PLAIN]: 2 })
    const pa = addPutAwayTask({ receivingTaskIds: [rt.id], receivingTaskNos: [rt.taskNo], warehouseId: WH, warehouseName: 'x', assignee: 'Op' })
    startPutAway(pa.id)
    savePutAwayDraft(pa.id, [{ skuCode: PLAIN, qty: 2, binLocation: 'Bin 04' }])

    const row = getPutAwayLineItems(pa.id).find((r) => r.skuCode === PLAIN)!
    expect(row.qty).toBe(2)
    expect(row.stored).toBe(2)
  })
})
