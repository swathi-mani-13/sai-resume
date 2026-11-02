const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log('SHACREATZ — COMPREHENSIVE MOBILE VIDEO UPLOAD PIPELINE TEST');
console.log('================================================================\n');

// 1. Mock Browser Environment
const mockDatabase = [];

class MockBlob {
  constructor(content = ['dummy'], options = {}) {
    this.size = options.size || 1024 * 1024;
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
    url: 'https://mock-project.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiFhbm9uIn0.mocksignature123456789012345678901234567890',
    bucketName: 'portfolio-videos',
    tableName: 'portfolio_videos'
  },
  localStorage: {
    data: {},
    getItem(k) { return this.data[k] || null; },
    setItem(k, v) { this.data[k] = String(v); },
    removeItem(k) { delete this.data[k]; }
  },
  supabase: {
    createClient(url, key) {
      return {
        auth: {
          async getSession() {
            return { data: { session: null } };
          }
        },
        storage: {
          from(bucket) {
            return {
              getPublicUrl(storagePath) {
                return {
                  data: {
                    publicUrl: `${url}/storage/v1/object/public/${bucket}/${storagePath}`
                  }
                };
              },
              async upload(storagePath, file, options) {
                if (MockXMLHttpRequest.simulateSdkFailure) {
                  return { data: null, error: new Error('Supabase SDK Upload Simulated Failure') };
                }
                return {
                  data: { path: storagePath },
                  error: null
                };
              },
              async remove(paths) {
                return { data: paths, error: null };
              }
            };
          }
        },
        from(tableName) {
          return {
            insert(records) {
              return {
                select() {
                  if (MockXMLHttpRequest.simulateDbFailure) {
                    return Promise.resolve({ data: null, error: new Error('Simulated PostgreSQL Connection Error') });
                  }
                  const saved = records.map((r, i) => ({
                    id: 'mock_uuid_' + Date.now() + '_' + i,
                    ...r
                  }));
                  mockDatabase.push(...saved);
                  return Promise.resolve({ data: saved, error: null });
                }
              };
            },
            select() {
              return {
                order() {
                  return {
                    range() {
                      return Promise.resolve({ data: [...mockDatabase], error: null });
                    }
                  };
                }
              };
            },
            delete() {
              return {
                eq(field, val) {
                  const idx = mockDatabase.findIndex(v => v[field] === val);
                  if (idx !== -1) mockDatabase.splice(idx, 1);
                  return Promise.resolve({ data: null, error: null });
                }
              };
            }
          };
        }
      };
    }
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

// Mock XMLHttpRequest for streaming mobile uploads
class MockXMLHttpRequest {
  constructor() {
    this.upload = {
      onprogress: null
    };
    this.headers = {};
    this.status = 200;
    this.responseText = JSON.stringify({ Key: 'portfolio-videos/videos/video_mock.mp4' });
    this.timeout = 0;
    this.onload = null;
    this.onerror = null;
    this.ontimeout = null;
  }
  open(method, url) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k, v) {
    this.headers[k] = v;
  }
  send(body) {
    this.sentBody = body;
    // Simulate streaming progress events
    setTimeout(() => {
      if (MockXMLHttpRequest.simulateTimeout) {
        if (typeof this.ontimeout === 'function') this.ontimeout();
        return;
      }
      if (MockXMLHttpRequest.simulateNetworkError) {
        if (typeof this.onerror === 'function') this.onerror();
        return;
      }
      if (MockXMLHttpRequest.simulateStatus) {
        this.status = MockXMLHttpRequest.simulateStatus;
        this.responseText = MockXMLHttpRequest.simulateResponseText || 'Error';
      }

      const totalSize = (body && body.size) || 20000000;
      if (typeof this.upload.onprogress === 'function') {
        this.upload.onprogress({ lengthComputable: true, loaded: Math.floor(totalSize * 0.4), total: totalSize });
        this.upload.onprogress({ lengthComputable: true, loaded: Math.floor(totalSize * 0.8), total: totalSize });
        this.upload.onprogress({ lengthComputable: true, loaded: totalSize, total: totalSize });
      }

      if (typeof this.onload === 'function') {
        this.onload();
      }
    }, 10);
  }
}
global.XMLHttpRequest = MockXMLHttpRequest;

// Load js/supabase-client.js
const code = fs.readFileSync(path.join(__dirname, '../js/supabase-client.js'), 'utf-8');
eval(`
  function loadClient() {
    ${code}
    return window.ShacreatzSupabase;
  }
`);

const api = loadClient();

// 2. Define Mobile Test Scenarios
const mobileScenarios = [
  {
    platform: 'Android Chrome',
    description: 'Standard Android MP4 Video',
    file: new MockFile(['dummy-mp4-data'], '1000087683.mp4', {
      type: 'video/mp4',
      size: 24500000
    }),
    expectedExt: 'mp4',
    expectedMime: 'video/mp4',
    title: 'Drift Session at Midnight',
    category: 'Automotive Edits'
  },
  {
    platform: 'Android Chrome',
    description: 'Android Camera File with NO Extension (Content URI)',
    file: new MockFile(['dummy-content-data'], 'VID_20261101_172030', {
      type: 'video/mp4',
      size: 38200000
    }),
    expectedExt: 'mp4',
    expectedMime: 'video/mp4',
    title: 'Urban Street Night Ride',
    category: 'Lifestyle'
  },
  {
    platform: 'iPhone Safari',
    description: 'iPhone MOV Video with EMPTY MIME Type ("")',
    file: new MockFile(['dummy-mov-data'], 'trim.E4A921-2A1B.MOV', {
      type: '', // iOS Photos empty MIME edge case
      size: 42100000
    }),
    expectedExt: 'mov',
    expectedMime: 'video/quicktime',
    title: 'Anamorphic Mountain Drone Pass',
    category: 'Cinematic'
  },
  {
    platform: 'iPhone Safari',
    description: 'iPhone MOV Video with quicktime MIME & Uppercase Ext',
    file: new MockFile(['dummy-mov-data-2'], 'IMG_4821.MOV', {
      type: 'video/quicktime',
      size: 85400000
    }),
    expectedExt: 'mov',
    expectedMime: 'video/quicktime',
    title: 'Sunset Rolling Shots',
    category: 'Automotive Edits'
  },
  {
    platform: 'iPhone Safari',
    description: 'iPhone MP4 Video with Uppercase Extension',
    file: new MockFile(['dummy-mp4-data-2'], 'RECORDING_2026.MP4', {
      type: 'video/mp4',
      size: 19800000
    }),
    expectedExt: 'mp4',
    expectedMime: 'video/mp4',
    title: 'Cyberpunk Tokyo Beat Sync',
    category: 'Reels'
  },
  {
    platform: 'Android Chrome',
    description: 'WebM High-Efficiency Video',
    file: new MockFile(['dummy-webm-data'], 'tokyo_neon_drift.webm', {
      type: 'video/webm',
      size: 14200000
    }),
    expectedExt: 'webm',
    expectedMime: 'video/webm',
    title: 'Tokyo Neon Drift',
    category: 'Commercials'
  },
  {
    platform: 'iPhone / Android',
    description: 'Unicode, Spaces & Emojis in Filename',
    file: new MockFile(['dummy-unicode-data'], 'BMW M4 — Track Day (🔥) தமிழ்_காட்சி.mov', {
      type: 'video/quicktime',
      size: 67300000
    }),
    expectedExt: 'mov',
    expectedMime: 'video/quicktime',
    title: 'BMW M4 Track Weapon 🔥',
    category: 'Automotive Edits'
  }
];

(async () => {
  let passedCount = 0;

  console.log('--- TEST SUITE 1: MOBILE FILE SELECTION & RESOLUTION TRACE ---');
  mobileScenarios.forEach((sc, idx) => {
    console.log(`\n[Scenario ${idx + 1}/${mobileScenarios.length}] ${sc.platform}: ${sc.description}`);
    console.log(`  Input File:     "${sc.file.name}"`);
    console.log(`  Input MIME:     "${sc.file.type || '(empty / unspecified)'}"`);
    console.log(`  Input Size:     ${sc.file.size} bytes (${(sc.file.size / (1024 * 1024)).toFixed(1)} MB)`);

    const safeExt = api.getSafeExtension(sc.file);
    const safeMime = api.getSafeMimeType(sc.file, safeExt);
    const safeFilename = api.generateSafeStorageFilename(sc.file);

    console.log(`  Safe Extension: "${safeExt}" (Expected: "${sc.expectedExt}")`);
    console.log(`  Safe MIME:      "${safeMime}" (Expected: "${sc.expectedMime}")`);
    console.log(`  Storage File:   "${safeFilename}"`);

    assert.strictEqual(safeExt, sc.expectedExt, `Safe extension should match expected ${sc.expectedExt}`);
    assert.strictEqual(safeMime, sc.expectedMime, `Safe MIME should match expected ${sc.expectedMime}`);
    assert.ok(/^video_[0-9]+_[a-f0-9]{6}\.(mp4|mov|webm|m4v|3gp)$/.test(safeFilename), 'Storage filename matches ASCII pattern');
    assert.ok(!/[^\x20-\x7E]/.test(safeFilename), 'Storage filename is 100% pure ASCII');

    passedCount++;
  });

  console.log(`\n=> All ${passedCount} Mobile File Resolution tests PASSED!`);

  console.log('\n--- TEST SUITE 2: COMPLETE MOBILE UPLOAD & METADATA INSERTION ---');
  for (let i = 0; i < mobileScenarios.length; i++) {
    const sc = mobileScenarios[i];
    console.log(`\n[Upload ${i + 1}/${mobileScenarios.length}] Uploading ${sc.description}...`);

    let progressEvents = [];
    const uploadRes = await api.uploadVideo(sc.file, (pct, msg) => {
      progressEvents.push({ pct, msg });
    });

    console.log(`  Upload Result: Public URL: ${uploadRes.publicUrl}`);
    console.log(`  Storage Path: ${uploadRes.storagePath}`);
    console.log(`  Progress count: ${progressEvents.length} events (Final: ${progressEvents[progressEvents.length - 1].pct}%)`);

    assert.ok(uploadRes.publicUrl, 'Public URL must be defined');
    assert.ok(uploadRes.storagePath.startsWith('videos/'), 'Storage path starts with videos/');
    assert.strictEqual(progressEvents[progressEvents.length - 1].pct, 100, 'Upload progress must reach 100%');

    // Save metadata in PostgreSQL
    const dbRecord = await api.saveMetadata({
      title: sc.title,
      category: sc.category,
      tags: '#mobile #test',
      description: 'Mobile upload verification test',
      videoUrl: uploadRes.publicUrl,
      fileName: sc.file.name, // Preserves original full-Unicode filename
      mimeType: uploadRes.mimeType,
      fileSize: sc.file.size,
      storagePath: uploadRes.storagePath,
      isLocalBlob: uploadRes.isLocalBlob,
      fileBlob: uploadRes.fileBlob
    });

    assert.ok(dbRecord.id, 'Record ID exists');
    assert.strictEqual(dbRecord.file_name, sc.file.name, 'Original filename preserved in DB record');
    assert.strictEqual(dbRecord.title, sc.title, 'Title preserved in DB record');
    console.log(`  PostgreSQL Record Saved: ID=${dbRecord.id}, Original="${dbRecord.file_name}"`);
  }

  console.log('\n--- TEST SUITE 3: GALLERY RETRIEVAL AFTER MOBILE UPLOADS ---');
  const storedVideos = await api.fetchVideos();
  console.log(`Total retrieved videos from store: ${storedVideos.length}`);
  assert.strictEqual(storedVideos.length, mobileScenarios.length, `Store should contain all ${mobileScenarios.length} videos`);
  mobileScenarios.forEach(sc => {
    const found = storedVideos.find(v => v.file_name === sc.file.name);
    assert.ok(found, `Found uploaded mobile video: ${sc.file.name}`);
    console.log(`  Verified in Gallery: "${found.title}" (${found.file_name})`);
  });

  console.log('\n--- TEST SUITE 4: SIMULATING STORAGE FAILURE & DETAILED ERROR MESSAGES ---');

  // Test 4.1: Permission denied (HTTP 403)
  MockXMLHttpRequest.simulateStatus = 403;
  MockXMLHttpRequest.simulateResponseText = JSON.stringify({ message: 'Row level security policy violated' });
  try {
    await api.uploadVideo(mobileScenarios[0].file);
    assert.fail('Should have thrown on 403');
  } catch (err) {
    console.log('  Caught 403 Permission Denied:', err.message);
    assert.ok(err.message.includes('permission denied'), 'Error message contains permission denied');
  }

  // Test 4.2: File too large (HTTP 413)
  MockXMLHttpRequest.simulateStatus = 413;
  MockXMLHttpRequest.simulateResponseText = JSON.stringify({ message: 'Payload Too Large' });
  try {
    await api.uploadVideo(mobileScenarios[0].file);
    assert.fail('Should have thrown on 413');
  } catch (err) {
    console.log('  Caught 413 File Too Large:', err.message);
    assert.ok(err.message.includes('too large'), 'Error message mentions file too large');
  }

  // Test 4.3: Network timeout
  MockXMLHttpRequest.simulateStatus = null;
  MockXMLHttpRequest.simulateTimeout = true;
  try {
    await api.uploadVideo(mobileScenarios[0].file);
    assert.fail('Should have thrown on timeout');
  } catch (err) {
    console.log('  Caught Network Timeout:', err.message);
    assert.ok(err.message.includes('timed out'), 'Error message mentions timeout');
  }

  // Test 4.4: Network interruption
  MockXMLHttpRequest.simulateTimeout = false;
  MockXMLHttpRequest.simulateNetworkError = true;
  try {
    await api.uploadVideo(mobileScenarios[0].file);
    assert.fail('Should have thrown on network error');
  } catch (err) {
    console.log('  Caught Network Interruption:', err.message);
    assert.ok(err.message.includes('Network connection interrupted'), 'Error message mentions network interruption');
  }

  MockXMLHttpRequest.simulateNetworkError = false;

  console.log('\n================================================================');
  console.log('ALL MOBILE VIDEO UPLOAD PIPELINE TESTS PASSED 100% SUCCESSFULLY');
  console.log('================================================================');
})();
