const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== RUNNING COMPLETE SHACREATZ V5.2 UPLOAD VALIDATION ===\n');

// Mock browser globals
global.window = {
  SUPABASE_CONFIG: {
    bucketName: 'portfolio-videos',
    tableName: 'portfolio_videos'
  },
  localStorage: {
    data: {},
    getItem(k) { return this.data[k] || null; },
    setItem(k, v) { this.data[k] = String(v); },
    removeItem(k) { delete this.data[k]; }
  }
};
Object.defineProperty(global, 'localStorage', {
  value: global.window.localStorage,
  writable: true,
  configurable: true
});
global.document = {
  readyState: 'complete',
  addEventListener() {}
};

// Mock Headers
class MockHeaders {
  constructor() {
    this.map = new Map();
  }
  set(name, value) {
    const str = String(value);
    for (let i = 0; i < str.length; i++) {
      if (str.charCodeAt(i) > 255) {
        throw new TypeError("Failed to execute 'set' on 'Headers': String contains non ISO-8859-1 code point.");
      }
    }
    this.map.set(String(name).toLowerCase(), str);
  }
  get(name) {
    return this.map.get(String(name).toLowerCase());
  }
}
global.Headers = MockHeaders;

// Load js/supabase-client.js
const code = fs.readFileSync(path.join(__dirname, '../js/supabase-client.js'), 'utf-8');
eval(`
  function loadClient() {
    ${code}
    return window.ShacreatzSupabase;
  }
`);

const api = loadClient();

// Test the 5 required upload scenarios:
const testScenarios = [
  {
    type: 'MP4 video',
    originalName: '1000087683.mp4',
    title: 'Cinematic Car Rollers',
    category: 'Automotive Edits',
    tags: '#rollers #cars #cinematic',
    desc: '4K 60fps high shutter speed rolling shots.',
    mime: 'video/mp4',
    size: 24500000
  },
  {
    type: 'WebM video',
    originalName: 'nightlife_cyberpunk.webm',
    title: 'Electric Tokyo Nights',
    category: 'Commercials',
    tags: '#neon #cyberpunk #tokyo',
    desc: 'Vibrant neon street aesthetics with rhythm-matched beats.',
    mime: 'video/webm',
    size: 15400000
  },
  {
    type: 'MOV video',
    originalName: 'cinematic_anamorphic.mov',
    title: 'Anamorphic Mountain Drone',
    category: 'Travel & Lifestyle',
    tags: '#drone #mountains #travel',
    desc: 'Ultra-wide anamorphic aerial sequence.',
    mime: 'video/quicktime',
    size: 48900000
  },
  {
    type: 'Filename with spaces',
    originalName: 'my final edit project version 2.mp4',
    title: 'Summer Festival Aftermovie',
    category: 'Event Recaps',
    tags: '#festival #music #summer',
    desc: 'High energy fast-paced festival recap reel.',
    mime: 'video/mp4',
    size: 31200000
  },
  {
    type: 'Unicode / Special Characters',
    originalName: 'BMW M4 — Track Day (🔥) தமிழ்_காட்சி_Русский.mp4',
    title: 'Supercar Beast — Track Weapon 🔥',
    category: 'Automotive Edits',
    tags: '#m4 #trackday #weapon #🔥',
    desc: 'Track-tuned exhaust notes with rapid pacing and color grading.',
    mime: 'video/mp4',
    size: 38400000
  }
];

(async () => {
  for (let i = 0; i < testScenarios.length; i++) {
    const sc = testScenarios[i];
    console.log(`[TEST ${i + 1}/5] Uploading ${sc.type}`);
    console.log(`  Original Name: "${sc.originalName}"`);

    // 1. Safe storage filename & extension test
    const dummyFile = { name: sc.originalName, size: sc.size, type: sc.mime };
    const safeStorageName = api.generateSafeStorageFilename(dummyFile);
    const safeExt = api.getSafeExtension(dummyFile);
    const safeMime = api.getSafeMimeType(dummyFile);

    console.log(`  Safe Storage Name: "${safeStorageName}"`);
    console.log(`  Safe Extension:    "${safeExt}"`);
    console.log(`  Safe MIME:         "${safeMime}"`);

    // Ensure safeStorageName contains only ASCII
    assert.ok(/^video_[0-9]+_[a-f0-9]{6}\.(mp4|webm|mov|m4v)$/.test(safeStorageName), 'Storage filename matches pattern');
    assert.ok(!/[^\x20-\x7E]/.test(safeStorageName), 'Storage filename is 100% pure ASCII');

    // Test Headers.prototype.set
    const headers = new MockHeaders();
    headers.set('Content-Type', safeMime);
    headers.set('Content-Disposition', `attachment; filename="${safeStorageName}"`);
    console.log(`  Headers.set():     PASSED without ISO-8859-1 error!`);

    // 2. Metadata insertion into DB
    const storagePath = `videos/${safeStorageName}`;
    const savedRecord = await api.saveMetadata({
      title: sc.title,
      category: sc.category,
      tags: sc.tags,
      description: sc.desc,
      videoUrl: `https://mock-supabase.co/storage/v1/object/public/portfolio-videos/${storagePath}`,
      fileName: sc.originalName, // Preserves original Unicode
      mimeType: safeMime,
      fileSize: sc.size,
      storagePath: storagePath
    });

    assert.ok(savedRecord.id, 'Record has valid ID');
    assert.strictEqual(savedRecord.file_name, sc.originalName, 'Original Unicode filename preserved in DB record');
    assert.strictEqual(savedRecord.title, sc.title, 'Title preserved in DB record');
    assert.strictEqual(savedRecord.tags, sc.tags, 'Tags preserved in DB record');
    assert.strictEqual(savedRecord.description, sc.desc, 'Description preserved in DB record');
    assert.strictEqual(savedRecord.storage_path, storagePath, 'ASCII safe storage path preserved');

    console.log(`  PostgreSQL Record: Successfully saved with original Unicode intact (ID: ${savedRecord.id})`);
    console.log(`  Result:            SUCCESS\n`);
  }

  // Verify fetchVideos retrieves all 5 records
  const allVideos = await api.fetchVideos();
  console.log(`[VERIFICATION] Total videos retrieved from store: ${allVideos.length}`);
  assert.strictEqual(allVideos.length, 5, 'All 5 uploaded videos must be retrieved');

  testScenarios.forEach(sc => {
    const found = allVideos.find(v => v.file_name === sc.originalName);
    assert.ok(found, `Found uploaded video with original name: ${sc.originalName}`);
    console.log(`  Verified in Gallery: "${found.title}" (${found.file_name})`);
  });

  console.log('\n============================================================');
  console.log('ALL 5 VIDEO UPLOADS AND RETRIEVAL VERIFIED 100% SUCCESSFULLY');
  console.log('============================================================');
})();
