const fs = require('fs');
const assert = require('assert');

console.log('=== TESTING TUS RESUMABLE UPLOAD INTEGRATION ===\n');

// Mock browser environment with tus
const mockDatabase = [];

class MockBlob {
  constructor(content = ['dummy'], options = {}) {
    this.size = options.size || 25 * 1024 * 1024;
    this.type = options.type !== undefined ? options.type : 'video/mp4';
  }
  slice(start, end) {
    return new MockBlob(['sliced'], { size: (end - start), type: this.type });
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

let tusStartCalled = false;
let tusProgressEvents = [];
let tusSuccessCalled = false;

// Mock window.tus
class MockTusUpload {
  constructor(file, options) {
    this.file = file;
    this.options = options;
  }

  start() {
    tusStartCalled = true;
    assert.strictEqual(this.options.endpoint, 'https://mock-project.supabase.co/storage/v1/upload/resumable');
    assert.strictEqual(this.options.metadata.bucketName, 'portfolio-videos');
    assert.strictEqual(this.options.metadata.contentType, 'video/quicktime');
    assert.strictEqual(this.options.headers.apikey, 'mock-anon-key-12345');
    assert.ok(this.options.chunkSize >= 6 * 1024 * 1024, 'Tus chunk size is at least 6MB');

    // Simulate progress
    this.options.onProgress(6 * 1024 * 1024, 25 * 1024 * 1024);
    this.options.onProgress(18 * 1024 * 1024, 25 * 1024 * 1024);
    this.options.onProgress(25 * 1024 * 1024, 25 * 1024 * 1024);

    // Simulate success
    tusSuccessCalled = true;
    this.options.onSuccess();
  }
}

global.window = {
  tus: {
    Upload: MockTusUpload
  },
  SUPABASE_CONFIG: {
    url: 'https://mock-project.supabase.co',
    anonKey: 'mock-anon-key-12345',
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
              }
            };
          }
        },
        from(tableName) {
          return {
            insert(records) {
              return {
                select() {
                  mockDatabase.push(...records);
                  return Promise.resolve({ data: records, error: null });
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
global.navigator = { userAgent: 'iPhone; CPU iPhone OS 17_0 like Mac OS X (Mobile Safari)' };

// Load the updated client
const clientCode = fs.readFileSync('c:/sai-resume/js/supabase-client.js', 'utf8');
eval(clientCode);

async function runTusTest() {
  const clientApi = global.window.ShacreatzSupabase;
  assert.ok(clientApi, 'ShacreatzSupabase API must be defined');

  await clientApi.init();

  const testFile = new MockFile(['ios-video-bytes'], 'IMG_9912.MOV', {
    type: 'video/quicktime',
    size: 25 * 1024 * 1024
  });

  const progressUpdates = [];
  const result = await clientApi.uploadVideo(testFile, (pct, msg) => {
    progressUpdates.push({ pct, msg });
  });

  assert.ok(tusStartCalled, 'TUS start() was called');
  assert.ok(tusSuccessCalled, 'TUS onSuccess() was called');
  assert.ok(result.publicUrl.includes('portfolio-videos/videos/video_'), 'Public URL was generated');
  assert.strictEqual(result.mimeType, 'video/quicktime', 'MIME type is video/quicktime');
  assert.ok(progressUpdates.length > 0, 'Progress callback received updates');

  console.log('  TUS Resumable Upload Result:', result.publicUrl);
  console.log('  Progress events logged:', progressUpdates.length);
  console.log('=== TUS RESUMABLE UPLOAD TEST PASSED SUCCESSFULLY ===\n');
}

runTusTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
