/* App wiring: signature creation, library, PDF open/export. */
(function () {
  'use strict';

  function $(selector) {
    return document.querySelector(selector);
  }

  function $$(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  }

  const elements = {
    fileInput: $('#fileInput'),
    btnOpen: $('#btnOpen'),
    btnDownload: $('#btnDownload'),
    sigCanvas: $('#sigCanvas'),
    sigPlaceholder: $('#sigPlaceholder'),
    strokeWidth: $('#strokeWidth'),
    strokeValue: $('#strokeValue'),
    btnUndo: $('#btnUndo'),
    btnClear: $('#btnClear'),
    btnUseDrawn: $('#btnUseDrawn'),
    sigDrop: $('#sigDrop'),
    sigFileInput: $('#sigFileInput'),
    uploadPreviewWrap: $('#uploadPreviewWrap'),
    uploadThumb: $('#uploadThumb'),
    removeWhite: $('#removeWhite'),
    btnUseUpload: $('#btnUseUpload'),
    libGrid: $('#libGrid'),
    libEmpty: $('#libEmpty'),
    activeBadge: $('#activeBadge'),
    placeHint: $('#placeHint'),
    selControls: $('#selControls'),
    selSize: $('#selSize'),
    selSizeValue: $('#selSizeValue'),
    btnDeleteSel: $('#btnDeleteSel'),
    stage: $('#pageStage'),
    pageWrap: $('#pageWrap'),
    canvas: $('#pdfCanvas'),
    layer: $('#sigLayer'),
    scroll: $('#viewerScroll'),
    emptyState: $('#emptyState'),
    pageLabel: $('#pageLabel'),
    btnPrev: $('#btnPrev'),
    btnNext: $('#btnNext'),
    btnZoomIn: $('#btnZoomIn'),
    btnZoomOut: $('#btnZoomOut'),
    btnFit: $('#btnFit'),
    zoomLabel: $('#zoomLabel'),
    viewerStatus: $('#viewerStatus'),
    dropOverlay: $('#dropOverlay'),
    toast: $('#toast'),
    confirmModal: $('#confirmModal'),
    confirmTitle: $('#confirmTitle'),
    confirmMessage: $('#confirmMessage'),
    confirmCancel: $('#confirmCancel'),
    confirmOk: $('#confirmOk')
  };

  const downloadLabel = elements.btnDownload.innerHTML;
  const signatures = [];
  let activeSignatureId = null;
  let uploadResult = null;
  let uploadFile = null;
  let signatureCounter = 0;
  let toastTimer = 0;

  const pad = new SignaturePad(elements.sigCanvas);

  const editor = new PdfEditor({
    canvas: elements.canvas,
    layer: elements.layer,
    stage: elements.stage,
    pageWrap: elements.pageWrap,
    scrollEl: elements.scroll,
    emptyState: elements.emptyState,
    getSignature: function (id) {
      return signatures.find((item) => item.id === id);
    },
    onChange: syncUi,
    onSelectionChange: syncSelection,
    onError: function (error) {
      toast(error.message, true);
    }
  });

  /* ===== Toast ===== */
  function toast(message, isError) {
    const el = elements.toast;
    el.textContent = message;
    el.classList.toggle('is-error', !!isError);
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('is-visible');
    }, 3800);
  }

  /* ===== Confirm dialog ===== */
  let confirmResolve = null;
  let lastFocused = null;

  function closeConfirm(accepted) {
    if (!confirmResolve) return;
    const resolve = confirmResolve;
    confirmResolve = null;
    elements.confirmModal.classList.add('is-hidden');
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    lastFocused = null;
    resolve(accepted);
  }

  function requestConfirm(options) {
    if (confirmResolve) closeConfirm(false);
    elements.confirmTitle.textContent = options.title || 'Lanjutkan?';
    elements.confirmMessage.textContent = options.message || '';
    elements.confirmOk.textContent = options.okLabel || 'Lanjutkan';
    elements.confirmCancel.textContent = options.cancelLabel || 'Batal';
    lastFocused = document.activeElement;
    elements.confirmModal.classList.remove('is-hidden');
    elements.confirmCancel.focus();
    return new Promise(function (resolve) {
      confirmResolve = resolve;
    });
  }

  elements.confirmOk.addEventListener('click', function () { closeConfirm(true); });
  elements.confirmCancel.addEventListener('click', function () { closeConfirm(false); });
  elements.confirmModal.addEventListener('pointerdown', function (event) {
    if (event.target === elements.confirmModal) closeConfirm(false);
  });

  /* ===== Library ===== */
  function addSignature(signature, source) {
    signatureCounter += 1;
    const entry = {
      id: 'signature-' + Date.now().toString(36) + '-' + signatureCounter,
      dataUrl: signature.dataUrl,
      width: signature.width,
      height: signature.height,
      source: source
    };
    signatures.push(entry);
    activeSignatureId = entry.id;
    editor.setActiveSignature(activeSignatureId);
    renderLibrary();
    updatePlacementHint();
    toast('Tanda tangan siap. Klik halaman PDF untuk menempel.');
    return entry;
  }

  function setActiveSignature(id) {
    activeSignatureId = id;
    editor.setActiveSignature(id);
    renderLibrary();
    updatePlacementHint();
  }

  function toggleActiveSignature(id) {
    setActiveSignature(activeSignatureId === id ? null : id);
  }

  function removeSignature(id) {
    if (editor.placements.some(function (p) { return p.sigId === id; })) {
      toast('Tanda tangan ini masih ditempel di PDF. Hapus dari halaman terlebih dahulu.', true);
      return;
    }
    const index = signatures.findIndex(function (item) { return item.id === id; });
    if (index === -1) return;
    signatures.splice(index, 1);
    if (activeSignatureId === id) setActiveSignature(null);
    renderLibrary();
    updatePlacementHint();
  }

  function renderLibrary() {
    elements.libGrid.textContent = '';
    elements.libEmpty.classList.toggle('is-hidden', signatures.length > 0);

    signatures.forEach(function (signature) {
      const item = document.createElement('div');
      item.className = 'lib-item' + (signature.id === activeSignatureId ? ' is-active' : '');

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lib-item-btn';
      button.title = 'Klik untuk menempelkan tanda tangan ini';
      button.setAttribute('aria-label', 'Gunakan tanda tangan');
      const img = document.createElement('img');
      img.src = signature.dataUrl;
      img.alt = 'Tanda tangan';
      button.appendChild(img);
      button.addEventListener('click', function () {
        toggleActiveSignature(signature.id);
      });

      const meta = document.createElement('div');
      meta.className = 'lib-meta';
      const label = document.createElement('span');
      label.textContent = signature.source === 'upload' ? 'Unggahan' : 'Gambar';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'lib-remove';
      remove.textContent = '×';
      remove.title = 'Hapus dari daftar';
      remove.setAttribute('aria-label', 'Hapus tanda tangan dari daftar');
      remove.addEventListener('click', function (event) {
        event.stopPropagation();
        removeSignature(signature.id);
      });
      meta.appendChild(label);
      meta.appendChild(remove);

      item.appendChild(button);
      item.appendChild(meta);
      elements.libGrid.appendChild(item);
    });
  }

  function updatePlacementHint() {
    const hasDoc = editor.hasDocument;
    const active = !!activeSignatureId;
    let text;
    if (!hasDoc) {
      text = signatures.length
        ? 'Buka PDF untuk mulai menempelkan tanda tangan.'
        : 'Buat tanda tangan, lalu buka PDF untuk menempelkannya.';
    } else if (!signatures.length) {
      text = 'Buat tanda tangan di langkah 1 untuk mulai menempel.';
    } else if (!active) {
      text = 'Pilih salah satu tanda tangan di daftar, lalu klik halaman PDF.';
    } else {
      text = 'Klik pada halaman PDF untuk menempelkan tanda tangan aktif.';
    }
    elements.placeHint.textContent = text;
    elements.activeBadge.classList.toggle('is-hidden', !active);
  }

  /* ===== Drawing tab ===== */
  pad.onChange = function (empty) {
    elements.btnUseDrawn.disabled = empty;
    elements.btnUndo.disabled = empty;
    elements.btnClear.disabled = empty;
    elements.sigPlaceholder.style.opacity = empty ? '' : '0';
  };

  elements.sigPlaceholder.style.opacity = '';

  $$('.swatch').forEach(function (swatch) {
    swatch.addEventListener('click', function () {
      $$('.swatch').forEach(function (s) { s.classList.remove('is-active'); });
      swatch.classList.add('is-active');
      pad.setColor(swatch.dataset.color);
    });
  });

  elements.strokeWidth.addEventListener('input', function () {
    const value = parseFloat(elements.strokeWidth.value);
    pad.setWidth(value);
    elements.strokeValue.textContent = value.toFixed(1);
  });

  elements.btnUndo.addEventListener('click', function () {
    pad.undo();
  });

  elements.btnClear.addEventListener('click', function () {
    pad.clear();
  });

  elements.btnUseDrawn.addEventListener('click', function () {
    const result = pad.export();
    if (!result) {
      toast('Gambar tanda tangan terlebih dahulu.', true);
      return;
    }
    addSignature(result, 'drawn');
    pad.clear();
  });

  /* ===== Tabs ===== */
  $$('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      $$('.tab').forEach(function (other) {
        const isActive = other === tab;
        other.classList.toggle('is-active', isActive);
        other.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      $('#panelDraw').classList.toggle('is-hidden', tab.dataset.tab !== 'draw');
      $('#panelUpload').classList.toggle('is-hidden', tab.dataset.tab !== 'upload');
    });
  });

  /* ===== Upload tab ===== */
  function resetUploadPreview() {
    uploadResult = null;
    uploadFile = null;
    elements.uploadPreviewWrap.classList.add('is-hidden');
    elements.btnUseUpload.disabled = true;
    elements.sigFileInput.value = '';
  }

  async function handleUploadFile(file) {
    if (!file) return;
    if (!file.type || file.type.indexOf('image/') !== 0) {
      toast('Pilih file gambar (PNG atau JPG).', true);
      return;
    }
    uploadFile = file;
    elements.btnUseUpload.disabled = true;
    try {
      uploadResult = await window.SignatureImage.fromFile(file, {
        removeWhite: elements.removeWhite.checked
      });
      elements.uploadThumb.src = uploadResult.dataUrl;
      elements.uploadPreviewWrap.classList.remove('is-hidden');
      elements.btnUseUpload.disabled = false;
    } catch (error) {
      uploadResult = null;
      elements.uploadPreviewWrap.classList.add('is-hidden');
      toast(error.message || 'Gambar tidak dapat diproses.', true);
    }
  }

  elements.sigFileInput.addEventListener('change', function () {
    const file = elements.sigFileInput.files && elements.sigFileInput.files[0];
    handleUploadFile(file);
  });

  ['dragenter', 'dragover'].forEach(function (type) {
    elements.sigDrop.addEventListener(type, function (event) {
      event.preventDefault();
      event.stopPropagation();
      elements.sigDrop.classList.add('is-drag');
    });
  });

  ['dragleave', 'dragend'].forEach(function (type) {
    elements.sigDrop.addEventListener(type, function (event) {
      event.stopPropagation();
      elements.sigDrop.classList.remove('is-drag');
    });
  });

  elements.sigDrop.addEventListener('drop', function (event) {
    event.preventDefault();
    event.stopPropagation();
    elements.sigDrop.classList.remove('is-drag');
    const file = event.dataTransfer.files && event.dataTransfer.files[0];
    if (!file) return;
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      openPdf(file);
      return;
    }
    handleUploadFile(file);
  });

  elements.removeWhite.addEventListener('change', function () {
    if (uploadFile) handleUploadFile(uploadFile);
  });

  elements.btnUseUpload.addEventListener('click', function () {
    if (!uploadResult) return;
    addSignature(uploadResult, 'upload');
    resetUploadPreview();
  });

  /* ===== PDF open ===== */
  function requestOpen() {
    elements.fileInput.click();
  }

  elements.btnOpen.addEventListener('click', requestOpen);
  elements.emptyState.querySelector('[data-action="open"]').addEventListener('click', requestOpen);

  elements.fileInput.addEventListener('change', function () {
    const file = elements.fileInput.files && elements.fileInput.files[0];
    elements.fileInput.value = '';
    openPdf(file);
  });

  async function openPdf(file) {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      toast('File yang dipilih bukan PDF.', true);
      return;
    }
    if (editor.hasDocument && editor.placements.length > 0) {
      const proceed = await requestConfirm({
        title: 'Buka PDF baru?',
        message: 'Tanda tangan yang sudah ditempel pada PDF ini akan hilang.',
        okLabel: 'Ganti PDF'
      });
      if (!proceed) return;
    }

    elements.viewerStatus.textContent = 'Memuat PDF…';
    try {
      await editor.load(file);
    } catch (error) {
      syncUi(editor.getState());
      toast(error.message || 'PDF gagal dimuat.', true);
      return;
    }
    updatePlacementHint();
    toast('PDF dimuat. Pilih tanda tangan, lalu klik halamannya.');
  }

  /* ===== Drag & drop PDF ===== */
  let dragDepth = 0;

  function hasFiles(event) {
    const types = event.dataTransfer && event.dataTransfer.types;
    if (!types) return false;
    return Array.prototype.indexOf.call(types, 'Files') !== -1;
  }

  window.addEventListener('dragenter', function (event) {
    if (!hasFiles(event)) return;
    if (event.target.closest && event.target.closest('#sigDrop')) return;
    dragDepth += 1;
    elements.dropOverlay.classList.remove('is-hidden');
  });

  window.addEventListener('dragover', function (event) {
    event.preventDefault();
  });

  window.addEventListener('dragleave', function () {
    if (dragDepth === 0) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) elements.dropOverlay.classList.add('is-hidden');
  });

  window.addEventListener('drop', function (event) {
    event.preventDefault();
    dragDepth = 0;
    elements.dropOverlay.classList.add('is-hidden');
    if (event.target.closest && event.target.closest('#sigDrop')) return;
    const file = event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) openPdf(file);
  });

  /* ===== Viewer controls ===== */
  elements.btnPrev.addEventListener('click', function () { editor.prevPage(); });
  elements.btnNext.addEventListener('click', function () { editor.nextPage(); });
  elements.btnZoomIn.addEventListener('click', function () { editor.zoom(1.15); });
  elements.btnZoomOut.addEventListener('click', function () { editor.zoom(1 / 1.15); });
  elements.btnFit.addEventListener('click', function () { editor.fitWidth(); });

  /* ===== Selection controls ===== */
  function syncSelection(selected) {
    const visible = !!selected;
    elements.selControls.classList.toggle('is-hidden', !visible);
    if (!visible) {
      elements.selSize.value = '150';
      elements.selSizeValue.textContent = '150 pt';
      return;
    }
    const maxWidth = Math.max(40, Math.min(600, Math.floor(selected.pageWidth)));
    elements.selSize.max = String(maxWidth);
    elements.selSize.value = String(Math.round(selected.width));
    elements.selSizeValue.textContent = Math.round(selected.width) + ' pt';
  }

  elements.selSize.addEventListener('input', function () {
    const width = Number(elements.selSize.value);
    elements.selSizeValue.textContent = Math.round(width) + ' pt';
    editor.setSelectedWidth(width);
  });

  elements.btnDeleteSel.addEventListener('click', function () {
    editor.deleteSelected();
  });

  /* ===== UI sync ===== */
  function syncUi(state) {
    elements.pageLabel.textContent = state.hasDocument
      ? state.pageNumber + ' / ' + state.pageCount
      : '– / –';
    elements.btnPrev.disabled = !state.hasDocument || state.pageNumber <= 1;
    elements.btnNext.disabled = !state.hasDocument || state.pageNumber >= state.pageCount;
    elements.btnZoomIn.disabled = !state.hasDocument;
    elements.btnZoomOut.disabled = !state.hasDocument;
    elements.btnFit.disabled = !state.hasDocument;
    elements.zoomLabel.textContent = state.hasDocument ? Math.round(state.scale * 100) + '%' : '100%';
    elements.btnDownload.disabled = !state.hasDocument || state.placementsTotal === 0;
    elements.viewerStatus.textContent = state.hasDocument
      ? editor.fileName + ' · ' + state.placementsTotal + ' tanda tangan'
      : 'Belum ada PDF';
    updatePlacementHint();
  }

  /* ===== Download ===== */
  elements.btnDownload.addEventListener('click', async function () {
    if (!editor.hasDocument || !editor.placements.length) {
      toast('Tempel minimal satu tanda tangan terlebih dahulu.', true);
      return;
    }
    elements.btnDownload.disabled = true;
    elements.btnDownload.textContent = 'Menyiapkan…';
    try {
      const blob = await editor.exportPdf();
      const baseName = editor.fileName.replace(/\.pdf$/i, '');
      const fileName = baseName + '-bertanda-tangan.pdf';

      const nativeSaver = window.SignPdfMobile;
      if (nativeSaver && typeof nativeSaver.savePdf === 'function') {
        const result = await nativeSaver.savePdf(blob, fileName);
        if (result && result.shared) {
          toast('PDF bertanda tangan siap disimpan atau dibagikan.');
        } else {
          toast('PDF dibuat, tetapi dialog berbagi tidak terbuka.', true);
        }
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      toast('PDF bertanda tangan berhasil diunduh.');
    } catch (error) {
      toast(error.message || 'Gagal membuat PDF.', true);
    } finally {
      elements.btnDownload.innerHTML = downloadLabel;
      syncUi(editor.getState());
    }
  });

  /* ===== Keyboard ===== */
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      if (confirmResolve) {
        event.preventDefault();
        closeConfirm(false);
        return;
      }
      if (activeSignatureId) {
        setActiveSignature(null);
      } else if (editor.selectedId) {
        editor.select(null);
      }
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && editor.selectedId && !confirmResolve) {
      const tag = document.activeElement ? document.activeElement.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      event.preventDefault();
      editor.deleteSelected();
    }
  });

  /* ===== Resize ===== */
  let resizeTimer = 0;
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (editor.hasDocument) editor.refitIfNeeded();
      }, 160);
    });
    observer.observe(elements.scroll);
  }

  /* ===== Unload guard ===== */
  window.addEventListener('beforeunload', function (event) {
    if (editor.placements.length > 0) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  /* ===== Boot ===== */
  if (typeof SignaturePad === 'undefined' || typeof PdfEditor === 'undefined') {
    toast('Aplikasi tidak termuat lengkap. Periksa folder js dan vendor.', true);
  }
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
  }

  pad.onChange(true);
  renderLibrary();
  updatePlacementHint();
  syncUi(editor.getState());
  syncSelection(null);

  window.SignPdf = {
    openFile: openPdf,
    notify: toast
  };

  const nativeShell = window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === 'function' &&
    window.Capacitor.isNativePlatform();
  if (!nativeShell && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(function () {});
    });
  }
})();
