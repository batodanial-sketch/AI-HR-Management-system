const xmlEscape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char])

const u16 = (bytes, offset, value) => new DataView(bytes.buffer).setUint16(offset, value & 0xffff, true)
const u32 = (bytes, offset, value) => new DataView(bytes.buffer).setUint32(offset, value >>> 0, true)

const crc32 = bytes => {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index]
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

const zipDateTime = () => {
  const now = new Date()
  const year = Math.max(1980, now.getFullYear())
  return { date: ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate(), time: (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2) }
}

const columnName = index => {
  let number = index + 1
  let output = ''
  while (number > 0) {
    const remainder = (number - 1) % 26
    output = String.fromCharCode(65 + remainder) + output
    number = Math.floor((number - 1) / 26)
  }
  return output
}

function zipStored(files) {
  const encoder = new TextEncoder()
  const stamp = zipDateTime()
  const body = []
  const directory = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name)
    const data = typeof file.content === 'string' ? encoder.encode(file.content) : file.content
    const crc = crc32(data)
    const local = new Uint8Array(30)
    u32(local, 0, 0x04034b50); u16(local, 4, 20); u16(local, 6, 0); u16(local, 8, 0)
    u16(local, 10, stamp.time); u16(local, 12, stamp.date); u32(local, 14, crc)
    u32(local, 18, data.length); u32(local, 22, data.length); u16(local, 26, name.length); u16(local, 28, 0)
    body.push(local, name, data)
    const central = new Uint8Array(46)
    u32(central, 0, 0x02014b50); u16(central, 4, 20); u16(central, 6, 20); u16(central, 8, 0); u16(central, 10, 0)
    u16(central, 12, stamp.time); u16(central, 14, stamp.date); u32(central, 16, crc); u32(central, 20, data.length); u32(central, 24, data.length)
    u16(central, 28, name.length); u16(central, 30, 0); u16(central, 32, 0); u16(central, 34, 0); u16(central, 36, 0); u32(central, 38, 0); u32(central, 42, offset)
    directory.push(central, name)
    offset += local.length + name.length + data.length
  }
  const directorySize = directory.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  u32(end, 0, 0x06054b50); u16(end, 4, 0); u16(end, 6, 0); u16(end, 8, files.length); u16(end, 10, files.length); u32(end, 12, directorySize); u32(end, 16, offset); u16(end, 20, 0)
  return new Blob([...body, ...directory, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export function downloadXlsx(filename, rows, sheetName = 'Fluxentiq report') {
  const safeRows = rows.length ? rows : [{ Report: sheetName, Message: 'No data available' }]
  const headers = Object.keys(safeRows[0])
  const matrix = [headers, ...safeRows.map(row => headers.map(header => row[header]))]
  const sheetData = matrix.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => {
    const ref = `${columnName(columnIndex)}${rowIndex + 1}`
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`
    const text = xmlEscape(value)
    return `<c r="${ref}" t="inlineStr"><is><t${/^\s|\s$/.test(text) ? ' xml:space="preserve"' : ''}>${text}</t></is></c>`
  }).join('')}</row>`).join('')
  const name = xmlEscape(sheetName.slice(0, 31))
  const workbook = zipStored([
    { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
    { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetData}</sheetData></worksheet>` }
  ])
  const url = URL.createObjectURL(workbook)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
