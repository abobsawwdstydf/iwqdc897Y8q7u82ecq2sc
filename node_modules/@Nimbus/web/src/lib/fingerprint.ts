/**
 * Browser fingerprinting for anti-spam protection
 * Generates a unique identifier based on browser characteristics
 */

export async function getFingerprint(): Promise<string> {
  const data = {
    // Navigator properties
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    screenResolution: `${screen.width}x${screen.height}`,
    colorDepth: screen.colorDepth,
    deviceMemory: (navigator as any).deviceMemory || 'unknown',
    hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    
    // Canvas fingerprint
    canvas: await getCanvasFingerprint(),
    
    // WebGL fingerprint
    webgl: await getWebGLFingerprint(),
    
    // Audio context fingerprint
    audio: await getAudioFingerprint(),
  };

  // Generate hash
  const str = JSON.stringify(data);
  return await hashString(str);
}

async function getCanvasFingerprint(): Promise<string> {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'none';

    canvas.width = 200;
    canvas.height = 50;
    
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Nexo Fingerprint', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('Nexo Fingerprint 😊', 4, 17);
    
    return canvas.toDataURL().slice(-50);
  } catch {
    return 'error';
  }
}

async function getWebGLFingerprint(): Promise<string> {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || (canvas.getContext('experimental-webgl'));
    if (!gl) return 'none';

    const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return 'none';

    const vendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    
    return `${vendor}-${renderer}`;
  } catch {
    return 'error';
  }
}

async function getAudioFingerprint(): Promise<string> {
  try {
    const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return 'none';

    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const analyser = ctx.createAnalyser();
    const gain = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();

    oscillator.type = 'triangle';
    oscillator.frequency.value = 10000;
    
    gain.gain.value = 0.5;
    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.25;

    oscillator.connect(analyser);
    analyser.connect(compressor);
    compressor.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start(0);
    
    const buffer = new Float32Array(1000);
    await new Promise(resolve => setTimeout(resolve, 100));
    analyser.getFloatTimeDomainData(buffer);
    
    oscillator.stop();
    ctx.close();

    return buffer.slice(0, 10).join(',');
  } catch {
    return 'error';
  }
}

async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

