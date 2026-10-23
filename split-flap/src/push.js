// Solidpixels Public API push. Uses only fetch + btoa, so it works in Node 18+ and Workers.

export const MAX_BYTES = 192 * 1024;

export function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/**
 * @param {object} o
 * @param {string} o.token           API key (Bearer)
 * @param {string} o.deviceId        device id, serial or MAC
 * @param {Uint8Array} o.bytes       64x32 GIF/PNG/WebP
 * @param {string} [o.mime]          image/gif by default
 * @param {string} [o.installationId] persistent rotation slot; omit for a temporary display
 * @param {boolean} [o.background]   update the slot without interrupting the display
 * @param {number} [o.duration]      seconds for temporary pushes (5,10,15,30,35,40,45)
 */
export async function pushImage({
  token, deviceId, bytes, mime = 'image/gif',
  installationId, background = false, duration,
  apiBase = 'https://api.solidpixels.io/v1',
}) {
  if (!token) throw new Error('SOLIDPIXELS_API_TOKEN is not set');
  if (!deviceId) throw new Error('SOLIDPIXELS_DEVICE_ID is not set');
  if (bytes.length > MAX_BYTES) throw new Error(`image is ${bytes.length} B, over the 192 KiB push limit`);

  const body = { image: `data:${mime};base64,${toBase64(bytes)}` };
  if (installationId) {
    body.installationId = installationId;
    if (background) body.background = true;
  } else if (duration) {
    body.duration = duration;
  }

  const res = await fetch(`${apiBase}/devices/${encodeURIComponent(deviceId)}/push`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`push failed ${res.status}: ${await res.text()}`);
}
