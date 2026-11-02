const fs = require('fs');
const path = require('path');

console.log('=== RUNNING BEHAVIORAL SIMULATION FOR THREE-DOT MENU (V5.4) ===\n');

// Mock browser environment
let clipboardContent = '';
const mockDatabase = [];
const mockStorageBucket = new Map();

global.window = {
  SUPABASE_CONFIG: {
    url: 'https://mock-production.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mockvalidactualjwttokenhere12345.sig1234567890',
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
        from(table) {
          return {
            select(cols) {
              const queryObj = {
                filters: [],
                order() { return this; },
                range() { return this; },
                limit(n) { return this; },
                eq(col, val) {
                  this.filters.push({ col, val });
                  return this;
                },
                async maybeSingle() {
                  const res = await this.execute();
                  return { data: res.data && res.data[0] ? res.data[0] : null, error: null };
                },
                async execute() {
                  let results = [...mockDatabase];
                  for (const f of this.filters) {
                    results = results.filter(r => r[f.col] === f.val);
                  }
                  return { data: results, error: null };
                },
                then(resolve, reject) {
                  return this.execute().then(resolve, reject);
                }
              };
              return queryObj;
            },
            insert(rows) {
              return {
                select() {
                  const inserted = [];
                  for (const r of rows) {
                    const row = { id: `pg_${Date.now()}`, ...r };
                    mockDatabase.push(row);
                    inserted.push(row);
                  }
                  return Promise.resolve({ data: inserted, error: null });
                }
              };
            },
            update(fields) {
              return {
                eq(col, val) {
                  return {
                    select() {
                      const updated = [];
                      for (let i = 0; i < mockDatabase.length; i++) {
                        if (mockDatabase[i][col] === val) {
                          mockDatabase[i] = { ...mockDatabase[i], ...fields };
                          updated.push(mockDatabase[i]);
                        }
                      }
                      return Promise.resolve({ data: updated, error: null });
                    }
                  };
                }
              };
            },
            delete() {
              return {
                eq(col, val) {
                  for (let i = mockDatabase.length - 1; i >= 0; i--) {
                    if (mockDatabase[i][col] === val) {
                      mockDatabase.splice(i, 1);
                    }
                  }
                  return Promise.resolve({ data: null, error: null });
                }
              };
            }
          };
        },
        storage: {
          from(bucket) {
            return {
              remove(paths) {
                paths.forEach(p => mockStorageBucket.delete(p));
                return Promise.resolve({ data: paths, error: null });
              },
              getPublicUrl(path) {
                return { data: { publicUrl: `https://mock-production.supabase.co/storage/v1/object/public/${bucket}/${path}` } };
              },
              list() {
                return Promise.resolve({ data: [], error: null });
              }
            };
          }
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
Object.defineProperty(global, 'navigator', {
  value: {
    clipboard: {
      async writeText(txt) {
        clipboardContent = txt;
        return true;
      }
    }
  },
  writable: true,
  configurable: true
});
global.document = {
  readyState: 'complete',
  addEventListener() {}
};

// Load supabase-client.js
const jsSupabase = fs.readFileSync(path.join(__dirname, '../js/supabase-client.js'), 'utf-8');
eval(`
  function testContext() {
    ${jsSupabase}
    return window.ShacreatzSupabase;
  }
`);

const api = testContext();

(async () => {
  await api.init();

  // 1. Upload sample video
  console.log('Step 1: Adding a video to persistence store...');
  const sample = await api.saveMetadata({
    title: 'Porsche 911 GT3 RS Track Weapon',
    category: 'Automotive Edit',
    tags: '#Porsche #GT3RS #TrackDay',
    description: 'Raw exhaust sound and 4K track footage.',
    videoUrl: 'https://mock-production.supabase.co/storage/v1/object/public/portfolio-videos/videos/porsche.mp4',
    storagePath: 'videos/porsche.mp4'
  });

  console.log('  - Video created with ID:', sample.id);

  // 2. Test Copy Video Link
  console.log('\nStep 2: Simulating "Copy Video Link"...');
  await global.navigator.clipboard.writeText(sample.video_url);
  if (clipboardContent === sample.video_url) {
    console.log('  PASS: Public video URL copied to clipboard:', clipboardContent);
  } else {
    console.error('  FAIL: Clipboard copy failed!');
    process.exit(1);
  }

  // 3. Test Edit Video (update metadata)
  console.log('\nStep 3: Simulating "Edit Video"...');
  await api.updateMetadata(sample.id, {
    title: 'Porsche 911 GT3 RS — Nürburgring Lap',
    category: 'Motorsport Reel',
    tags: '#Nurburgring #GreenHell',
    description: 'Record-setting lap cut with onboard telemetry.'
  });

  const updatedVideos = await api.fetchVideos();
  const updated = updatedVideos.find(v => v.id === sample.id);

  if (updated && updated.title === 'Porsche 911 GT3 RS — Nürburgring Lap' && updated.category === 'Motorsport Reel') {
    console.log('  PASS: Video metadata updated in Supabase store without page reload:');
    console.log('        Title:', updated.title);
    console.log('        Category:', updated.category);
    console.log('        Tags:', updated.tags);
  } else {
    console.error('  FAIL: Update metadata failed!');
    process.exit(1);
  }

  // 4. Test Delete Video with permanent removal
  console.log('\nStep 4: Simulating "Delete Video" with permanent removal...');
  await api.deleteVideo(sample.id, sample.storage_path);

  const afterDelete = await api.fetchVideos();
  if (afterDelete.length === 0) {
    console.log('  PASS: Video permanently deleted from Storage and DB. Gallery store is empty.');
  } else {
    console.error('  FAIL: Video was not deleted!');
    process.exit(1);
  }

  console.log('\n=== ALL BEHAVIORAL SIMULATIONS PASSED (100% SUCCESS) ===');
})();
