/* Native (Capacitor) integration: receive PDFs from other apps and share the signed result. */
(function () {
  'use strict';

  const Capacitor = window.Capacitor;
  if (!Capacitor || typeof Capacitor.isNativePlatform !== 'function' || !Capacitor.isNativePlatform()) {
    return;
  }

  // Jembatan native Capacitor mengisi Capacitor.Plugins, bukan Capacitor.registerPlugin.
  const Plugins = Capacitor.Plugins || {};
  const PdfOpener = Plugins.PdfOpener;
  const Filesystem = Plugins.Filesystem;
  const Share = Plugins.Share;
  if (!PdfOpener) return;

  const POLL_INTERVAL = 1500;
  let pollTimer = 0;
  let checking = false;
  let opening = false;

  function notify(message, isError) {
    const app = window.SignPdf;
    if (app && typeof app.notify === 'function') app.notify(message, isError);
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const result = String(reader.result || '');
        resolve(result.slice(result.indexOf(',') + 1));
      };
      reader.onerror = function () { reject(reader.error || new Error('Gagal membaca PDF.')); };
      reader.readAsDataURL(blob);
    });
  }

  function openPayload(payload) {
    if (!payload || !payload.data || opening) return;
    const app = window.SignPdf;
    if (!app || typeof app.openFile !== 'function') return;

    opening = true;
    try {
      const bytes = base64ToBytes(payload.data);
      const name = payload.name || 'dokumen.pdf';
      const file = new File([bytes], name, { type: 'application/pdf' });
      Promise.resolve(app.openFile(file)).finally(function () {
        opening = false;
      });
    } catch (error) {
      opening = false;
      notify('File PDF dari aplikasi lain gagal dibuka.', true);
    }
  }

  async function checkPending() {
    if (checking) return;
    checking = true;
    try {
      const result = await PdfOpener.getPendingPdf();
      if (result && result.error) {
        notify(result.error, true);
      } else if (result && result.data) {
        openPayload(result);
      }
    } catch (error) {
      /* Plugin native belum tersedia (misalnya saat dijalankan di browser). */
    } finally {
      checking = false;
    }
  }

  function startPolling() {
    if (!window.SignPdf) {
      setTimeout(startPolling, 200);
      return;
    }
    checkPending();
    clearInterval(pollTimer);
    pollTimer = setInterval(checkPending, POLL_INTERVAL);
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) checkPending();
  });
  window.addEventListener('focus', checkPending);

  startPolling();

  async function savePdf(blob, fileName) {
    const data = await blobToBase64(blob);
    const safeName = String(fileName || 'dokumen-bertanda-tangan.pdf').replace(/[^A-Za-z0-9._-]+/g, '-');
    const written = await Filesystem.writeFile({
      path: safeName,
      data: data,
      directory: 'CACHE'
    });

    try {
      await Share.share({
        title: fileName,
        text: 'PDF bertanda tangan',
        files: [written.uri],
        dialogTitle: 'Simpan atau bagikan PDF'
      });
      return { shared: true, uri: written.uri };
    } catch (error) {
      return { shared: false, uri: written.uri };
    }
  }

  window.SignPdfMobile = {
    checkPending: checkPending
  };
  if (Filesystem && Share) {
    window.SignPdfMobile.savePdf = savePdf;
  }
})();
