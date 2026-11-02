// Test Safe Filename Generation
function getSafeExtension(file) {
  if (!file || !file.name) return 'mp4';
  const parts = file.name.split('.');
  const ext = (parts.length > 1 ? parts.pop() : 'mp4') || 'mp4';
  const clean = ext.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['mp4', 'webm', 'mov', 'm4v'].includes(clean)) {
    return clean;
  }
  return 'mp4';
}

function getSafeMimeType(file) {
  const ext = getSafeExtension(file);
  switch (ext) {
    case 'webm': return 'video/webm';
    case 'mov': return 'video/quicktime';
    case 'mp4': return 'video/mp4';
    case 'm4v': return 'video/x-m4v';
    default: return 'video/mp4';
  }
}

function generateSafeStorageFilename(file) {
  const timestamp = Math.floor(Date.now() / 1000);
  const randomHex = Math.random().toString(16).substring(2, 8);
  const ext = getSafeExtension(file);
  // Pattern: video_<timestamp>_<randomHex>.<ext>
  return `video_${timestamp}_${randomHex}.${ext}`;
}

function isPureAscii(str) {
  return /^[\x20-\x7E]+$/.test(str);
}

const testFiles = [
  { name: '1000087683.mp4', type: 'video/mp4', size: 1024 },
  { name: 'video with spaces.mp4', type: 'video/mp4', size: 1024 },
  { name: 'BMW M4 — Track Day (🔥).mp4', type: 'video/mp4', size: 1024 },
  { name: 'தமிழ்_வீடியோ.mov', type: 'video/quicktime', size: 1024 },
  { name: 'Кинематографический.webm', type: 'video/webm', size: 1024 },
  { name: 'super-car & speed.m4v', type: 'video/x-m4v', size: 1024 }
];

console.log('Testing Safe Filename Generation:');
testFiles.forEach(f => {
  const safeFilename = generateSafeStorageFilename(f);
  const safePath = `videos/${safeFilename}`;
  const safeMime = getSafeMimeType(f);
  const isAscii = isPureAscii(safePath);
  console.log(`Original: "${f.name}"`);
  console.log(`  -> Safe Storage Path: "${safePath}" (Pure ASCII: ${isAscii})`);
  console.log(`  -> Safe MIME Type:    "${safeMime}"`);
  if (!isAscii) {
    console.error('FAIL: Path is not pure ASCII!');
    process.exit(1);
  }
});

console.log('\nAll filename tests PASSED with 100% pure ASCII generation!');
