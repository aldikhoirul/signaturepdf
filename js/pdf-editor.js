/* PDF viewer + signature placement + export. */
(function () {
  'use strict';

  const MIN_SCALE = 0.3;
  const MAX_SCALE = 4;
  const MIN_SIG_WIDTH = 36;

  let idCounter = 0;
  function nextId() {
    idCounter += 1;
    return 'sig-' + Date.now().toString(36) + '-' + idCounter;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function wrapError(err) {
    if (err && (err.name === 'PasswordException' || err.code === 1)) {
      return new Error('PDF ini terproteksi kata sandi. Buka proteksinya terlebih dahulu.');
    }
    if (err && err.name === 'InvalidPDFException') {
      return new Error('File PDF tidak valid atau rusak.');
    }
    return new Error('Gagal memuat PDF: ' + (err && err.message ? err.message : 'kesalahan tidak diketahui'));
  }

  class PdfEditor {
    constructor(options) {
      this.canvas = options.canvas;
      this.layer = options.layer;
      this.stage = options.stage;
      this.pageWrap = options.pageWrap;
      this.scrollEl = options.scrollEl;
      this.emptyState = options.emptyState;
      this.getSignature = options.getSignature;
      this.onChange = options.onChange || function () {};
      this.onSelectionChange = options.onSelectionChange || function () {};
      this.onError = options.onError || function () {};

      this.pdfDoc = null;
      this.pdfBytes = null;
      this.fileName = 'dokumen.pdf';
      this.pageIndex = 0;
      this.scale = 1;
      this.fitMode = true;
      this.baseViewport = null;
      this.placements = [];
      this.selectedId = null;
      this.activeSignatureId = null;
      this.renderTask = null;
      this.renderToken = 0;
      this._drag = null;

      this._bindStageEvents();
    }

    get hasDocument() {
      return !!this.pdfDoc;
    }

    get pageCount() {
      return this.pdfDoc ? this.pdfDoc.numPages : 0;
    }

    getState() {
      const selected = this.getSelected();
      return {
        hasDocument: this.hasDocument,
        pageNumber: this.pageIndex + 1,
        pageCount: this.pageCount,
        scale: this.scale,
        placementsTotal: this.placements.length,
        pagePlacements: this.placements.filter((p) => p.pageIndex === this.pageIndex).length,
        selected: selected,
        activeSignatureId: this.activeSignatureId
      };
    }

    _emit() {
      this.onChange(this.getState());
    }

    async load(file) {
      if (typeof pdfjsLib === 'undefined') {
        throw new Error('Pustaka PDF tidak termuat. Pastikan folder vendor lengkap.');
      }
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const pdfLibBytes = bytes.slice();

      let doc;
      try {
        doc = await pdfjsLib.getDocument({ data: bytes }).promise;
      } catch (err) {
        throw wrapError(err);
      }

      if (this.pdfDoc) {
        try { await this.pdfDoc.destroy(); } catch (_) { /* ignore */ }
      }
      if (this.renderTask) {
        try { this.renderTask.cancel(); } catch (_) { /* ignore */ }
        this.renderTask = null;
      }

      this.pdfDoc = doc;
      this.pdfBytes = pdfLibBytes;
      this.fileName = file.name || 'dokumen.pdf';
      this.pageIndex = 0;
      this.placements = [];
      this.selectedId = null;
      this.fitMode = true;

      this.emptyState.classList.add('is-hidden');
      this.stage.classList.remove('is-hidden');
      this.layer.innerHTML = '';
      this.scrollEl.scrollTop = 0;
      this.scrollEl.scrollLeft = 0;

      await this._render(1);
      this.onSelectionChange(null);
    }

    _availableWidth() {
      const style = getComputedStyle(this.scrollEl);
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      return Math.max(180, this.scrollEl.clientWidth - padding - 4);
    }

    _computeFitScale() {
      if (!this.baseViewport) return 1;
      return clamp(this._availableWidth() / this.baseViewport.width, MIN_SCALE, 1.7);
    }

    async setPage(pageNumber) {
      if (!this.pdfDoc) return;
      const target = clamp(pageNumber, 1, this.pageCount);
      if (target === this.pageIndex + 1 && this.baseViewport) return;
      this.selectedId = null;
      this.onSelectionChange(null);
      this.scrollEl.scrollTop = 0;
      this.scrollEl.scrollLeft = 0;
      await this._render(target);
    }

    nextPage() { return this.setPage(this.pageIndex + 2); }
    prevPage() { return this.setPage(this.pageIndex); }

    async fitWidth() {
      if (!this.pdfDoc) return;
      this.fitMode = true;
      this.scale = this._computeFitScale();
      await this._render(this.pageIndex + 1);
    }

    async refitIfNeeded() {
      if (!this.pdfDoc || !this.fitMode) return;
      const next = this._computeFitScale();
      if (Math.abs(next - this.scale) < 0.005) return;
      this.scale = next;
      await this._render(this.pageIndex + 1);
    }

    async zoom(factor) {
      if (!this.pdfDoc) return;
      this.fitMode = false;
      this.scale = clamp(this.scale * factor, MIN_SCALE, MAX_SCALE);
      await this._render(this.pageIndex + 1);
    }

    async _render(pageNumber) {
      if (!this.pdfDoc) return;
      this.renderToken += 1;
      const token = this.renderToken;

      let page;
      try {
        page = await this.pdfDoc.getPage(pageNumber);
      } catch (err) {
        this.onError(new Error('Gagal membuka halaman: ' + err.message));
        return;
      }
      if (token !== this.renderToken) return;

      this.pageIndex = pageNumber - 1;
      this.baseViewport = page.getViewport({ scale: 1 });
      if (this.fitMode) this.scale = this._computeFitScale();

      const viewport = page.getViewport({ scale: this.scale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const renderViewport = page.getViewport({ scale: this.scale * dpr });

      if (this.renderTask) {
        try { this.renderTask.cancel(); } catch (_) { /* ignore */ }
        this.renderTask = null;
      }

      this.canvas.width = Math.max(1, Math.floor(renderViewport.width));
      this.canvas.height = Math.max(1, Math.floor(renderViewport.height));
      this.canvas.style.width = Math.floor(viewport.width) + 'px';
      this.canvas.style.height = Math.floor(viewport.height) + 'px';
      this.layer.innerHTML = '';

      const ctx = this.canvas.getContext('2d');

      const task = page.render({ canvasContext: ctx, viewport: renderViewport });
      this.renderTask = task;
      try {
        await task.promise;
      } catch (err) {
        if (err && err.name === 'RenderingCancelledException') return;
        this.onError(new Error('Gagal menampilkan halaman: ' + err.message));
        return;
      }
      if (token !== this.renderToken) return;
      this.renderTask = null;

      this._renderPlacements();
      this._emit();
    }

    _renderPlacements() {
      this.layer.innerHTML = '';
      const onPage = this.placements.filter((p) => p.pageIndex === this.pageIndex);
      for (const placement of onPage) this._attachBox(placement);
    }

    _applyGeometry(box, placement) {
      box.style.left = placement.x * this.scale + 'px';
      box.style.top = placement.y * this.scale + 'px';
      box.style.width = Math.max(1, placement.w * this.scale) + 'px';
      box.style.height = Math.max(1, placement.h * this.scale) + 'px';
    }

    _attachBox(placement) {
      const signature = this.getSignature(placement.sigId);
      if (!signature) return;

      const box = document.createElement('div');
      box.className = 'sig-box';
      box.dataset.id = placement.id;
      box.style.backgroundImage = 'url("' + signature.dataUrl + '")';
      box.title = 'Klik untuk memilih · seret untuk memindah';
      this._applyGeometry(box, placement);
      if (placement.id === this.selectedId) box.classList.add('is-selected');

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'sig-remove';
      remove.setAttribute('aria-label', 'Hapus tanda tangan');
      remove.textContent = '×';
      remove.addEventListener('pointerdown', (e) => e.stopPropagation());
      remove.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deletePlacement(placement.id);
      });

      const resize = document.createElement('div');
      resize.className = 'sig-resize';
      resize.title = 'Tarik untuk mengubah ukuran';
      resize.addEventListener('pointerdown', (e) => this._startResize(e, placement));

      box.addEventListener('pointerdown', (e) => this._startMove(e, placement));
      box.addEventListener('click', (e) => {
        e.stopPropagation();
        this.select(placement.id);
      });

      box.appendChild(remove);
      box.appendChild(resize);
      this.layer.appendChild(box);
    }

    _bindStageEvents() {
      this.pageWrap.addEventListener('click', (e) => {
        if (!this.hasDocument) return;
        if (e.target.closest('.sig-box')) return;
        if (!this.activeSignatureId) {
          this.select(null);
          return;
        }
        const rect = this.pageWrap.getBoundingClientRect();
        this.addPlacementAt(e.clientX - rect.left, e.clientY - rect.top);
      });
    }

    setActiveSignature(signatureId) {
      this.activeSignatureId = signatureId || null;
      this.pageWrap.classList.toggle('is-placing', !!this.activeSignatureId);
      this._emit();
    }

    addPlacementAt(cssX, cssY) {
      if (!this.hasDocument || !this.baseViewport) return;
      const signature = this.getSignature(this.activeSignatureId);
      if (!signature) return;

      const pageW = this.baseViewport.width;
      const pageH = this.baseViewport.height;
      const ratio = signature.height / signature.width || 0.4;

      let width = Math.min(175, pageW * 0.34);
      let height = width * ratio;
      const maxHeight = pageH * 0.22;
      if (height > maxHeight) {
        height = maxHeight;
        width = height / ratio;
      }
      if (width > pageW) {
        width = pageW;
        height = width * ratio;
      }

      const x = clamp(cssX / this.scale - width / 2, 0, Math.max(0, pageW - width));
      const y = clamp(cssY / this.scale - height / 2, 0, Math.max(0, pageH - height));

      const placement = {
        id: nextId(),
        sigId: signature.id,
        pageIndex: this.pageIndex,
        x: x,
        y: y,
        w: width,
        h: height
      };
      this.placements.push(placement);
      this._renderPlacements();
      this.select(placement.id);
      this._emit();
    }

    select(id) {
      this.selectedId = id || null;
      const boxes = this.layer.querySelectorAll('.sig-box');
      boxes.forEach((box) => box.classList.toggle('is-selected', box.dataset.id === this.selectedId));
      this.onSelectionChange(this.getSelected());
    }

    getSelected() {
      if (!this.selectedId) return null;
      const placement = this.placements.find((p) => p.id === this.selectedId);
      if (!placement) return null;
      return {
        id: placement.id,
        width: placement.w,
        height: placement.h,
        pageWidth: this.baseViewport ? this.baseViewport.width : 0,
        pageHeight: this.baseViewport ? this.baseViewport.height : 0
      };
    }

    _findBox(id) {
      return this.layer.querySelector('.sig-box[data-id="' + id + '"]');
    }

    _startMove(e, placement) {
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      e.stopPropagation();
      this.select(placement.id);

      const box = e.currentTarget;
      const start = { x: e.clientX, y: e.clientY, px: placement.x, py: placement.y };
      box.classList.add('is-dragging');
      this.pageWrap.style.cursor = 'grabbing';

      const onMove = (ev) => {
        const dx = (ev.clientX - start.x) / this.scale;
        const dy = (ev.clientY - start.y) / this.scale;
        const pageW = this.baseViewport.width;
        const pageH = this.baseViewport.height;
        placement.x = clamp(start.px + dx, 0, Math.max(0, pageW - placement.w));
        placement.y = clamp(start.py + dy, 0, Math.max(0, pageH - placement.h));
        this._applyGeometry(box, placement);
      };

      const onEnd = () => {
        box.classList.remove('is-dragging');
        this.pageWrap.style.cursor = '';
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onEnd);
        document.removeEventListener('pointercancel', onEnd);
        this._emit();
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onEnd);
      document.addEventListener('pointercancel', onEnd);
    }

    _startResize(e, placement) {
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      e.stopPropagation();
      this.select(placement.id);

      const box = this._findBox(placement.id);
      if (!box) return;
      const start = { x: e.clientX, w: placement.w, h: placement.h };
      const ratio = placement.h / placement.w || 0.4;
      const pageW = this.baseViewport.width;
      const pageH = this.baseViewport.height;

      const onMove = (ev) => {
        const dx = (ev.clientX - start.x) / this.scale;
        let width = clamp(start.w + dx, MIN_SIG_WIDTH, pageW - placement.x);
        let height = width * ratio;
        if (placement.y + height > pageH) {
          height = pageH - placement.y;
          width = height / ratio;
        }
        placement.w = width;
        placement.h = height;
        this._applyGeometry(box, placement);
      };

      const onEnd = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onEnd);
        document.removeEventListener('pointercancel', onEnd);
        this.onSelectionChange(this.getSelected());
        this._emit();
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onEnd);
      document.addEventListener('pointercancel', onEnd);
    }

    deletePlacement(id) {
      const index = this.placements.findIndex((p) => p.id === id);
      if (index === -1) return;
      this.placements.splice(index, 1);
      if (this.selectedId === id) {
        this.selectedId = null;
        this.onSelectionChange(null);
      }
      this._renderPlacements();
      this._emit();
    }

    deleteSelected() {
      if (this.selectedId) this.deletePlacement(this.selectedId);
    }

    setSelectedWidth(width) {
      if (!this.selectedId || !this.baseViewport) return;
      const placement = this.placements.find((p) => p.id === this.selectedId);
      if (!placement) return;
      const ratio = placement.h / placement.w || 0.4;
      const pageW = this.baseViewport.width;
      const pageH = this.baseViewport.height;
      let nextWidth = clamp(width, MIN_SIG_WIDTH, pageW - placement.x);
      let nextHeight = nextWidth * ratio;
      if (placement.y + nextHeight > pageH) {
        nextHeight = pageH - placement.y;
        nextWidth = nextHeight / ratio;
      }
      placement.w = nextWidth;
      placement.h = nextHeight;
      const box = this._findBox(placement.id);
      if (box) this._applyGeometry(box, placement);
      this.onSelectionChange(this.getSelected());
    }

    async exportPdf() {
      if (!this.pdfBytes) throw new Error('Belum ada PDF yang dimuat.');
      if (typeof PDFLib === 'undefined') throw new Error('Pustaka pdf-lib tidak termuat.');
      if (!this.placements.length) throw new Error('Tambahkan minimal satu tanda tangan terlebih dahulu.');

      const { PDFDocument, degrees } = PDFLib;
      const doc = await PDFDocument.load(this.pdfBytes.slice());
      const pages = doc.getPages();
      const embedded = new Map();

      for (const placement of this.placements) {
        const signature = this.getSignature(placement.sigId);
        const page = pages[placement.pageIndex];
        if (!signature || !page) continue;

        let image = embedded.get(placement.sigId);
        if (!image) {
          image = await doc.embedPng(signature.dataUrl);
          embedded.set(placement.sigId, image);
        }

        const size = page.getSize();
        const angle = ((page.getRotation().angle % 360) + 360) % 360;
        let x;
        let y;
        let rotation = 0;

        if (angle === 90) {
          x = placement.y + placement.h;
          y = placement.x;
          rotation = 90;
        } else if (angle === 180) {
          x = size.width - placement.x;
          y = placement.y + placement.h;
          rotation = 180;
        } else if (angle === 270) {
          x = size.width - placement.y - placement.h;
          y = size.height - placement.x;
          rotation = 270;
        } else {
          x = placement.x;
          y = size.height - placement.y - placement.h;
        }

        page.drawImage(image, {
          x: x,
          y: y,
          width: placement.w,
          height: placement.h,
          rotate: degrees(rotation)
        });
      }

      const bytes = await doc.save();
      return new Blob([bytes], { type: 'application/pdf' });
    }
  }

  window.PdfEditor = PdfEditor;
})();
