import { describe, expect, it } from 'vitest'
import { buildCsv, buildXlsx, crc32, downloadFilename, pivotGrid, xlsxParts } from './download'
import { makePivot } from './testing'

const dimensionLabel = (id) => ({ dx: 'Data', pe: 'Period', ou: 'Classes' }[id] ?? id)

describe('pivotGrid', () => {
  it('writes header rows, row labels and raw values', () => {
    const p = makePivot({ dx: ['m1', 'm2'], pe: ['T1', 'T2'] }, ({ dx, pe }) => (dx === 'm1' ? 1.25 : pe === 'T1' ? 3 : null),
      { columns: ['dx'], rows: ['pe'] })
    expect(pivotGrid(p, dimensionLabel)).toEqual([
      ['Period', 'dx:m1', 'dx:m2'],
      ['pe:T1', 1.25, 3],
      ['pe:T2', 1.25, ''],
    ])
  })

  it('repeats labels for nested column dimensions and names row dimensions on the last header row', () => {
    const p = makePivot({ dx: ['m'], pe: ['T1', 'T2'], ou: ['A', 'B'] }, () => 1,
      { columns: ['pe', 'dx'], rows: ['ou'] })
    const grid = pivotGrid(p, dimensionLabel)
    expect(grid.slice(0, 2)).toEqual([
      ['', 'pe:T1', 'pe:T2'],
      ['Classes', 'dx:m', 'dx:m'],
    ])
    expect(grid[2]).toEqual(['ou:A', 1, 1])
  })

  it('writes hidden cells as *', () => {
    const p = makePivot({ dx: ['m'], pe: ['T1'] }, () => ({ value: null, suppressed: true }), { columns: ['dx'], rows: ['pe'] })
    expect(pivotGrid(p, dimensionLabel)[1]).toEqual(['pe:T1', '*'])
  })

  it('leaves the row header blank without row dimensions', () => {
    const p = makePivot({ dx: ['m'], pe: ['T1'] }, () => 7, { columns: ['dx', 'pe'], rows: [] })
    expect(pivotGrid(p, dimensionLabel)).toEqual([
      ['', 'dx:m'],
      ['', 'pe:T1'],
      ['Value', 7],
    ])
  })
})

describe('buildCsv', () => {
  it('joins rows with CRLF and leaves plain fields alone', () => {
    expect(buildCsv([['a', 1], ['b', 2.5]])).toBe('a,1\r\nb,2.5')
  })

  it('quotes fields with commas, quotes or line breaks', () => {
    expect(buildCsv([['Form 1, A', 'say "hi"', 'two\nlines']])).toBe('"Form 1, A","say ""hi""","two\nlines"')
  })

  it('stops labels running as spreadsheet formulas', () => {
    expect(buildCsv([['=SUM(A1)', '+1', '-x', '@me', 'ok']])).toBe("'=SUM(A1),'+1,'-x,'@me,ok")
  })

  it('writes numbers, including negatives, as numbers', () => {
    expect(buildCsv([[-3, 0, 1e21]])).toBe('-3,0,1e+21')
  })

  it('writes empty and missing values as empty fields', () => {
    expect(buildCsv([['', null, undefined, 'x']])).toBe(',,,x')
  })
})

describe('xlsxParts', () => {
  const sheet = (grid) => xlsxParts(grid)['xl/worksheets/sheet1.xml']

  it('includes every part a workbook needs', () => {
    expect(Object.keys(xlsxParts([['a']]))).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml',
    ])
  })

  it('writes numbers as values and text as inline strings', () => {
    const xml = sheet([['Mean', 56.5]])
    expect(xml).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">Mean</t></is></c>')
    expect(xml).toContain('<c r="B1"><v>56.5</v></c>')
  })

  it('keeps formula-like labels as text', () => {
    expect(sheet([['=cmd']])).toContain('<t xml:space="preserve">=cmd</t>')
  })

  it('escapes XML and strips control characters', () => {
    const xml = sheet([['A & B <"x">\u0007']])
    expect(xml).toContain('A &amp; B &lt;&quot;x&quot;&gt;</t>')
    expect(xml).not.toContain('\u0007')
  })

  it('omits empty cells', () => {
    expect(sheet([['', null, 'x']])).toMatch(/<row r="1"><c r="C1" t="inlineStr">/)
  })

  it('names columns past Z', () => {
    const row = Array.from({ length: 28 }, (_, i) => i)
    const xml = sheet([row])
    expect(xml).toContain('<c r="Z1"><v>25</v></c>')
    expect(xml).toContain('<c r="AA1"><v>26</v></c>')
    expect(xml).toContain('<c r="AB1"><v>27</v></c>')
  })

  it('names the sheet', () => {
    expect(xlsxParts([['a']], 'Term & results')['xl/workbook.xml']).toContain('name="Term &amp; results"')
  })
})

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array())).toBe(0)
  })
})

// Reads a stored (uncompressed) ZIP through its central directory.
function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.byteLength - 22
  expect(view.getUint32(end, true)).toBe(0x06054b50)
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const entries = {}
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50)
    const method = view.getUint16(at + 10, true)
    const crc = view.getUint32(at + 16, true)
    const size = view.getUint32(at + 20, true)
    const nameLen = view.getUint16(at + 28, true)
    const offset = view.getUint32(at + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen))
    expect(view.getUint32(offset, true)).toBe(0x04034b50)
    const localNameLen = view.getUint16(offset + 26, true)
    const data = bytes.subarray(offset + 30 + localNameLen, offset + 30 + localNameLen + size)
    entries[name] = { method, crc, data: new TextDecoder().decode(data), crcOk: crc32(data) === crc }
    at += 46 + nameLen
  }
  return entries
}

describe('buildXlsx', () => {
  it('zips every part, stored and checksummed', async () => {
    const grid = [['Period', 'Ünïcode ✓'], ['T1', 12]]
    const blob = buildXlsx(grid)
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const entries = readZip(new Uint8Array(await blob.arrayBuffer()))
    const parts = xlsxParts(grid)
    expect(Object.keys(entries)).toEqual(Object.keys(parts))
    for (const [name, text] of Object.entries(parts)) {
      expect(entries[name].data).toBe(text)
      expect(entries[name].method).toBe(0)
      expect(entries[name].crcOk).toBe(true)
    }
  })
})

describe('downloadFilename', () => {
  it('dates the file', () => {
    expect(downloadFilename()).toMatch(/^shule-analytics-\d{4}-\d{2}-\d{2}$/)
  })
})
