import type jsPDF from 'jspdf'

/**
 * Stamps a solid "CANCELED" banner across the top of every page, so a
 * canceled task's printed slip can never be mistaken for a still-valid one
 * once handed to a warehouse operator or courier.
 */
export function drawCanceledRibbon(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages()
  const pageWidth = doc.internal.pageSize.getWidth()
  const bandHeight = 26

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)

    doc.setFillColor(200, 40, 40)
    doc.rect(0, 0, pageWidth, bandHeight, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(255, 255, 255)
    doc.text('CANCELED — THIS DOCUMENT IS NO LONGER VALID', pageWidth / 2, bandHeight / 2, {
      align: 'center',
      baseline: 'middle',
    })
  }
}
