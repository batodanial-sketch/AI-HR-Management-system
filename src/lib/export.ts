export function downloadCsv(filename: string, columns: string[], rows: Array<Record<string, string | number | null | undefined>>) {
  const escape = (value: string | number | null | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const content = [
    columns.map(escape).join(','),
    ...rows.map(row => columns.map(column => escape(row[column])).join(','))
  ].join('\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
