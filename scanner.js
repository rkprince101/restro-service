import QrScanner from '/vendor/qr-scanner.min.js';

export function openScanner(onScan) {
  const dialog = document.createElement('dialog');
  dialog.className = 'scanner-dialog';
  dialog.setAttribute('aria-labelledby', 'scannerTitle');
  dialog.innerHTML = `<div class="scanner-heading"><h2 id="scannerTitle">Scan table QR</h2><button type="button" id="closeScanner" aria-label="Close scanner">Close</button></div><div class="scanner-camera"><video muted playsinline aria-label="Camera preview"></video></div><p id="scanStatus" role="status">Point your camera at the QR on your table.</p><div class="scanner-actions"><button type="button" id="startCamera">Start camera</button><label class="scan-upload">Choose QR image<input type="file" accept="image/*" id="scanImage"></label></div>`;
  document.body.append(dialog);
  const status = dialog.querySelector('#scanStatus');
  const video = dialog.querySelector('video');
  const startButton = dialog.querySelector('#startCamera');
  let scanner, closed = false, busy = false, attempt = 0;
  const stop = () => { attempt++; scanner?.destroy(); scanner = null; video.srcObject?.getTracks().forEach(track => track.stop()); video.srcObject = null; };
  const cleanup = () => { closed = true; stop(); window.removeEventListener('pagehide', close); dialog.remove(); };
  const close = () => { if (dialog.open) dialog.close(); };
  dialog.addEventListener('close', cleanup, { once: true });
  dialog.querySelector('#closeScanner').onclick = close;
  window.addEventListener('pagehide', close);
  async function accept(result) {
    if (closed || busy) return;
    busy = true; status.textContent = 'Checking table...';
    try { await onScan(result.data, () => !closed); if (!closed) close(); }
    catch (error) { if (!closed) status.textContent = error.message; }
    finally { busy = false; }
  }
  async function start() {
    stop();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      video.parentElement.hidden = true;
      status.textContent = 'Live camera needs HTTPS on your phone. Choose a photo of the table QR instead.';
      return;
    }
    const current = attempt;
    video.parentElement.hidden = false;
    startButton.disabled = true;
    scanner = new QrScanner(video, accept, { preferredCamera: 'environment', returnDetailedScanResult: true, maxScansPerSecond: 3 });
    const instance = scanner;
    try {
      await instance.start();
      if (closed || current !== attempt) { instance.destroy(); return; }
      status.textContent = 'Point your camera at the QR on your table.';
      startButton.textContent = 'Restart camera';
    } catch {
      instance.destroy();
      video.parentElement.hidden = true;
      if (!closed) status.textContent = 'Camera unavailable or permission denied. Allow camera access and retry, or choose a QR image.';
    } finally { if (!closed) startButton.disabled = false; }
  }
  startButton.onclick = start;
  dialog.querySelector('#scanImage').onchange = async event => {
    const file = event.target.files[0];
    if (!file || busy) return;
    stop(); startButton.disabled = false;
    if (file.size > 10 * 1024 * 1024) { status.textContent = 'Choose an image smaller than 10 MB.'; return; }
    status.textContent = 'Reading QR image...'; busy = true;
    try {
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
      busy = false; await accept(result);
    } catch { if (!closed) status.textContent = 'No readable QR found. Choose a clear photo of the full table QR.'; }
    finally { busy = false; event.target.value = ''; }
  };
  dialog.showModal();
  start();
}
