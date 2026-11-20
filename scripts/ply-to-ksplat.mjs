// Convert a viewer-aligned 3DGS .ply into a compressed .ksplat (keeps spherical harmonics).
// usage: node scripts/ply-to-ksplat.mjs in.ply out.ksplat [compressionLevel=2] [shDegree=2] [minAlpha=5]
import { readFileSync, writeFileSync } from 'node:fs';
globalThis.window ??= globalThis; // the library schedules work via window.setTimeout
const { PlyLoader } = await import('@mkkellogg/gaussian-splats-3d');

const [input, output, level = '2', sh = '2', minAlpha = '5'] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node scripts/ply-to-ksplat.mjs in.ply out.ksplat [compressionLevel] [shDegree] [minAlpha]');
  process.exit(1);
}
const file = readFileSync(input);
const data = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
const splatBuffer = await PlyLoader.loadFromFileData(data, Number(minAlpha), Number(level), true, Number(sh));
writeFileSync(output, Buffer.from(splatBuffer.bufferData));
console.log(`wrote ${splatBuffer.getSplatCount()} splats, SH degree ${splatBuffer.getMinSphericalHarmonicsDegree?.() ?? sh}, ` +
  `${(splatBuffer.bufferData.byteLength / 1e6).toFixed(1)} MB -> ${output}`);
