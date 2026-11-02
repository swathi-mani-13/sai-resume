const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log('SHACREATZ — PERMANENT STORAGE & CROSS-DEVICE SYNC AUDIT (V5.4)');
console.log('================================================================\n');

// 1. Setup Mock Browser Environment
const mockStorageData = {};
const mockDatabase = [];
const mockStorageBucket = new Map(); // bucket storage objects

function createMockWindow(isClientConfigured = true) {
  const mockWindow = {
    SUPABASE_CONFIG: {
      url: isClientConfigured ? 'https://mock-production.supabase.co' : '',
      anonKey: isClientConfigured ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mockvalidactualjwttokenhere12345.sig1234567890' : '',
      bucketName: 'portfolio-videos',
      tableName: 'portfolio_videos'
    },
    localStorage: {
      data: {},
      getItem(k) { return this.data[k] || null; },
      setItem(k, v) { this.data[k] = String(v); },
      removeItem(k) { delete this.data[k]; }
    },
    document: {
      readyState: 'complete',
      addEventListener() {}
    },
    supabase: {
      createClient(url, key) {
        return {
          auth: {
            currentSession: null,
            async getSession() {
              return { data: { session: this.currentSession } };
            },
            async signInWithPassword({ email, password }) {
              if (email === 'admin@shacreatz.com' && password === 'SecretAdminPass123') {
                this.currentSession = {
                  access_token: 'valid-admin-jwt-token-abcdef123456',
                  user: { email: 'admin@shacreatz.com', role: 'authenticated' }
                };
                return { data: { user: this.currentSession.user, session: this.currentSession }, error: null };
              }
              return { data: { user: null, session: null }, error: new Error('Invalid login credentials') };
            },
            async signOut() {
              this.currentSession = null;
              return { error: null };
            }
          },
          from(table) {
            assert.strictEqual(table, 'portfolio_videos', 'Must target portfolio_videos table');
            return {
              select(cols) {
                const queryObj = {
                  filters: [],
                  orders: [],
                  limitCount: null,
                  rangeFrom: null,
                  rangeTo: null,
                  order(col, opts) {
                    this.orders.push({ col, asc: opts && opts.ascending });
                    return this;
                  },
                  range(from, to) {
                    this.rangeFrom = from;
                    this.rangeTo = to;
                    return this;
                  },
                  limit(n) {
                    this.limitCount = n;
                    return this;
                  },
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
                    if (this.limitCount !== null) {
                      results = results.slice(0, this.limitCount);
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
                    for (const row of rows) {
                      const newRow = {
                        id: row.id || `pg_uuid_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                        ...row
                      };
                      mockDatabase.push(newRow);
                      inserted.push(newRow);
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
                    const initialLen = mockDatabase.length;
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
              assert.strictEqual(bucket, 'portfolio-videos', 'Must target portfolio-videos bucket');
              return {
                upload(path, body, opts) {
                  mockStorageBucket.set(path, { body, opts, created_at: new Date().toISOString() });
                  return Promise.resolve({ data: { path }, error: null });
                },
                getPublicUrl(path) {
                  return {
                    data: {
                      publicUrl: `https://mock-production.supabase.co/storage/v1/object/public/portfolio-videos/${path}`
                    }
                  };
                },
                remove(paths) {
                  paths.forEach(p => mockStorageBucket.delete(p));
                  return Promise.resolve({ data: paths, error: null });
                },
                list(folder, opts) {
                  const items = [];
                  for (const [key, val] of mockStorageBucket.entries()) {
                    if (key.startsWith(folder ? `${folder}/` : '')) {
                      const filename = key.replace(`${folder}/`, '');
                      items.push({
                        name: filename,
                        created_at: val.created_at,
                        metadata: { size: 1024000, mimetype: 'video/mp4' }
                      });
                    }
                  }
                  return Promise.resolve({ data: items, error: null });
                }
              };
            }
          }
        };
      }
    }
  };

  return mockWindow;
}

// Mock XMLHttpRequest for direct streaming uploads
class MockXHR {
  constructor() {
    this.headers = {};
    this.upload = {};
    this.status = 200;
    this.responseText = '{}';
  }
  open(method, url) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k, v) {
    this.headers[k] = v;
  }
  send(file) {
    const parts = this.url.split('portfolio-videos/');
    const storagePath = parts[1] || 'videos/test.mp4';
    mockStorageBucket.set(storagePath, { file, headers: this.headers, created_at: new Date().toISOString() });
    setTimeout(() => {
      if (typeof this.onload === 'function') {
        this.status = 200;
        this.responseText = JSON.stringify({ Key: storagePath });
        this.onload();
      }
    }, 10);
  }
}

global.XMLHttpRequest = MockXHR;

// Load js/supabase-client.js
const clientCode = fs.readFileSync(path.join(__dirname, '../js/supabase-client.js'), 'utf8');

function loadClientInstance(win) {
  global.window = win;
  global.document = win.document;
  global.localStorage = win.localStorage;
  eval(clientCode);
  return win.ShacreatzSupabase;
}

(async () => {
  // --------------------------------------------------------------------------
  // TEST 1: SUPABASE STORAGE - PERMANENT STORAGE & REJECTION OF LOCALSTORAGE MOCK
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: SUPABASE STORAGE PERMANENCE & NO LOCALSTORAGE FOR VIDEO DB ---');
  
  // 1a. Test that when Supabase is NOT configured, upload throws error instead of saving to local IndexedDB
  const unconfiguredWin = createMockWindow(false);
  const unconfiguredApi = loadClientInstance(unconfiguredWin);
  
  let didThrow = false;
  try {
    const dummyFile = { name: 'test_car_drift.mp4', size: 15000000, type: 'video/mp4' };
    await unconfiguredApi.uploadVideo(dummyFile);
  } catch (err) {
    didThrow = true;
    assert.ok(err.message.includes('not connected') || err.message.includes('not configured'), 'Must inform user that cloud storage is not connected');
    console.log('  PASS: uploadVideo rejected local mock when Supabase not configured.');
    console.log(`        Expected Error Caught: "${err.message}"`);
  }
  assert.ok(didThrow, 'Must NOT silently save to local storage when cloud is disconnected');

  // 1b. Test valid upload with configured client
  const adminWin = createMockWindow(true);
  const adminApi = loadClientInstance(adminWin);
  await adminApi.init();

  const realVideoFile = {
    name: 'BMW M4 — Track Battle 🔥 (Hyderabad).mp4',
    size: 45000000,
    type: 'video/mp4'
  };

  const uploadResult = await adminApi.uploadVideo(realVideoFile);
  assert.ok(uploadResult.publicUrl, 'Must return public streaming URL');
  assert.ok(uploadResult.publicUrl.startsWith('https://mock-production.supabase.co'), 'Must point to production Supabase project');
  assert.ok(uploadResult.storagePath.startsWith('videos/video_'), 'Must have safe timestamped path in portfolio-videos bucket');
  assert.ok(!/[^\x20-\x7E]/.test(uploadResult.safeFilename), 'Storage filename must be 100% pure ASCII');
  assert.strictEqual(uploadResult.isLocalBlob, undefined, 'Must NOT be a local blob');

  // Verify file exists in Supabase Storage bucket
  assert.ok(mockStorageBucket.has(uploadResult.storagePath), 'Video file MUST exist in Supabase Storage portfolio-videos bucket');
  console.log('  PASS: Video permanently uploaded to Supabase Storage:');
  console.log(`        Bucket:       portfolio-videos`);
  console.log(`        Storage Path: ${uploadResult.storagePath}`);
  console.log(`        Public URL:   ${uploadResult.publicUrl}`);

  // --------------------------------------------------------------------------
  // TEST 2: SUPABASE DATABASE INSERTION & ROLLBACK ON FAILURE
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: SUPABASE DATABASE METADATA INSERTION & ROLLBACK ---');

  const metadataPayload = {
    title: 'BMW M4 — Track Battle 🔥',
    category: 'Automotive Edits',
    tags: '#m4 #drift #track #cinematic',
    description: '4K 60fps high bitrate track battle rolling shots.',
    videoUrl: uploadResult.publicUrl,
    fileName: realVideoFile.name,
    mimeType: uploadResult.mimeType,
    fileSize: realVideoFile.size,
    storagePath: uploadResult.storagePath
  };

  const savedRecord = await adminApi.saveMetadata(metadataPayload);
  assert.ok(savedRecord.id, 'Record must have valid database UUID');
  assert.strictEqual(savedRecord.title, 'BMW M4 — Track Battle 🔥', 'Title preserved in PostgreSQL record');
  assert.strictEqual(savedRecord.file_name, realVideoFile.name, 'Full Unicode filename preserved in PostgreSQL');
  assert.strictEqual(savedRecord.storage_path, uploadResult.storagePath, 'Storage path saved in PostgreSQL');
  assert.strictEqual(savedRecord.status, 'published', 'Publication status saved in PostgreSQL');

  // Verify record exists in PostgreSQL database
  const dbMatch = mockDatabase.find(r => r.id === savedRecord.id);
  assert.ok(dbMatch, 'Database record MUST exist in public.portfolio_videos');
  console.log(`  PASS: Database record successfully created (ID: ${savedRecord.id}) in portfolio_videos table.`);

  // 2b. Test duplicate prevention: Inserting same storagePath must return existing record
  const duplicateAttempt = await adminApi.saveMetadata(metadataPayload);
  assert.strictEqual(duplicateAttempt.id, savedRecord.id, 'Duplicate record must be prevented');
  const countInDb = mockDatabase.filter(r => r.storage_path === uploadResult.storagePath).length;
  assert.strictEqual(countInDb, 1, 'Exactly 1 record must exist for this storage path');
  console.log('  PASS: Duplicate insertion prevented; single database record maintained.');

  // --------------------------------------------------------------------------
  // TEST 3: CROSS-DEVICE PUBLIC GALLERY SYNCHRONIZATION
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: CROSS-DEVICE PUBLIC GALLERY SYNCHRONIZATION ---');
  console.log('  Simulating Visitor opening the deployed website on another Phone / Incognito browser...');

  // Create a completely separate browser environment (Device 2) with EMPTY local storage & NO admin login
  const visitorWin = createMockWindow(true);
  visitorWin.localStorage.data = {}; // EMPTY local storage
  const visitorApi = loadClientInstance(visitorWin);
  await visitorApi.init();

  // Verify visitor is NOT admin
  const isVisitorAdmin = await visitorApi.isAdminLoggedIn();
  assert.strictEqual(isVisitorAdmin, false, 'Public visitor must NOT be recognized as admin');
  console.log('  PASS: Public visitor on Device 2 has NO admin session and EMPTY browser storage.');

  // Fetch gallery videos on Device 2
  const galleryResult = await visitorApi.fetchVideos();
  assert.strictEqual(galleryResult.success, true, 'Fetch must succeed from Supabase Cloud');
  assert.strictEqual(galleryResult.videos.length, 1, 'Device 2 MUST see the video uploaded by Device 1');
  
  const visitorViewedVideo = galleryResult.videos[0];
  assert.strictEqual(visitorViewedVideo.id, savedRecord.id, 'Device 2 gets exact same video ID');
  assert.strictEqual(visitorViewedVideo.title, 'BMW M4 — Track Battle 🔥', 'Device 2 gets exact same video title');
  assert.strictEqual(visitorViewedVideo.video_url, uploadResult.publicUrl, 'Device 2 streams from Supabase Storage URL');

  console.log('  PASS: Device 2 successfully loaded published video directly from Supabase Cloud:');
  console.log(`        Title:     "${visitorViewedVideo.title}"`);
  console.log(`        Stream:    ${visitorViewedVideo.video_url}`);
  console.log(`        Device 2 Storage was EMPTY — proved database is the single permanent source of truth!`);

  // --------------------------------------------------------------------------
  // TEST 4: DATA PRESERVATION & ORPHAN RECOVERY (REQUIREMENT 5)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: DATA PRESERVATION & ORPHAN FILE RECOVERY ---');

  // Simulate an orphan file uploaded to Supabase Storage without a database record
  const orphanStoragePath = 'videos/video_1730009999_orph01.mp4';
  mockStorageBucket.set(orphanStoragePath, {
    created_at: new Date(Date.now() - 3600000).toISOString(),
    opts: { contentType: 'video/mp4' }
  });

  // Verify orphan file has NO database record yet
  assert.strictEqual(mockDatabase.some(r => r.storage_path === orphanStoragePath), false);
  console.log(`  Simulated orphaned file in Supabase Storage: "${orphanStoragePath}"`);

  // Device 2 fetches gallery again: fetchVideos should detect and automatically recover the orphan!
  const syncResultAfterOrphan = await visitorApi.fetchVideos();
  assert.strictEqual(syncResultAfterOrphan.success, true);
  assert.strictEqual(syncResultAfterOrphan.videos.length, 2, 'Orphan file must be recovered and included in gallery');

  const recoveredItem = syncResultAfterOrphan.videos.find(v => v.storage_path === orphanStoragePath);
  assert.ok(recoveredItem, 'Recovered video item must be in gallery list');
  assert.ok(mockDatabase.some(r => r.storage_path === orphanStoragePath), 'Recovered record must now exist in Supabase database');
  console.log(`  PASS: Orphan file automatically recovered with database record:`);
  console.log(`        Recovered Title: "${recoveredItem.title}"`);
  console.log(`        Storage Path:    ${recoveredItem.storage_path}`);

  // --------------------------------------------------------------------------
  // TEST 5: ADMIN AUTHENTICATION & ACCESS CONTROL (REQUIREMENT 4)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: ADMIN AUTHENTICATION & ACCESS CONTROL ---');

  // Test failed login
  let loginFailed = false;
  try {
    await visitorApi.signInAdmin('hacker@unknown.com', 'wrongpassword');
  } catch (err) {
    loginFailed = true;
  }
  assert.ok(loginFailed, 'Unauthorized admin login must fail');
  console.log('  PASS: Unauthorized login attempt rejected.');

  // Test successful admin login
  const loginRes = await visitorApi.signInAdmin('admin@shacreatz.com', 'SecretAdminPass123');
  assert.ok(loginRes.session, 'Admin login must return session');
  const nowAdmin = await visitorApi.isAdminLoggedIn();
  assert.strictEqual(nowAdmin, true, 'Device 2 is now authenticated as Admin');
  console.log('  PASS: Admin authenticated via Supabase Auth.');

  // Test video editing as admin
  const updated = await visitorApi.updateMetadata(savedRecord.id, {
    title: 'BMW M4 — Track Battle 🔥 (4K Final Cut)',
    category: 'Commercials',
    tags: '#4k #bmw #commercial',
    description: 'Updated color grading and sound design.'
  });
  assert.strictEqual(updated.title, 'BMW M4 — Track Battle 🔥 (4K Final Cut)');
  console.log('  PASS: Video metadata updated in Supabase by authenticated Admin.');

  // Test video deletion as admin
  const deleteRes = await visitorApi.deleteVideo(recoveredItem.id, recoveredItem.storage_path);
  assert.strictEqual(deleteRes, true, 'Delete operation must succeed');
  assert.strictEqual(mockDatabase.some(r => r.storage_path === orphanStoragePath), false, 'Deleted from DB');
  assert.strictEqual(mockStorageBucket.has(orphanStoragePath), false, 'Deleted from Storage bucket');
  console.log('  PASS: Video permanently deleted from both Supabase Storage and Database.');

  // Test admin logout
  await visitorApi.signOutAdmin();
  const isLoggedOut = await visitorApi.isAdminLoggedIn();
  assert.strictEqual(isLoggedOut, false, 'Admin session must be terminated');
  console.log('  PASS: Admin logged out successfully; returned to Public Portfolio Mode.');

  console.log('\n================================================================');
  console.log('ALL TESTS PASSED: 100% SUCCESS ON CROSS-DEVICE PERMANENT SYNC');
  console.log('================================================================');
})();
