const fs = require('fs');
const assert = require('assert');

console.log('================================================================');
console.log('SHACREATZ — ANDROID CHROME & IPHONE SAFARI FULL PIPELINE AUDIT');
console.log('================================================================\n');

// Mock browser environment
const databaseRecords = [];
const storageUploadedFiles = new Map();

class MockBlob {
  constructor(content = ['dummy-data'], options = {}) {
    this.size = options.size || 35 * 1024 * 1024;
    this.type = options.type !== undefined ? options.type : 'video/mp4';
  }
  slice(start, end) {
    return new MockBlob(['slice'], { size: end - start, type: this.type });
  }
  async arrayBuffer() {
    return new ArrayBuffer(Math.min(1024, this.size));
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
    url: 'https://actual-shacreatz-project.supabase.co',
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
    createClient(url, anonKey) {
      return {
        auth: {
          async getSession() {
            return {
              data: {
                session: {
                  access_token: 'valid-admin-jwt-token-abcdef123456',
                  user: { role: 'authenticated' }
                }
              }
            };
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
              async upload(storagePath, body, options) {
                storageUploadedFiles.set(storagePath, { body, options });
                return { data: { path: storagePath }, error: null };
              },
              async remove(paths) {
                paths.forEach((p) => storageUploadedFiles.delete(p));
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
                  const saved = records.map((r, i) => ({
                    id: 'pg_uuid_' + Date.now() + '_' + i,
                    ...r
                  }));
                  databaseRecords.push(...saved);
                  return Promise.resolve({ data: saved, error: null });
                }
              };
            },
            select() {
              return {
                order() {
                  return {
                    range() {
                      return Promise.resolve({ data: [...databaseRecords], error: null });
                    }
                  };
                }
              };
            }
          };
        }
      };
    }
  }
};

global.document = {
  readyState: 'complete',
  addEventListener() {}
};

// Mock XMLHttpRequest with full preflight & header inspection
class MockXMLHttpRequest {
  constructor() {
    this.upload = { onprogress: null };
    this.headers = {};
    this.timeout = 0;
    this.status = 200;
    this.responseText = JSON.stringify({ Key: 'portfolio-videos/videos/mock.mp4' });
  }

  open(method, url) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name, val) {
    // Assert NO unpermitted CORS headers are sent!
    assert.notStrictEqual(name.toLowerCase(), 'cache-control', 'cache-control header must NOT be sent in CORS XHR request!');
    assert.notStrictEqual(name.toLowerCase(), 'content-length', 'Content-Length must NOT be manually set!');
    this.headers[name] = val;
  }

  send(body) {
    // Verify valid body and endpoint
    assert.ok(this.headers['apikey'].startsWith('eyJhbGci'));
    assert.strictEqual(this.headers['Authorization'], 'Bearer valid-admin-jwt-token-abcdef123456');
    assert.strictEqual(this.headers['x-upsert'], 'false');

    // Simulate progress
    if (typeof this.upload.onprogress === 'function') {
      this.upload.onprogress({ lengthComputable: true, loaded: 10 * 1024 * 1024, total: 35 * 1024 * 1024 });
      this.upload.onprogress({ lengthComputable: true, loaded: 35 * 1024 * 1024, total: 35 * 1024 * 1024 });
    }

    storageUploadedFiles.set(this.url, { body, headers: this.headers });

    setTimeout(() => {
      if (typeof this.onload === 'function') {
        this.onload();
      }
    }, 10);
  }
}
global.XMLHttpRequest = MockXMLHttpRequest;

// Load supabase client
const clientCode = fs.readFileSync('c:/sai-resume/js/supabase-client.js', 'utf8');
eval(clientCode);

const clientApi = global.window.ShacreatzSupabase;

async function runDeviceAudits() {
  console.log('--- TEST 1: ANDROID CHROME (Samsung Galaxy / Pixel) ---');
  global.navigator = {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36'
  };

  // Android: File from Camera Roll without extension (content URI), MIME: video/mp4
  const androidFile1 = new MockFile(['android-stream-data'], '1000049281', {
    type: 'video/mp4',
    size: 42 * 1024 * 1024
  });

  const upload1 = await clientApi.uploadVideo(androidFile1, (pct, msg) => {
    // console.log(`  [Android 1 Progress] ${pct}%: ${msg}`);
  });

  assert.ok(upload1.publicUrl.endsWith('.mp4'), 'Safe storage extension is .mp4');
  assert.strictEqual(upload1.mimeType, 'video/mp4');

  const meta1 = await clientApi.saveMetadata({
    title: 'Drift Showcase — Hyderabad Night Session',
    category: 'Automotive Reel',
    tags: '#Drift #Automotive',
    description: 'Shot on Samsung Galaxy S24 Ultra in 4K60',
    videoUrl: upload1.publicUrl,
    fileName: androidFile1.name,
    mimeType: upload1.mimeType,
    fileSize: androidFile1.size,
    storagePath: upload1.storagePath
  });

  assert.strictEqual(meta1.file_name, '1000049281', 'Original file name preserved in PostgreSQL');
  console.log('  PASS: Android MP4 without extension successfully uploaded and stored.');
  console.log('        Public URL:', upload1.publicUrl);

  console.log('\n--- TEST 2: IPHONE SAFARI (iOS 17 Native Camera Roll) ---');
  global.navigator = {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1'
  };

  // iPhone: MOV video with uppercase extension and empty MIME type (iOS WebKit quirk)
  const iphoneFile1 = new MockFile(['ios-mov-stream-data'], 'IMG_3847.MOV', {
    type: '', // Empty MIME from iOS Photos app!
    size: 78 * 1024 * 1024
  });

  const upload2 = await clientApi.uploadVideo(iphoneFile1, (pct, msg) => {
    // console.log(`  [iPhone 1 Progress] ${pct}%: ${msg}`);
  });

  assert.ok(upload2.publicUrl.endsWith('.mov'), 'Safe storage extension is .mov');
  assert.strictEqual(upload2.mimeType, 'video/quicktime', 'Resolved MIME type is video/quicktime');

  const meta2 = await clientApi.saveMetadata({
    title: 'Cinematic Anamorphic Rolling Shots',
    category: 'Commercial Reel',
    tags: '#Cinematic #Anamorphic',
    description: 'ProRes Log footage graded in DaVinci Resolve',
    videoUrl: upload2.publicUrl,
    fileName: iphoneFile1.name,
    mimeType: upload2.mimeType,
    fileSize: iphoneFile1.size,
    storagePath: upload2.storagePath
  });

  assert.strictEqual(meta2.file_name, 'IMG_3847.MOV', 'Original file name preserved in PostgreSQL');
  console.log('  PASS: iPhone MOV with empty MIME successfully uploaded and stored.');
  console.log('        Public URL:', upload2.publicUrl);

  console.log('\n--- TEST 3: IPHONE SAFARI (High-Resolution MP4 with Spaces & Emojis) ---');
  const iphoneFile2 = new MockFile(['ios-emoji-video'], 'Reel Final Edit 🎬 (BMW M4) 🔥.mp4', {
    type: 'video/mp4',
    size: 55 * 1024 * 1024
  });

  const upload3 = await clientApi.uploadVideo(iphoneFile2);
  assert.ok(!upload3.safeFilename.includes('🎬'), 'Storage filename stripped emojis for ASCII safety');
  assert.ok(!upload3.safeFilename.includes('🔥'), 'Storage filename stripped emojis for ASCII safety');

  const meta3 = await clientApi.saveMetadata({
    title: 'Reel Final Edit 🎬 (BMW M4) 🔥',
    category: 'Color Grading',
    tags: '#BMW #M4',
    description: 'Cinematic color pass',
    videoUrl: upload3.publicUrl,
    fileName: iphoneFile2.name,
    mimeType: upload3.mimeType,
    fileSize: iphoneFile2.size,
    storagePath: upload3.storagePath
  });

  assert.strictEqual(meta3.file_name, 'Reel Final Edit 🎬 (BMW M4) 🔥.mp4', 'Original Unicode with emojis preserved in DB');
  console.log('  PASS: Emoji/Unicode iPhone file uploaded with ASCII storage name & intact DB metadata.');

  console.log('\n--- TEST 4: PUBLIC GALLERY RETRIEVAL ---');
  const allVideos = await clientApi.fetchVideos();
  assert.strictEqual(allVideos.length, 3, 'All 3 uploaded videos exist in database store');
  assert.ok(allVideos.some((v) => v.title.includes('Drift Showcase')));
  assert.ok(allVideos.some((v) => v.title.includes('Cinematic Anamorphic')));
  assert.ok(allVideos.some((v) => v.title.includes('Reel Final Edit')));
  console.log('  PASS: All 3 videos retrieved for public gallery successfully.');

  console.log('\n================================================================');
  console.log('ALL ANDROID CHROME & IPHONE SAFARI TESTS PASSED (100% SUCCESS)');
  console.log('================================================================\n');
}

runDeviceAudits().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
