/* Signature drawing pad + uploaded-image processing (no build step). */
(function () {
  'use strict';

  const MAX_UPLOAD_EDGE = 1000;

  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  class SignaturePad {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.strokes = [];
      this.current = null;
      this.color = '#0f172a';
      this.strokeWidth = 3.5;
      this.onChange = null;
      this._frame = 0;
      this._bindEvents();
      this.redraw();
    }

    _bindEvents() {
      const c = this.canvas;
      c.addEventListener('pointerdown', (e) => this._onDown(e));
      c.addEventListener('pointermove', (e) => this._onMove(e));
      c.addEventListener('pointerup', (e) => this._onUp(e));
      c.addEventListener('pointercancel', (e) => this._onUp(e));
      c.addEventListener('pointerleave', (e) => { if (this.current && e.pointerType === 'mouse' && !(e.buttons & 1)) this._onUp(e); });
    }

    _point(e) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
        y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
      };
    }

    _onDown(e) {
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      this.canvas.setPointerCapture(e.pointerId);
      const p = this._point(e);
      this.current = { points: [p], color: this.color, width: this.strokeWidth };
      this.strokes.push(this.current);
      this._schedule();
      this._notify();
    }

    _onMove(e) {
      if (!this.current) return;
      if (e.pointerType === 'mouse' && !(e.buttons & 1)) {
        this._onUp(e);
        return;
      }
      const p = this._point(e);
      const last = this.current.points[this.current.points.length - 1];
      if (last && dist(last, p) < 0.6) return;
      this.current.points.push(p);
      this._schedule();
    }

    _onUp(e) {
      if (!this.current) return;
      const wasDrawing = this.current.points.length > 0;
      this.current = null;
      try { this.canvas.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      if (wasDrawing) {
        this.redraw();
        this._notify();
      }
    }

    _schedule() {
      if (this._frame) return;
      this._frame = requestAnimationFrame(() => {
        this._frame = 0;
        this.redraw();
      });
    }

    _notify() {
      if (typeof this.onChange === 'function') this.onChange(this.isEmpty());
    }

    _drawStroke(stroke) {
      const ctx = this.ctx;
      const pts = stroke.points;
      if (!pts.length) return;
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, stroke.width / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      if (pts.length === 2) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.stroke();
        return;
      }

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const midX = (pts[i].x + pts[i + 1].x) / 2;
        const midY = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }

    redraw() {
      const { ctx, canvas } = this;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const stroke of this.strokes) this._drawStroke(stroke);
    }

    setColor(color) { this.color = color; }
    setWidth(width) { this.strokeWidth = width; }

    isEmpty() {
      return !this.strokes.some((s) => s.points.length > 0);
    }

    undo() {
      this.strokes.pop();
      this.redraw();
      this._notify();
    }

    clear() {
      this.strokes = [];
      this.current = null;
      this.redraw();
      this._notify();
    }

    export() {
      if (this.isEmpty()) return null;
      const { canvas, ctx } = this;
      const { width, height } = canvas;
      const data = ctx.getImageData(0, 0, width, height).data;

      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4 + 3] > 0) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return null;

      const pad = 12;
      const cropW = maxX - minX + 1 + pad * 2;
      const cropH = maxY - minY + 1 + pad * 2;
      const out = document.createElement('canvas');
      out.width = cropW;
      out.height = cropH;
      const outCtx = out.getContext('2d');
      outCtx.drawImage(canvas, minX - pad, minY - pad, cropW, cropH, 0, 0, cropW, cropH);

      return {
        dataUrl: out.toDataURL('image/png'),
        width: cropW,
        height: cropH
      };
    }
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Gambar tidak dapat dibaca.'));
      };
      img.src = url;
    });
  }

  function estimatePaperLuminance(data, width, height) {
    const samples = [];
    const stepX = Math.max(1, Math.floor(width / 60));
    const stepY = Math.max(1, Math.floor(height / 60));
    const read = (x, y) => {
      const i = (y * width + x) * 4;
      return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    };
    for (let x = 0; x < width; x += stepX) {
      samples.push(read(x, 0));
      samples.push(read(x, height - 1));
    }
    for (let y = 0; y < height; y += stepY) {
      samples.push(read(0, y));
      samples.push(read(width - 1, y));
    }
    samples.sort((a, b) => a - b);
    return samples[Math.floor(samples.length * 0.75)] || 255;
  }

  function removePaperBackground(canvas) {
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    const paper = estimatePaperLuminance(data, width, height);
    const threshold = Math.max(185, paper - 26);
    const feather = 24;

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      if (lum >= threshold) {
        data[i + 3] = 0;
      } else if (lum > threshold - feather) {
        data[i + 3] = Math.round(data[i + 3] * (threshold - lum) / feather);
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  function cropToContent(canvas) {
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX) return canvas;

    const pad = 8;
    const cropW = maxX - minX + 1 + pad * 2;
    const cropH = maxY - minY + 1 + pad * 2;
    const out = document.createElement('canvas');
    out.width = cropW;
    out.height = cropH;
    out.getContext('2d').drawImage(canvas, minX - pad, minY - pad, cropW, cropH, 0, 0, cropW, cropH);
    return out;
  }

  async function processSignatureImage(file, options) {
    const removeWhite = !options || options.removeWhite !== false;
    const img = await loadImage(file);
    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;
    if (!naturalW || !naturalH) throw new Error('Gambar tidak memiliki ukuran yang valid.');

    const scale = Math.min(1, MAX_UPLOAD_EDGE / Math.max(naturalW, naturalH));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(naturalW * scale));
    canvas.height = Math.max(1, Math.round(naturalH * scale));
    canvas.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, canvas.width, canvas.height);

    if (removeWhite) removePaperBackground(canvas);
    const cropped = cropToContent(canvas);

    return {
      dataUrl: cropped.toDataURL('image/png'),
      width: cropped.width,
      height: cropped.height
    };
  }

  window.SignaturePad = SignaturePad;
  window.SignatureImage = { fromFile: processSignatureImage };
})();
