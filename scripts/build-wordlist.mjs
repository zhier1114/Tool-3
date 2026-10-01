// 下載 EFF Large Wordlist，驗證 SHA-256 後產生 src/core/wordlist.ts。
// 用法：node scripts/build-wordlist.mjs
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const SOURCE_URL = 'https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt';
const SHA256 = 'addd35536511597a02fa0a9ff1e5284677b8883b83e986e43f15a3db996b903e';

const res = await fetch(SOURCE_URL);
if (!res.ok) throw new Error(`下載失敗：HTTP ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());
const hash = createHash('sha256').update(buf).digest('hex');
if (hash !== SHA256) throw new Error(`SHA-256 不符：${hash}`);

// 排除含連字號的字（drop-down、t-shirt 等），讓救援碼可以用任何非字母字元分隔。
const words = buf
  .toString('utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => line.split('\t')[1])
  .filter((w) => /^[a-z]+$/.test(w));

const out =
  `// 由 scripts/build-wordlist.mjs 產生，請勿手動修改。\n` +
  `// 來源：EFF Large Wordlist（${SOURCE_URL}），已排除含連字號的字。\n` +
  `export const WORDS: readonly string[] = '${words.join(' ')}'.split(' ');\n`;
writeFileSync(new URL('../src/core/wordlist.ts', import.meta.url), out);
console.log(`已寫入 ${words.length} 個字`);
