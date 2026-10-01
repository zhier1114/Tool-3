import { describe, expect, it } from 'vitest';
import { exportCsv } from '../../src/core/csv';
import { makeEntry, vaultOf } from '../helpers';

describe('exportCsv', () => {
  it('writes a BOM, a Chinese header row and CRLF line endings', () => {
    const csv = exportCsv(vaultOf());
    expect(csv).toBe('\uFEFF標題,網站,帳號,密碼,備註,標籤,更新日期\r\n');
  });

  it('quotes fields containing commas, quotes, newlines or edge spaces', () => {
    const csv = exportCsv(
      vaultOf(
        makeEntry({
          title: 'A, B',
          password: 'he said "hi"',
          notes: 'line1\nline2',
          username: ' padded ',
          tags: ['work', 'dev'],
          updatedAt: '2026-01-02T03:04:05.000Z',
        }),
      ),
    );
    const row = csv.split('\r\n')[1];
    expect(row).toBe(
      '"A, B",https://github.com," padded ","he said ""hi""","line1\nline2",work;dev,2026-01-02T03:04:05.000Z',
    );
  });

  it('skips entries in the trash', () => {
    const csv = exportCsv(vaultOf(makeEntry({ id: 'x', title: 'Gone', trashedAt: '2026-01-01T00:00:00.000Z' })));
    expect(csv).not.toContain('Gone');
  });
});
