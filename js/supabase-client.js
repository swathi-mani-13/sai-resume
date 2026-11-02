/**
 * ============================================================================
 * SHACREATZ - SUPABASE CLIENT & CLOUD PERSISTENCE ADAPTER (V5.4)
 * ============================================================================
 * - Pure Supabase Cloud Storage ('portfolio-videos') & Database ('portfolio_videos')
 * - Permanent cross-device video availability (Zero dependence on localStorage for video DB)
 * - Safe ASCII filename generation to prevent ISO-8859-1 HTTP header errors
 * - Full Unicode filename, caption, category, tags & description preservation
 * - Duplicate insertion prevention & automatic rollback on DB failure
 * - Storage orphan file recovery (recovers unindexed storage files automatically)
 * - Two-mode security (Public visitor streaming & Authenticated Admin management)
 * - Permanent demo video auto-purging
 */

(function () {
  let supabaseClient = null;
  let isInitialized = false;
  let initPromise = null;

  const BUCKET_NAME = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.bucketName) || 'portfolio-videos';
  const TABLE_NAME = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.tableName) || 'portfolio_videos';

  /* --------------------------------------------------------------------------
     1. ASCII & HTTP HEADER SANITIZATION UTILITIES
     -------------------------------------------------------------------------- */
  function sanitizeAsciiHeaderValue(val) {
    if (!val || typeof val !== 'string') return '';
    return val.replace(/[^\x20-\x7E]/g, '').trim();
  }

  function getSafeStorageItem(key) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
    } catch (e) {}
    return null;
  }

  function setSafeStorageItem(key, val) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, String(val));
        return;
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, String(val));
      }
    } catch (e) {}
  }

  function removeSafeStorageItem(key) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
        return;
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch (e) {}
  }

  function getSafeExtension(file) {
    if (!file) return 'mp4';
    const fileName = file.name || '';
    const parts = fileName.split('.');
    const rawExt = parts.length > 1 ? parts.pop().toLowerCase().replace(/[^a-z0-9]/g, '') : '';

    if (['mp4', 'webm', 'mov', 'm4v', '3gp', 'qt', 'ogv', 'mkv'].includes(rawExt)) {
      if (rawExt === 'qt') return 'mov';
      return rawExt;
    }

    const type = (file.type || '').toLowerCase();
    if (type.includes('quicktime') || type.includes('mov')) return 'mov';
    if (type.includes('webm')) return 'webm';
    if (type.includes('x-m4v') || type.includes('m4v')) return 'm4v';
    if (type.includes('3gp') || type.includes('3gpp')) return '3gp';
    if (type.includes('mp4')) return 'mp4';

    return 'mp4';
  }

  function getSafeMimeType(file, ext) {
    const safeExt = ext || getSafeExtension(file);
    const rawType = (file && file.type ? file.type.toLowerCase() : '').trim();

    if (safeExt === 'mov') return 'video/quicktime';
    if (safeExt === 'webm') return 'video/webm';
    if (safeExt === 'm4v') return 'video/x-m4v';
    if (safeExt === '3gp') return 'video/3gpp';

    if (rawType.startsWith('video/') && ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp', 'video/3gpp2', 'video/ogg'].includes(rawType)) {
      return rawType;
    }

    return 'video/mp4';
  }

  function generateSafeStorageFilename(file) {
    const timestamp = Math.floor(Date.now() / 1000);
    const randomHex = Math.random().toString(16).substring(2, 8);
    const ext = getSafeExtension(file);
    return `video_${timestamp}_${randomHex}.${ext}`;
  }

  /* --------------------------------------------------------------------------
     2. DEMO DETECTOR & PERMANENT CLEANUP FILTER
     -------------------------------------------------------------------------- */
  function isConfirmedDemo(item) {
    if (!item) return false;
    const title = (item.title || item.caption || '').toUpperCase();
    const url = (item.video_url || item.videoUrl || '').toLowerCase();
    const id = String(item.id || '').toLowerCase();

    const demoTitles = [
      'CINEMATIC WILDERNESS',
      'NEON PULSE',
      'APEX VELOCITY',
      'TIMELESS MINIMALISM',
      'SAMPLE VIDEO',
      'DEMO VIDEO'
    ];
    if (demoTitles.some((demo) => title.includes(demo))) return true;

    if (
      url.includes('mixkit.co') ||
      url.includes('sample-videos.com') ||
      url.includes('w3schools.com') ||
      url.includes('placeholder')
    ) {
      return true;
    }

    if (id === '1' || id === '2' || id === '3' || id === '4' || id.startsWith('demo-')) {
      return true;
    }

    return false;
  }

  /* --------------------------------------------------------------------------
     3. SUPABASE INITIALIZATION & RUNTIME CREDENTIAL VALIDATION
     -------------------------------------------------------------------------- */
  function isValidJwtKey(key) {
    if (!key || typeof key !== 'string') return false;
    if (/[^\x20-\x7E]/.test(key) || key.includes('•') || key.includes('\u2022')) return false;
    const parts = key.trim().split('.');
    if (parts.length !== 3 || !parts[0].startsWith('ey')) return false;
    return key.length >= 50;
  }

  function isValidProjectUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim().toLowerCase();
    if (!trimmed.startsWith('https://')) return false;
    if (trimmed.includes('your-project-id') || trimmed.includes('placeholder')) return false;
    return true;
  }

  async function initSupabase(forceReinit = false) {
    if (supabaseClient && !forceReinit) return supabaseClient;
    if (initPromise && !forceReinit) return initPromise;

    initPromise = (async () => {
      let url = window.SUPABASE_CONFIG ? window.SUPABASE_CONFIG.url : '';
      let anonKey = window.SUPABASE_CONFIG ? window.SUPABASE_CONFIG.anonKey : '';

      // Check localStorage for developer/admin overrides
      const localUrl = getSafeStorageItem('shacreatz_supabase_url');
      const localKey = getSafeStorageItem('shacreatz_supabase_anon_key');
      if (localUrl && localKey) {
        url = localUrl;
        anonKey = localKey;
      }

      // If missing, attempt to fetch from Vercel /api/config
      if (!url || !anonKey) {
        try {
          const res = await fetch('/api/config');
          if (res.ok) {
            const data = await res.json();
            if (data.diagnostic && data.diagnostic.status === 'CONFIGURATION_ERROR') {
              console.warn('[SHACREATZ DIAGNOSTIC 2/6: SUPABASE CLIENT INIT] Vercel environment variable notice:', data.diagnostic.message);
            }
            if (data.isConfigured && data.supabaseUrl && data.supabaseAnonKey) {
              url = data.supabaseUrl;
              anonKey = data.supabaseAnonKey;
            }
          }
        } catch (e) {
          // Static or local without serverless
        }
      }

      url = sanitizeAsciiHeaderValue(url).replace(/\/+$/, '');
      anonKey = sanitizeAsciiHeaderValue(anonKey);

      const keyValid = isValidJwtKey(anonKey);
      const urlValid = isValidProjectUrl(url);

      if (!keyValid || !urlValid) {
        if (anonKey && !keyValid) {
          console.warn('[SHACREATZ DIAGNOSTIC 2/6: SUPABASE CLIENT INIT] SUPABASE_ANON_KEY is invalid or contains masked bullet characters (••••••••).');
        }
        if (url && !urlValid) {
          console.warn('[SHACREATZ DIAGNOSTIC 2/6: SUPABASE CLIENT INIT] SUPABASE_URL is invalid or placeholder.');
        }
        supabaseClient = null;
        isInitialized = false;
        return null;
      }

      if (window.SUPABASE_CONFIG) {
        window.SUPABASE_CONFIG.url = url;
        window.SUPABASE_CONFIG.anonKey = anonKey;
      } else {
        window.SUPABASE_CONFIG = { url, anonKey, bucketName: BUCKET_NAME, tableName: TABLE_NAME };
      }

      if (url && anonKey && window.supabase && typeof window.supabase.createClient === 'function') {
        try {
          supabaseClient = window.supabase.createClient(url, anonKey, {
            auth: {
              persistSession: true,
              autoRefreshToken: true
            }
          });
          isInitialized = true;
          const redactedUrl = url.replace(/(https?:\/\/)([^.]+)(\..*)/, '$1***$3');
          console.log('[SHACREATZ DIAGNOSTIC 2/6: SUPABASE CLIENT INIT] Supabase client initialized for project:', redactedUrl);
        } catch (err) {
          console.error('[SHACREATZ DIAGNOSTIC 2/6: SUPABASE CLIENT INIT] Failed to initialize client:', err.message);
          supabaseClient = null;
          isInitialized = false;
        }
      }

      return supabaseClient;
    })();

    return initPromise;
  }

  function isConfigured() {
    return Boolean(supabaseClient && isInitialized);
  }

  /* --------------------------------------------------------------------------
     4. ADMIN AUTHENTICATION MANAGEMENT (REQUIREMENT 4)
     -------------------------------------------------------------------------- */
  async function signInAdmin(email, password) {
    const client = await initSupabase();
    if (!client) {
      throw new Error('Supabase client is not connected. Configure credentials first.');
    }
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }
    setSafeStorageItem('shacreatz_admin_logged_in', 'true');
    return data;
  }

  async function signOutAdmin() {
    const client = await initSupabase();
    if (client && client.auth) {
      await client.auth.signOut().catch(() => {});
    }
    removeSafeStorageItem('shacreatz_admin_logged_in');
    return true;
  }

  async function isAdminLoggedIn() {
    const client = await initSupabase();
    if (!client) return false;
    try {
      if (client.auth) {
        const { data: sessionData } = await client.auth.getSession();
        if (sessionData && sessionData.session && sessionData.session.user) {
          return true;
        }
      }
    } catch (e) {}
    return getSafeStorageItem('shacreatz_admin_logged_in') === 'true';
  }

  async function testCloudConnection(customUrl, customKey) {
    const targetUrl = (customUrl || (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url) || '').replace(/\/+$/, '');
    const targetKey = customKey || (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.anonKey) || '';

    const report = {
      urlConfigured: Boolean(targetUrl && isValidProjectUrl(targetUrl)),
      keyValid: Boolean(targetKey && isValidJwtKey(targetKey)),
      restAccessible: false,
      storageAccessible: false,
      message: ''
    };

    if (!report.urlConfigured) {
      report.message = 'Supabase Project URL is missing or invalid.';
      return report;
    }
    if (!report.keyValid) {
      report.message = 'Supabase Anon Key is invalid or contains masked bullet characters.';
      return report;
    }

    try {
      // Test REST Database query
      const restRes = await fetch(`${targetUrl}/rest/v1/${TABLE_NAME}?select=id&limit=1`, {
        headers: {
          apikey: targetKey,
          Authorization: `Bearer ${targetKey}`
        }
      });
      report.restAccessible = restRes.ok;

      // Test Storage Bucket
      const storageRes = await fetch(`${targetUrl}/storage/v1/bucket/${BUCKET_NAME}`, {
        headers: {
          apikey: targetKey,
          Authorization: `Bearer ${targetKey}`
        }
      });
      report.storageAccessible = storageRes.ok;

      if (report.restAccessible && report.storageAccessible) {
        report.message = 'Supabase Cloud Database and Storage are fully online and verified!';
      } else if (!report.restAccessible) {
        report.message = `Database table '${TABLE_NAME}' not found. Please execute supabase_setup.sql in Supabase SQL Editor.`;
      } else {
        report.message = `Storage bucket '${BUCKET_NAME}' not found. Please execute supabase_setup.sql in Supabase SQL Editor.`;
      }
    } catch (err) {
      report.message = `Connection test failed: ${err.message}. If this project was paused due to inactivity, unpause it in the Supabase Dashboard.`;
    }

    return report;
  }

  function setCustomCredentials(newUrl, newKey) {
    if (newUrl) setSafeStorageItem('shacreatz_supabase_url', newUrl.trim());
    if (newKey) setSafeStorageItem('shacreatz_supabase_anon_key', newKey.trim());
    supabaseClient = null;
    isInitialized = false;
    initPromise = null;
    return initSupabase(true);
  }

  /* --------------------------------------------------------------------------
     5. PERMANENT PUBLIC GALLERY RETRIEVAL (SUPABASE DATABASE AS SINGLE SOURCE OF TRUTH)
     -------------------------------------------------------------------------- */
  async function fetchPortfolioVideos() {
    const client = await initSupabase();

    if (!client || !isConfigured()) {
      const errList = [];
      errList.success = false;
      errList.error = 'NOT_CONFIGURED';
      errList.message = 'Cloud database is not connected. Video synchronization requires active Supabase credentials configured in Vercel.';
      errList.videos = errList;
      return errList;
    }

    try {
      let allVideos = [];
      const PAGE_SIZE = 1000;
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await client
          .from(TABLE_NAME)
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (error) {
          console.error('[Supabase] Error fetching portfolio videos from database:', error);
          const errList = [];
          errList.success = false;
          errList.error = 'QUERY_ERROR';
          errList.message = error.message || 'Failed to query videos table.';
          errList.videos = errList;
          return errList;
        }

        if (Array.isArray(data) && data.length > 0) {
          allVideos = allVideos.concat(data);
          if (data.length < PAGE_SIZE) {
            hasMore = false;
          } else {
            from += PAGE_SIZE;
          }
        } else {
          hasMore = false;
        }
      }

      // Filter and purge demo videos permanently
      const genuineVideos = [];
      for (const video of allVideos) {
        if (isConfirmedDemo(video)) {
          console.log('[Supabase] Permanently purging confirmed demo video:', video.title || video.id);
          client.from(TABLE_NAME).delete().eq('id', video.id).catch(() => {});
          if (video.storage_path) {
            client.storage.from(BUCKET_NAME).remove([video.storage_path]).catch(() => {});
          }
        } else {
          genuineVideos.push(video);
        }
      }

      // DATA PRESERVATION & ORPHAN RECOVERY (Requirement 5)
      // Check whether previously uploaded files exist in Storage without database records
      try {
        const bucket = client.storage.from(BUCKET_NAME);
        if (typeof bucket.list === 'function') {
          const { data: storageFiles } = await bucket.list('videos', { limit: 100 });
          if (Array.isArray(storageFiles) && storageFiles.length > 0) {
            for (const file of storageFiles) {
              if (!file.name || file.name === '.keep' || file.name === '.emptyFolderPlaceholder') continue;
              const fullPath = `videos/${file.name}`;
              const existsInDb = genuineVideos.some((v) => (v.storage_path === fullPath) || (v.video_url && v.video_url.includes(file.name)));

              if (!existsInDb) {
                console.log('[Supabase] Recovering orphaned storage file without DB record:', file.name);
                const { data: pubData } = client.storage.from(BUCKET_NAME).getPublicUrl(fullPath);
                if (pubData && pubData.publicUrl) {
                  const recoveredTitle = file.name
                    .replace(/\.[^/.]+$/, '')
                    .replace(/^video_\d+_[a-f0-9]+_?/, '')
                    .replace(/[-_]/g, ' ')
                    .trim() || 'Uploaded Project';

                  const recoveredRecord = {
                    title: recoveredTitle,
                    caption: recoveredTitle,
                    category: 'Portfolio Project',
                    tags: '#video #portfolio',
                    description: 'Recovered from permanent cloud storage',
                    video_url: pubData.publicUrl,
                    public_url: pubData.publicUrl,
                    file_name: file.name,
                    mime_type: 'video/mp4',
                    file_size: (file.metadata && file.metadata.size) || 0,
                    storage_path: fullPath,
                    status: 'published',
                    publication_status: 'published',
                    created_at: file.created_at || new Date().toISOString()
                  };

                  try {
                    const { data: insData } = await client.from(TABLE_NAME).insert([recoveredRecord]).select();
                    if (insData && insData[0]) {
                      genuineVideos.push(insData[0]);
                    } else {
                      genuineVideos.push(recoveredRecord);
                    }
                  } catch (recErr) {
                    genuineVideos.push(recoveredRecord);
                  }
                }
              }
            }
          }
        }
      } catch (orphanErr) {
        console.warn('[Supabase] Storage orphan check note:', orphanErr.message);
      }

      genuineVideos.success = true;
      genuineVideos.error = null;
      genuineVideos.videos = genuineVideos;
      return genuineVideos;
    } catch (err) {
      console.error('[Supabase] Unexpected error fetching videos:', err);
      const errList = [];
      errList.success = false;
      errList.error = 'FETCH_EXCEPTION';
      errList.message = err.message || 'Network exception while connecting to Supabase Cloud.';
      errList.videos = errList;
      return errList;
    }
  }

  /* --------------------------------------------------------------------------
     6. PERMANENT SUPABASE STORAGE UPLOAD (NO LOCALSTORAGE FALLBACK)
     -------------------------------------------------------------------------- */
  async function uploadVideoToStorage(file, onProgress) {
    if (!file) {
      throw new Error('No video file selected for upload.');
    }

    const client = await initSupabase();

    // STRICT PERMANENCE: Reject local storage mock if cloud is not configured (Requirement 1 & 2)
    if (!client || !isConfigured()) {
      throw new Error('Supabase Cloud Storage is not connected. Video uploads cannot be stored permanently across devices until active Supabase credentials are configured in Vercel settings.');
    }

    const safeExt = getSafeExtension(file);
    const safeMime = getSafeMimeType(file, safeExt);
    const safeFilename = generateSafeStorageFilename(file);
    const storagePath = `videos/${safeFilename}`;

    console.log('[SHACREATZ DIAGNOSTIC 1/6: FILE SELECTION]');
    console.log('  Original File Name: ', file.name || '(unnamed file)');
    console.log('  Original MIME Type: ', file.type || '(empty / unspecified by mobile OS)');
    console.log('  File Size (Bytes):  ', file.size);
    console.log('  File Size (MB):     ', (file.size / (1024 * 1024)).toFixed(2) + ' MB');
    console.log('  Resolved Safe Ext:  ', safeExt);
    console.log('  Resolved Safe MIME: ', safeMime);
    console.log('  Safe Storage Name:  ', safeFilename);
    console.log('  Target Storage Path:', storagePath);
    console.log('  Storage Bucket:     ', BUCKET_NAME);

    if (typeof onProgress === 'function') onProgress(5, 'Validating mobile video package...');

    const fileToUpload = file;

    // Retrieve active credentials
    let url = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url) ? window.SUPABASE_CONFIG.url : '';
    let anonKey = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.anonKey) ? window.SUPABASE_CONFIG.anonKey : '';
    const localUrl = getSafeStorageItem('shacreatz_supabase_url');
    const localKey = getSafeStorageItem('shacreatz_supabase_anon_key');
    if (localUrl && localKey) {
      url = localUrl;
      anonKey = localKey;
    }
    url = sanitizeAsciiHeaderValue(url).replace(/\/+$/, '');
    anonKey = sanitizeAsciiHeaderValue(anonKey);

    // Auth Header Check
    let authHeaderValue = `Bearer ${anonKey}`;
    try {
      if (client.auth && typeof client.auth.getSession === 'function') {
        const { data: sessionData } = await client.auth.getSession();
        if (sessionData && sessionData.session && sessionData.session.access_token) {
          authHeaderValue = `Bearer ${sessionData.session.access_token}`;
          console.log('[SHACREATZ DIAGNOSTIC 3/6: AUTH SESSION CHECK] Authenticated admin session active.');
        } else {
          console.log('[SHACREATZ DIAGNOSTIC 3/6: AUTH SESSION CHECK] Public anonymous access (RLS policy active).');
        }
      }
    } catch (authErr) {
      console.log('[SHACREATZ DIAGNOSTIC 3/6: AUTH SESSION CHECK] Session check note:', authErr.message);
    }

    if (typeof onProgress === 'function') onProgress(10, 'Initiating mobile upload stream...');

    function classifyStorageError(status, message, rawText) {
      const redactedUrl = url ? url.replace(/(https?:\/\/)([^.]+)(\..*)/, '$1***$3') : 'cloud storage';
      if (status === 0 || !status) {
        return new Error(`Connection error: Could not reach Supabase Storage at ${redactedUrl}. Please check your network connection and verify that your Supabase project is active (not paused in Supabase Dashboard).`);
      }
      if (status === 401) {
        return new Error('Authentication failed (HTTP 401): Please verify that SUPABASE_ANON_KEY in Vercel is set to the full anon JWT key from Supabase Dashboard -> Project Settings -> API.');
      }
      if (status === 403) {
        return new Error(`Storage permission denied (HTTP 403): Storage bucket '${BUCKET_NAME}' policy does not permit upload. Please run supabase_setup.sql in your Supabase SQL editor.`);
      }
      if (status === 413) {
        return new Error('File too large (HTTP 413): The video file exceeds the maximum upload limit set in Supabase Storage.');
      }
      if (status === 504 || (message && message.includes('timed out'))) {
        return new Error('Upload timed out on slow connection. Please check your signal strength and try again.');
      }
      return new Error(`Storage upload failed (HTTP ${status}): ${message || rawText || 'Check storage permissions and network.'}`);
    }

    // TIER 1: Resumable Upload via tus-js-client
    const canUseTus = typeof window !== 'undefined' && window.tus && typeof window.tus.Upload === 'function';
    if (canUseTus && url && anonKey) {
      console.log('[SHACREATZ DIAGNOSTIC 4/6: STORAGE UPLOAD REQUEST] Method: TUS Resumable Upload (6MB Chunks)');

      const tusUploadPromise = () => {
        return new Promise((resolve, reject) => {
          let hasSettled = false;
          const upload = new window.tus.Upload(fileToUpload, {
            endpoint: `${url}/storage/v1/upload/resumable`,
            retryDelays: [0, 2000, 4000, 8000, 15000],
            headers: {
              apikey: anonKey,
              Authorization: authHeaderValue,
              'x-upsert': 'false'
            },
            uploadDataDuringCreation: true,
            removeFingerprintOnSuccess: true,
            metadata: {
              bucketName: BUCKET_NAME,
              objectName: storagePath,
              contentType: safeMime,
              cacheControl: '3600'
            },
            chunkSize: 6 * 1024 * 1024,
            onError: (error) => {
              if (hasSettled) return;
              hasSettled = true;
              console.warn('[SHACREATZ DIAGNOSTIC 5/6: STORAGE RESPONSE] TUS upload error:', error.message);
              reject(error);
            },
            onProgress: (bytesUploaded, bytesTotal) => {
              if (bytesTotal > 0 && typeof onProgress === 'function') {
                const pct = Math.min(95, Math.max(10, Math.round((bytesUploaded / bytesTotal) * 95)));
                const loadedMb = (bytesUploaded / (1024 * 1024)).toFixed(1);
                const totalMb = (bytesTotal / (1024 * 1024)).toFixed(1);
                onProgress(pct, `Uploading: ${loadedMb} MB / ${totalMb} MB (${pct}%)`);
              }
            },
            onSuccess: () => {
              if (hasSettled) return;
              hasSettled = true;
              console.log('[SHACREATZ DIAGNOSTIC 5/6: STORAGE RESPONSE] TUS upload succeeded!');
              if (typeof onProgress === 'function') onProgress(98, 'Generating public video link...');
              const { data: urlData } = client.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
              if (!urlData || !urlData.publicUrl) {
                reject(new Error('Failed to generate public streaming URL for uploaded video.'));
                return;
              }
              if (typeof onProgress === 'function') onProgress(100, 'Upload complete!');
              resolve({
                publicUrl: urlData.publicUrl,
                storagePath: storagePath,
                safeFilename: safeFilename,
                mimeType: safeMime
              });
            }
          });

          upload.start();
        });
      };

      try {
        const tusResult = await tusUploadPromise();
        return tusResult;
      } catch (tusErr) {
        console.warn('[SHACREATZ DIAGNOSTIC] TUS upload failed, falling back to direct binary stream:', tusErr.message);
        if (tusErr.originalResponse) {
          const status = tusErr.originalResponse.getStatus();
          if (status === 401 || status === 403 || status === 413) {
            throw classifyStorageError(status, tusErr.message, '');
          }
        }
      }
    }

    // TIER 2: Direct Binary XHR Streaming
    const uploadWithXHR = () => {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const uploadEndpoint = `${url}/storage/v1/object/${BUCKET_NAME}/${storagePath}`;

        console.log('[SHACREATZ DIAGNOSTIC 4/6: STORAGE UPLOAD REQUEST] Method: Direct Binary XHR Stream');
        xhr.timeout = 300000; // 5-minute timeout

        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable && evt.total > 0) {
            const pct = Math.min(95, Math.max(10, Math.round((evt.loaded / evt.total) * 95)));
            const loadedMb = (evt.loaded / (1024 * 1024)).toFixed(1);
            const totalMb = (evt.total / (1024 * 1024)).toFixed(1);
            if (typeof onProgress === 'function') {
              onProgress(pct, `Uploading: ${loadedMb} MB / ${totalMb} MB (${pct}%)`);
            }
          }
        };

        xhr.onload = () => {
          console.log('[SHACREATZ DIAGNOSTIC 5/6: STORAGE RESPONSE] HTTP Status:', xhr.status);

          if (xhr.status >= 200 && xhr.status < 300) {
            if (typeof onProgress === 'function') onProgress(98, 'Generating public video link...');
            const { data: urlData } = client.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
            if (!urlData || !urlData.publicUrl) {
              reject(new Error('Failed to generate public streaming URL for uploaded video.'));
              return;
            }
            if (typeof onProgress === 'function') onProgress(100, 'Upload complete!');
            resolve({
              publicUrl: urlData.publicUrl,
              storagePath: storagePath,
              safeFilename: safeFilename,
              mimeType: safeMime
            });
            return;
          }

          let errorMsg = '';
          try {
            const json = JSON.parse(xhr.responseText);
            errorMsg = json.message || json.error || json.msg || '';
          } catch (e) {
            errorMsg = xhr.statusText || 'Unknown error';
          }

          console.error('[SHACREATZ DIAGNOSTIC 5/6: STORAGE RESPONSE] Error details:', {
            status: xhr.status,
            message: errorMsg
          });

          reject(classifyStorageError(xhr.status, errorMsg, xhr.responseText));
        };

        xhr.onerror = () => {
          console.error('[SHACREATZ DIAGNOSTIC 5/6: STORAGE RESPONSE] Network or CORS preflight error occurred.');
          reject(new Error('Network connection interrupted during video upload. Please check your mobile data or Wi-Fi.'));
        };

        xhr.ontimeout = () => {
          console.error('[SHACREATZ DIAGNOSTIC 5/6: STORAGE RESPONSE] Upload timed out after 300s.');
          reject(new Error('Upload timed out on slow mobile connection. Please check your signal strength and try again.'));
        };

        xhr.open('POST', uploadEndpoint, true);
        xhr.setRequestHeader('apikey', anonKey);
        xhr.setRequestHeader('Authorization', authHeaderValue);
        xhr.setRequestHeader('Content-Type', safeMime);
        xhr.setRequestHeader('x-upsert', 'false');

        xhr.send(fileToUpload);
      });
    };

    try {
      if (url && anonKey) {
        return await uploadWithXHR();
      }
    } catch (xhrErr) {
      if (xhrErr.message && (
        xhrErr.message.includes('permission denied') ||
        xhrErr.message.includes('timed out') ||
        xhrErr.message.includes('interrupted') ||
        xhrErr.message.includes('File too large') ||
        xhrErr.message.includes('HTTP 401') ||
        xhrErr.message.includes('HTTP 403') ||
        xhrErr.message.includes('HTTP 413')
      )) {
        throw xhrErr;
      }
      console.warn('[SHACREATZ DIAGNOSTIC] XHR direct upload fallback to Supabase SDK:', xhrErr.message);
    }

    // TIER 3: Supabase SDK Fallback
    if (typeof onProgress === 'function') onProgress(50, 'Uploading to cloud storage...');
    console.log('[SHACREATZ DIAGNOSTIC 4/6: STORAGE UPLOAD REQUEST] Method: Supabase SDK ArrayBuffer Fallback');

    let uploadBody = fileToUpload;
    try {
      if (typeof fileToUpload.arrayBuffer === 'function') {
        uploadBody = await fileToUpload.arrayBuffer();
      }
    } catch (e) {
      uploadBody = fileToUpload;
    }

    const { data: uploadData, error: uploadError } = await client.storage
      .from(BUCKET_NAME)
      .upload(storagePath, uploadBody, {
        upsert: false,
        contentType: safeMime
      });

    if (uploadError) {
      console.error('[SHACREATZ DIAGNOSTIC 5/6: STORAGE RESPONSE] Supabase SDK Upload Failed:', uploadError);
      const msg = uploadError.message || 'Storage upload error';
      if (msg.includes('row-level security') || msg.includes('policy') || msg.includes('permission')) {
        throw new Error(`Storage permission denied: RLS policy blocked upload to '${BUCKET_NAME}'. Please run supabase_setup.sql.`);
      } else if (msg.includes('Payload too large') || msg.includes('413')) {
        throw new Error('File too large: Video exceeds Supabase Storage file size limit.');
      } else if (msg.includes('fetch') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        const redactedUrl = url ? url.replace(/(https?:\/\/)([^.]+)(\..*)/, '$1***$3') : 'Supabase';
        throw new Error(`Connection error: Failed to connect to Supabase Storage at ${redactedUrl}. Please ensure your Supabase project is active (not paused in Supabase Dashboard).`);
      }
      throw uploadError;
    }

    if (typeof onProgress === 'function') onProgress(90, 'Generating public video link...');
    const { data: urlData } = client.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
    if (!urlData || !urlData.publicUrl) {
      throw new Error('Failed to generate public URL for uploaded video.');
    }

    if (typeof onProgress === 'function') onProgress(100, 'Upload successful!');
    return {
      publicUrl: urlData.publicUrl,
      storagePath: storagePath,
      safeFilename: safeFilename,
      mimeType: safeMime
    };
  }

  /* --------------------------------------------------------------------------
     7. SAVE VIDEO METADATA TO SUPABASE DATABASE (DUPLICATE CHECK & ROLLBACK)
     -------------------------------------------------------------------------- */
  async function saveVideoMetadata({ title, category, tags, description, videoUrl, fileName, mimeType, fileSize, storagePath }) {
    const client = await initSupabase();

    // STRICT PERMANENCE: Database insert MUST target Supabase (Requirement 2)
    if (!client || !isConfigured()) {
      throw new Error('Supabase database client is not connected. Video metadata cannot be stored permanently.');
    }

    console.log('[SHACREATZ DIAGNOSTIC 6/6: DATABASE METADATA INSERT]');
    console.log('  Target Table:       ', TABLE_NAME);
    console.log('  Title:              ', title);
    console.log('  Original File Name: ', fileName);
    console.log('  Storage Path:       ', storagePath);
    console.log('  File Size:          ', fileSize);

    // Prevent duplicate records (Requirement 2)
    if (storagePath) {
      try {
        const query = client.from(TABLE_NAME).select('*');
        if (typeof query.eq === 'function') {
          const { data: existingRecords } = await query.eq('storage_path', storagePath).limit(1);
          if (Array.isArray(existingRecords) && existingRecords.length > 0) {
            console.log('[SHACREATZ DIAGNOSTIC 6/6: DUPLICATE PREVENTED] Video with storage path already exists:', storagePath);
            return existingRecords[0];
          }
        }
      } catch (dupErr) {
        console.warn('[SHACREATZ DIAGNOSTIC 6/6: DUPLICATE CHECK WARNING]', dupErr.message);
      }
    }

    const newRecord = {
      title: title || 'Untitled Video',
      caption: title || 'Untitled Video',
      category: category || 'Uploaded Video',
      tags: tags || '',
      description: description || '',
      video_url: videoUrl,
      public_url: videoUrl,
      file_name: fileName || '',
      mime_type: mimeType || 'video/mp4',
      file_size: fileSize || 0,
      storage_path: storagePath || '',
      status: 'published',
      publication_status: 'published',
      created_at: new Date().toISOString()
    };

    try {
      const { data, error } = await client
        .from(TABLE_NAME)
        .insert([newRecord])
        .select();

      if (error) {
        console.warn('[SHACREATZ DIAGNOSTIC 6/6: DATABASE METADATA INSERT] Initial insert with extended fields failed, retrying with core columns:', error.message);
        const baseRecord = {
          title: title || 'Untitled Video',
          category: category || 'Uploaded Video',
          video_url: videoUrl,
          file_name: fileName || '',
          mime_type: mimeType || 'video/mp4',
          file_size: fileSize || 0,
          storage_path: storagePath || ''
        };
        const { data: baseData, error: baseError } = await client
          .from(TABLE_NAME)
          .insert([baseRecord])
          .select();

        if (baseError) {
          throw baseError;
        }

        const saved = baseData && baseData[0] ? baseData[0] : baseRecord;
        saved.tags = tags || '';
        saved.description = description || '';
        console.log('[SHACREATZ DIAGNOSTIC 6/6: DATABASE METADATA INSERT] Successfully inserted core record (ID: ' + saved.id + ')');
        return saved;
      }

      const saved = data && data[0] ? data[0] : newRecord;
      console.log('[SHACREATZ DIAGNOSTIC 6/6: DATABASE METADATA INSERT] Successfully inserted record (ID: ' + saved.id + ')');
      return saved;
    } catch (err) {
      console.error('[SHACREATZ DIAGNOSTIC 6/6: DATABASE METADATA INSERT] Database insert failed:', err.message);

      // AUTOMATIC ROLLBACK: Delete newly uploaded storage file to prevent orphaned objects (Requirement 2 & 5)
      if (storagePath) {
        console.warn('[SHACREATZ DATABASE ROLLBACK] Removing uploaded storage file to prevent orphaned object:', storagePath);
        client.storage.from(BUCKET_NAME).remove([storagePath]).catch(() => {});
      }

      throw new Error(`Database save failed: ${err.message}. Storage upload was rolled back.`);
    }
  }

  /* --------------------------------------------------------------------------
     8. UPDATE VIDEO METADATA (EDIT VIDEO)
     -------------------------------------------------------------------------- */
  async function updateVideoMetadata(videoId, { title, category, tags, description }) {
    const client = await initSupabase();

    if (!client) {
      throw new Error('Supabase client is not connected. Cannot update video metadata.');
    }

    try {
      const { data, error } = await client
        .from(TABLE_NAME)
        .update({
          title: title,
          caption: title,
          category: category || '',
          tags: tags || '',
          description: description || ''
        })
        .eq('id', videoId)
        .select();

      if (error) {
        console.warn('[Supabase] Update with caption field failed, retrying with core columns:', error.message);
        const { data: retryData, error: retryError } = await client
          .from(TABLE_NAME)
          .update({
            title: title,
            category: category || '',
            tags: tags || '',
            description: description || ''
          })
          .eq('id', videoId)
          .select();

        if (retryError) throw retryError;
        return retryData && retryData[0] ? retryData[0] : { id: videoId, title, category, tags, description };
      }

      return data && data[0] ? data[0] : { id: videoId, title, category, tags, description };
    } catch (err) {
      console.error('[Supabase] Update metadata failed:', err);
      throw err;
    }
  }

  /* --------------------------------------------------------------------------
     9. PERMANENT VIDEO DELETION (STORAGE OBJECT + DATABASE RECORD)
     -------------------------------------------------------------------------- */
  async function deletePortfolioVideo(videoId, storagePath) {
    const client = await initSupabase();

    if (!client) {
      throw new Error('Supabase client is not connected. Cannot delete video.');
    }

    try {
      let resolvedStoragePath = storagePath;

      if (!resolvedStoragePath && videoId) {
        const { data: recordData } = await client
          .from(TABLE_NAME)
          .select('storage_path, video_url')
          .eq('id', videoId)
          .maybeSingle();

        if (recordData) {
          resolvedStoragePath = recordData.storage_path;
          if (!resolvedStoragePath && recordData.video_url && recordData.video_url.includes(BUCKET_NAME)) {
            const parts = recordData.video_url.split(`${BUCKET_NAME}/`);
            if (parts[1]) resolvedStoragePath = decodeURIComponent(parts[1]);
          }
        }
      }

      // 1. Delete from Supabase Storage bucket
      if (resolvedStoragePath) {
        const { error: storageError } = await client.storage
          .from(BUCKET_NAME)
          .remove([resolvedStoragePath]);

        if (storageError) {
          console.warn('[Supabase] Storage removal warning:', storageError);
        }
      }

      // 2. Delete database record
      if (videoId) {
        const { error: dbError } = await client
          .from(TABLE_NAME)
          .delete()
          .eq('id', videoId);

        if (dbError) {
          console.error('[Supabase] Error deleting from database:', dbError);
          throw dbError;
        }
      }

      return true;
    } catch (err) {
      console.error('[Supabase] Error during delete:', err);
      throw err;
    }
  }

  // Export API globally
  window.ShacreatzSupabase = {
    init: initSupabase,
    isConfigured: isConfigured,
    fetchVideos: fetchPortfolioVideos,
    uploadVideo: uploadVideoToStorage,
    saveMetadata: saveVideoMetadata,
    updateMetadata: updateVideoMetadata,
    deleteVideo: deletePortfolioVideo,
    isConfirmedDemo: isConfirmedDemo,
    getSafeExtension: getSafeExtension,
    getSafeMimeType: getSafeMimeType,
    generateSafeStorageFilename: generateSafeStorageFilename,
    signInAdmin: signInAdmin,
    signOutAdmin: signOutAdmin,
    isAdminLoggedIn: isAdminLoggedIn,
    testCloudConnection: testCloudConnection,
    setCustomCredentials: setCustomCredentials
  };

  // Pre-initialize in background
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initSupabase());
  } else {
    initSupabase();
  }
})();
