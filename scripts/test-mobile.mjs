import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const code = await readFile(new URL('../js/mobile.js', import.meta.url), 'utf8');

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log('PASS ' + label);
    return;
  }
  failures.push(label);
  console.log('FAIL ' + label, detail === undefined ? '' : detail);
}

class FileReaderStub {
  readAsDataURL(blob) {
    blob
      .arrayBuffer()
      .then((buffer) => {
        const base64 = Buffer.from(buffer).toString('base64');
        this.result = 'data:' + (blob.type || '') + ';base64,' + base64;
        if (this.onload) this.onload();
      })
      .catch((error) => {
        this.error = error;
        if (this.onerror) this.onerror();
      });
  }
}

function makeSandbox(options) {
  const opts = options || {};
  const opened = [];
  const notifications = [];
  const writes = [];
  const shares = [];
  const queue = [];
  const Plugins = {};

  if (opts.pdfOpener !== false) {
    Plugins.PdfOpener = {
      getPendingPdf: async () => queue.shift() || {}
    };
  }
  if (opts.save !== false) {
    Plugins.Filesystem = {
      writeFile: async (writeOptions) => {
        writes.push(writeOptions);
        return { uri: 'file:///data/cache/' + writeOptions.path };
      }
    };
    Plugins.Share = {
      share: async (shareOptions) => {
        shares.push(shareOptions);
        if (opts.shareFails) throw new Error('dibatalkan');
        return {};
      }
    };
  }

  const window = {
    Capacitor: { isNativePlatform: () => true, Plugins },
    SignPdf: {
      openFile: (file) => {
        opened.push(file);
        return Promise.resolve();
      },
      notify: (message, isError) => notifications.push({ message, isError })
    },
    addEventListener() {}
  };

  const sandbox = {
    window,
    document: { hidden: false, addEventListener() {} },
    console,
    atob,
    File,
    Blob,
    FileReader: FileReaderStub,
    Uint8Array,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {}
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'mobile.js' });
  return { api: window.SignPdfMobile, opened, notifications, writes, shares, queue };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

async function testOpenFromOtherApp() {
  const ctx = makeSandbox();
  await tick();
  check('API tersedia di platform native', !!ctx.api);
  check('savePdf terpasang saat plugin lengkap', ctx.api && typeof ctx.api.savePdf === 'function');

  const bytes = Buffer.from('%PDF-1.4 contoh');
  ctx.queue.push({
    name: 'dari-wa.pdf',
    data: bytes.toString('base64'),
    size: bytes.length,
    mimeType: 'application/pdf'
  });
  await ctx.api.checkPending();
  await tick();

  const file = ctx.opened[0];
  check('PDF dari intent diteruskan ke openFile', !!file && file.name === 'dari-wa.pdf');
  const received = file ? Buffer.from(await file.arrayBuffer()) : Buffer.alloc(0);
  check('Isi PDF utuh setelah decode base64', received.equals(bytes));

  ctx.queue.push({ error: 'PDF terlalu besar. Maksimal 25 MB.' });
  await ctx.api.checkPending();
  const last = ctx.notifications[0];
  check('Error intent ditampilkan sebagai notifikasi', !!last && last.isError === true);
  check('Antrean kosong tidak membuka PDF lagi', ctx.opened.length === 1);
}

async function testSavePdf() {
  const ctx = makeSandbox();
  const paper = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  const result = await ctx.api.savePdf(new Blob([paper], { type: 'application/pdf' }), 'surat final (ttd).pdf');
  await tick();

  const write = ctx.writes[0];
  check('writeFile memakai direktori CACHE', !!write && write.directory === 'CACHE');
  check('Nama file dibersihkan', !!write && write.path === 'surat-final-ttd-.pdf');
  check('Data PDF dikirim sebagai base64', !!write && write.data === 'JVBERg==');

  const share = ctx.shares[0];
  check('Share menerima URI file cache', !!share && share.files[0] === 'file:///data/cache/surat-final-ttd-.pdf');
  check('Judul share memakai nama asli', !!share && share.title === 'surat final (ttd).pdf');
  check('savePdf melaporkan share berhasil', !!result && result.shared === true);
}

async function testShareCancelled() {
  const ctx = makeSandbox({ shareFails: true });
  const result = await ctx.api.savePdf(new Blob([new Uint8Array([1])], { type: 'application/pdf' }), 'x.pdf');
  check('Share batal menghasilkan shared=false', !!result && result.shared === false && !!result.uri);
}

function testMissingPlugins() {
  const noSave = makeSandbox({ save: false });
  check('savePdf tidak dipasang tanpa Filesystem/Share', !noSave.api || typeof noSave.api.savePdf !== 'function');

  const noOpener = makeSandbox({ pdfOpener: false });
  check('Integrasi native nonaktif tanpa PdfOpener', noOpener.api === undefined);
}

await testOpenFromOtherApp();
await testSavePdf();
await testShareCancelled();
testMissingPlugins();

if (failures.length) {
  console.log('\n' + failures.length + ' pengujian gagal.');
  process.exit(1);
}
console.log('\nSemua pengujian mobile.js lulus.');
