const fs = require('fs');
const assert = require('assert');

console.log('================================================================');
console.log('SHACREATZ — VERCEL PRODUCTION ENVIRONMENT AUDIT & SIMULATION');
console.log('================================================================\n');

// Load /api/config.js
const configMod = require('../api/config.js');
const configHandler = configMod.default || configMod;

function createMockRes() {
  return {
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(d) { this.data = d; return this; },
    end() { this.ended = true; return this; }
  };
}

console.log('--- TEST 1: VERCEL CURRENT PRODUCTION STATE (Masked Bullet Key) ---');
process.env.SUPABASE_URL = 'https://ezblrsplntbxtwfuxepx.supabase.co';
process.env.SUPABASE_ANON_KEY = '••••••••••••••••••••••••••••••••••••••••'; // Exactly what is currently on Vercel!

const res1 = createMockRes();
configHandler({ method: 'GET' }, res1);

assert.strictEqual(res1.data.isConfigured, false, 'Must NOT mark as configured when key has bullet characters');
assert.strictEqual(res1.data.supabaseAnonKey, '', 'Must NOT send bullet characters to client');
assert.strictEqual(res1.data.diagnostic.status, 'CONFIGURATION_ERROR');
assert.ok(res1.data.diagnostic.message.includes('masked bullet characters'), 'Diagnostic clearly identifies masked bullets');
console.log('  PASS: /api/config correctly caught masked bullet key from Vercel settings.');
console.log('  Diagnostic Message:', res1.data.diagnostic.message);

console.log('\n--- TEST 2: FRONTEND RUNTIME RESILIENCE WITH BULLET ENVIRONMENT ---');
// Setup global mock for client
class MockBlob {
  constructor(content = ['dummy'], options = {}) {
    this.size = options.size || 15 * 1024 * 1024;
    this.type = options.type !== undefined ? options.type : 'video/mp4';
  }
}
global.Blob = MockBlob;

class MockFile extends MockBlob {
  constructor(content, name, options = {}) {
    super(content, options);
    this.name = name;
  }
}
global.File = MockFile;

global.window = {
  SUPABASE_CONFIG: {
    url: '',
    anonKey: '',
    bucketName: 'portfolio-videos',
    tableName: 'portfolio_videos'
  },
  localStorage: {
    data: {},
    getItem(k) { return this.data[k] || null; },
    setItem(k, v) { this.data[k] = String(v); },
    removeItem(k) { delete this.data[k]; }
  },
  fetch: async (url) => {
    if (url === '/api/config') {
      return {
        ok: true,
        json: async () => res1.data
      };
    }
    return { ok: false };
  }
};
global.document = { readyState: 'complete', addEventListener() {} };
global.navigator = { userAgent: 'Vercel-Production-Chrome/124.0.0.0' };

// Load supabase client
const clientCode = fs.readFileSync('c:/sai-resume/js/supabase-client.js', 'utf8');
eval(clientCode);

const clientApi = global.window.ShacreatzSupabase;

async function testFrontendFallback() {
  await clientApi.init();

  // Verify that client is in safe local mode and not crashed
  assert.strictEqual(clientApi.isConfigured(), false, 'isConfigured() should be false due to masked bullets');

  const videoFile = new MockFile(['video-data'], 'production_test.mp4', {
    type: 'video/mp4',
    size: 20 * 1024 * 1024
  });

  const uploadResult = await clientApi.uploadVideo(videoFile);
  assert.ok(uploadResult.isLocalBlob, 'Upload gracefully succeeded in local persistence mode');

  const metaResult = await clientApi.saveMetadata({
    title: 'Production Test Video',
    category: 'Commercial',
    videoUrl: uploadResult.publicUrl,
    fileName: videoFile.name,
    mimeType: uploadResult.mimeType,
    fileSize: videoFile.size,
    storagePath: uploadResult.storagePath,
    isLocalBlob: uploadResult.isLocalBlob,
    fileBlob: uploadResult.fileBlob
  });

  assert.ok(metaResult.id, 'Record successfully created with ID');
  console.log('  PASS: Frontend did NOT crash with "Failed to fetch" on masked bullet key.');
  console.log('  Video successfully saved and persisted in local adapter (ID: ' + metaResult.id + ')');
}

console.log('\n--- TEST 3: VERCEL WITH REAL JWT KEY ---');
process.env.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6Ymxyc3BsbnRieHR3ZnV4ZXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAwMDAwMDAsImV4cCI6MjA0NTU3NjAwMH0.mockvalidactualjwttokenhere12345';
const res3 = createMockRes();
configHandler({ method: 'GET' }, res3);

assert.strictEqual(res3.data.isConfigured, true, 'isConfigured should be true for valid JWT key');
assert.strictEqual(res3.data.diagnostic.status, 'READY');
assert.strictEqual(res3.data.supabaseAnonKey, process.env.SUPABASE_ANON_KEY);
console.log('  PASS: /api/config correctly recognizes and passes valid Supabase JWT key.');

testFrontendFallback().then(() => {
  console.log('\n================================================================');
  console.log('ALL PRODUCTION AUDIT & SIMULATION TESTS PASSED (100% SUCCESS)');
  console.log('================================================================\n');
}).catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
