/**
 * ============================================================================
 * SHACREATZ - SUPABASE CLIENT & CLOUD PERSISTENCE ADAPTER (V5.2)
 * ============================================================================
 * - Safe ASCII filename generation to prevent ISO-8859-1 header errors
 * - Pure ISO-8859-1 / ASCII sanitization for all HTTP headers and auth tokens
 * - Preservation of original full-Unicode filename in PostgreSQL database
 * - Orphaned storage file cleanup on database error
 * - Permanent demo video detection and auto-purging
 * - Unlimited video uploads with pagination, edit, and deletion
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
    // Strip any characters outside ASCII 32-126 (e.g. smart quotes, zero-width spaces, newlines)
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

  function getSafeExtension(file) {
    if (!file) return 'mp4';
    // 1. Check filename extension if present
    const fileName = file.name || '';
    const parts = fileName.split('.');
    const rawExt = parts.length > 1 ? parts.pop().toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    
    if (['mp4', 'webm', 'mov', 'm4v', '3gp', 'qt', 'ogv', 'mkv'].includes(rawExt)) {
      if (rawExt === 'qt') return 'mov';
      return rawExt;
    }

    // 2. Fall back to MIME type inspection (vital for Android / iOS files without standard extension)
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

    // 1. Format-specific extensions (mov, webm, m4v, 3gp) must have accurate container MIME types
    if (safeExt === 'mov') return 'video/quicktime';
    if (safeExt === 'webm') return 'video/webm';
    if (safeExt === 'm4v') return 'video/x-m4v';
    if (safeExt === '3gp') return 'video/3gpp';

    // 2. If client supplied a valid standard video MIME type, respect it
    if (rawType.startsWith('video/') && ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp', 'video/3gpp2', 'video/ogg'].includes(rawType)) {
      return rawType;
    }

    return 'video/mp4';
  }

  function generateSafeStorageFilename(file) {
    // Generate an ASCII-safe unique filename: video_<timestamp>_<randomHex>.<ext>
    // Example: video_1730000000_a8f32c.mp4
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

    // Check known demo titles
    const demoTitles = [
      'CINEMATIC WILDERNESS',
      'NEON PULSE',
      'APEX VELOCITY',
      'TIMELESS MINIMALISM',
      'SAMPLE VIDEO',
      'DEMO VIDEO'
    ];
    if (demoTitles.some((demo) => title.includes(demo))) return true;

    // Check demo / sample video URLs
    if (
      url.includes('mixkit.co') ||
      url.includes('sample-videos.com') ||
      url.includes('w3schools.com') ||
      url.includes('placeholder')
    ) {
      return true;
    }

    // Check demo IDs
    if (id === '1' || id === '2' || id === '3' || id === '4' || id.startsWith('demo-')) {
      return true;
    }

    return false;
  }

  /* --------------------------------------------------------------------------
     3. INDEXEDDB LOCAL STORAGE BACKUP FOR OFFLINE / TESTING PERSISTENCE
     -------------------------------------------------------------------------- */
  const IDB_NAME = 'shacreatz_local_db';
  const IDB_VERSION = 1;
  const IDB_STORE_VIDEOS = 'uploaded_videos';
  const IDB_STORE_BLOBS = 'video_blobs';

  function openIndexedDb() {
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE_VIDEOS)) {
          db.createObjectStore(IDB_STORE_VIDEOS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(IDB_STORE_BLOBS)) {
          db.createObjectStore(IDB_STORE_BLOBS, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn('[IndexedDB] Could not open database:', req.error);
        resolve(null);
      };
    });
  }

  async function getLocalStoredVideos() {
    // Purge any demo records from localStorage
    try {
      const raw = getSafeStorageItem('shacreatz_local_videos');
      if (raw) {
        const list = JSON.parse(raw);
        const filtered = list.filter((v) => !isConfirmedDemo(v));
        if (filtered.length !== list.length) {
          setSafeStorageItem('shacreatz_local_videos', JSON.stringify(filtered));
        }
      }
    } catch (e) {}

    const db = await openIndexedDb();
    if (!db) {
      try {
        const raw = getSafeStorageItem('shacreatz_local_videos');
        return raw ? JSON.parse(raw).filter((v) => !isConfirmedDemo(v)) : [];
      } catch (e) {
        return [];
      }
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([IDB_STORE_VIDEOS, IDB_STORE_BLOBS], 'readonly');
        const store = tx.objectStore(IDB_STORE_VIDEOS);
        const req = store.getAll();

        req.onsuccess = async () => {
          const records = req.result || [];
          const blobStore = tx.objectStore(IDB_STORE_BLOBS);
          const genuine = [];

          for (let i = 0; i < records.length; i++) {
            const item = records[i];
            if (isConfirmedDemo(item)) {
              deleteLocalVideoRecord(item.id);
              continue;
            }

            // Restore live Blob URLs for locally uploaded videos if needed
            if (item.isLocalBlob && !item.video_url.startsWith('http')) {
              try {
                const bReq = blobStore.get(item.id);
                await new Promise((bRes) => {
                  bReq.onsuccess = () => {
                    if (bReq.result && bReq.result.blob) {
                      item.video_url = URL.createObjectURL(bReq.result.blob);
                    }
                    bRes();
                  };
                  bReq.onerror = () => bRes();
                });
              } catch (be) {}
            }
            genuine.push(item);
          }
          resolve(genuine);
        };

        req.onerror = () => resolve([]);
      } catch (err) {
        console.warn('[IndexedDB] Read error:', err);
        resolve([]);
      }
    });
  }

  async function saveLocalVideoRecord(record, fileBlob) {
    if (isConfirmedDemo(record)) return;

    const db = await openIndexedDb();
    if (db) {
      try {
        const tx = db.transaction([IDB_STORE_VIDEOS, IDB_STORE_BLOBS], 'readwrite');
        tx.objectStore(IDB_STORE_VIDEOS).put(record);
        if (fileBlob) {
          tx.objectStore(IDB_STORE_BLOBS).put({ id: record.id, blob: fileBlob });
        }
      } catch (e) {
        console.warn('[IndexedDB] Save error:', e);
      }
    }

    // Mirror in localStorage metadata
    try {
      const raw = getSafeStorageItem('shacreatz_local_videos');
      const list = raw ? JSON.parse(raw) : [];
      const filtered = list.filter((v) => v.id !== record.id && !isConfirmedDemo(v));
      filtered.push(record);
      setSafeStorageItem('shacreatz_local_videos', JSON.stringify(filtered));
    } catch (e) {}
  }

  async function deleteLocalVideoRecord(videoId) {
    const db = await openIndexedDb();
    if (db) {
      try {
        const tx = db.transaction([IDB_STORE_VIDEOS, IDB_STORE_BLOBS], 'readwrite');
        tx.objectStore(IDB_STORE_VIDEOS).delete(videoId);
        tx.objectStore(IDB_STORE_BLOBS).delete(videoId);
      } catch (e) {}
    }

    try {
      const raw = getSafeStorageItem('shacreatz_local_videos');
      if (raw) {
        const list = JSON.parse(raw);
        const filtered = list.filter((v) => v.id !== videoId);
        setSafeStorageItem('shacreatz_local_videos', JSON.stringify(filtered));
      }
    } catch (e) {}
  }

  /* --------------------------------------------------------------------------
     4. SUPABASE INITIALIZATION
     -------------------------------------------------------------------------- */
  async function initSupabase() {
    if (supabaseClient) return supabaseClient;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      let url = window.SUPABASE_CONFIG ? window.SUPABASE_CONFIG.url : '';
      let anonKey = window.SUPABASE_CONFIG ? window.SUPABASE_CONFIG.anonKey : '';

      // Check localStorage for overrides
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
            if (data.supabaseUrl && data.supabaseAnonKey) {
              url = data.supabaseUrl;
              anonKey = data.supabaseAnonKey;
            }
          }
        } catch (e) {
          // Static or local without serverless
        }
      }

      // Sanitize URL and Key against non-ISO-8859-1 code points
      url = sanitizeAsciiHeaderValue(url).replace(/\/+$/, '');
      anonKey = sanitizeAsciiHeaderValue(anonKey);

      // CRITICAL: Synchronize back to window.SUPABASE_CONFIG so all functions have active access
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
          console.log('[SHACREATZ DIAGNOSTIC 2/6: SUPABASE CLIENT INIT] Client initialized successfully for project:', redactedUrl, 'AnonKey length:', anonKey.length);
        } catch (err) {
          console.error('[SHACREATZ DIAGNOSTIC 2/6: SUPABASE CLIENT INIT] Failed to initialize client:', err.message);
        }
      } else {
        console.log('[SHACREATZ DIAGNOSTIC 2/6: SUPABASE CLIENT INIT] Supabase credentials not found or offline. Seamless local storage adapter active.');
      }

      return supabaseClient;
    })();

    return initPromise;
  }

  function isConfigured() {
    return Boolean(supabaseClient && isInitialized);
  }

  /* --------------------------------------------------------------------------
     5. UNLIMITED VIDEO RETRIEVAL WITH DEMO PURGING
     -------------------------------------------------------------------------- */
  async function fetchPortfolioVideos() {
    const client = await initSupabase();
    if (!client) {
      return await getLocalStoredVideos();
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
          console.error('[Supabase] Error fetching portfolio videos:', error);
          break;
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
          deleteLocalVideoRecord(video.id);
        } else {
          genuineVideos.push(video);
        }
      }

      // Merge genuine offline videos if any exist
      const localVideos = await getLocalStoredVideos();
      if (Array.isArray(localVideos) && localVideos.length > 0) {
        localVideos.forEach((localItem) => {
          if (!genuineVideos.some((v) => v.id === localItem.id)) {
            genuineVideos.push(localItem);
          }
        });
      }

      return genuineVideos;
    } catch (err) {
      console.error('[Supabase] Unexpected error fetching videos:', err);
      return await getLocalStoredVideos();
    }
  }

  /* --------------------------------------------------------------------------
     6. RELIABLE MOBILE VIDEO UPLOAD (ACTUAL FILE STREAMING, XHR PROGRESS & TRACE)
     -------------------------------------------------------------------------- */
  async function uploadVideoToStorage(file, onProgress) {
    if (!file) {
      throw new Error('No video file selected for upload.');
    }

    const client = await initSupabase();

    // 1. Safe extension, MIME, and unique ASCII-safe storage filename
    const safeExt = getSafeExtension(file);
    const safeMime = getSafeMimeType(file, safeExt);
    const safeFilename = generateSafeStorageFilename(file);
    const storagePath = `videos/${safeFilename}`;

    // STAGE 1 DIAGNOSTIC LOG (WITHOUT exposing credentials or keys)
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
    console.log('  Mobile User-Agent:  ', (typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js'));

    if (typeof onProgress === 'function') onProgress(5, 'Validating mobile video package...');

    const fileToUpload = file;

    // Local / Offline fallback when Supabase is not configured yet
    if (!client || !isConfigured()) {
      console.log('[SHACREATZ DIAGNOSTIC 2/6: SUPABASE CLIENT INIT] Supabase not connected. Using local persistence adapter.');
      if (typeof onProgress === 'function') onProgress(45, 'Saving video locally...');
      let blobUrl = `blob:local-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      try {
        if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && (fileToUpload instanceof Blob)) {
          blobUrl = URL.createObjectURL(fileToUpload);
        }
      } catch (e) {}
      if (typeof onProgress === 'function') onProgress(100, 'Upload complete!');
      return {
        publicUrl: blobUrl,
        storagePath: storagePath,
        safeFilename: safeFilename,
        mimeType: safeMime,
        isLocalBlob: true,
        fileBlob: fileToUpload
      };
    }

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

    // STAGE 2 & 3: Supabase Client & Auth Check
    let authHeaderValue = `Bearer ${anonKey}`;
    try {
      if (client.auth && typeof client.auth.getSession === 'function') {
        const { data: sessionData } = await client.auth.getSession();
        if (sessionData && sessionData.session && sessionData.session.access_token) {
          authHeaderValue = `Bearer ${sessionData.session.access_token}`;
          console.log('[SHACREATZ DIAGNOSTIC 3/6: AUTH SESSION CHECK] Authenticated admin session active (JWT verified).');
        } else {
          console.log('[SHACREATZ DIAGNOSTIC 3/6: AUTH SESSION CHECK] Public anonymous access (RLS policy active).');
        }
      }
    } catch (authErr) {
      console.log('[SHACREATZ DIAGNOSTIC 3/6: AUTH SESSION CHECK] Session check note:', authErr.message);
    }

    if (typeof onProgress === 'function') onProgress(10, 'Initiating mobile upload stream...');

    // Helper to classify upload errors accurately
    function classifyStorageError(status, message, rawText) {
      if (status === 0 || !status) {
        return new Error('Network or CORS preflight error: Mobile browser could not connect to Supabase Storage. Check network connection and CORS headers.');
      }
      if (status === 401) {
        return new Error('Authentication expired or invalid credentials (HTTP 401). Please check Supabase anon key.');
      }
      if (status === 403) {
        return new Error(`Storage permission denied (HTTP 403): Storage bucket '${BUCKET_NAME}' policy does not permit public upload. Please check Storage RLS policies.`);
      }
      if (status === 413) {
        return new Error('File too large (HTTP 413): The video file exceeds the maximum upload limit set in Supabase Storage.');
      }
      if (status === 504 || (message && message.includes('timed out'))) {
        return new Error('Upload timed out on slow mobile connection. Please check your signal strength and try again.');
      }
      return new Error(`Storage upload failed (HTTP ${status}): ${message || rawText || 'Check storage permissions and network.'}`);
    }

    // TIER 1: Resumable Upload via tus-js-client (if available in window.tus)
    const canUseTus = typeof window !== 'undefined' && window.tus && typeof window.tus.Upload === 'function';
    if (canUseTus && url && anonKey) {
      console.log('[SHACREATZ DIAGNOSTIC 4/6: STORAGE UPLOAD REQUEST] Method: TUS Resumable Upload (6MB Chunks)');
      console.log('  TUS Endpoint:       ', `${url}/storage/v1/upload/resumable`);
      console.log('  Bucket:             ', BUCKET_NAME);
      console.log('  Target Path:        ', storagePath);

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
                mimeType: safeMime,
                isLocalBlob: false
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

    // TIER 2: Direct Binary XHR Streaming (CORS-clean headers, NO unpermitted cache-control header)
    const uploadWithXHR = () => {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const uploadEndpoint = `${url}/storage/v1/object/${BUCKET_NAME}/${storagePath}`;

        console.log('[SHACREATZ DIAGNOSTIC 4/6: STORAGE UPLOAD REQUEST] Method: Direct Binary XHR Stream');
        console.log('  Endpoint:           ', uploadEndpoint);
        console.log('  Content-Type:       ', safeMime);

        // 5-minute timeout for slow mobile internet connections
        xhr.timeout = 300000;

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
              mimeType: safeMime,
              isLocalBlob: false
            });
            return;
          }

          // Parse Supabase error message
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
        // Standard permitted Supabase Storage headers ONLY (no cache-control to prevent CORS preflight drop)
        xhr.setRequestHeader('apikey', anonKey);
        xhr.setRequestHeader('Authorization', authHeaderValue);
        xhr.setRequestHeader('Content-Type', safeMime);
        xhr.setRequestHeader('x-upsert', 'false');

        // Stream the actual selected File object directly
        xhr.send(fileToUpload);
      });
    };

    // Attempt upload using streaming XHR
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

    // TIER 3: Supabase SDK Fallback with ArrayBuffer conversion (bypasses WebKit preflight file descriptor detach bug)
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
        throw new Error(`Storage permission denied: RLS policy blocked upload to '${BUCKET_NAME}'.`);
      } else if (msg.includes('Payload too large') || msg.includes('413')) {
        throw new Error('File too large: Video exceeds Supabase Storage file size limit.');
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
      mimeType: safeMime,
      isLocalBlob: false
    };
  }

  /* --------------------------------------------------------------------------
     7. SAVE VIDEO METADATA (SUPABASE POSTGRESQL + LOCAL MIRROR)
     -------------------------------------------------------------------------- */
  async function saveVideoMetadata({ title, category, tags, description, videoUrl, fileName, mimeType, fileSize, storagePath, isLocalBlob, fileBlob }) {
    const client = await initSupabase();

    // STAGE 6 DIAGNOSTIC LOG
    console.log('[SHACREATZ DIAGNOSTIC 6/6: DATABASE METADATA INSERT]');
    console.log('  Target Table:       ', TABLE_NAME);
    console.log('  Title:              ', title);
    console.log('  Original File Name: ', fileName);
    console.log('  Storage Path:       ', storagePath);
    console.log('  File Size:          ', fileSize);

    // Preserve original filename, title, category, tags, description in DB payload
    const newRecord = {
      title: title || 'Untitled Video',
      category: category || 'Uploaded Video',
      tags: tags || '',
      description: description || '',
      video_url: videoUrl,
      file_name: fileName || '', // Full original Unicode filename stored safely in DB body
      mime_type: mimeType || 'video/mp4',
      file_size: fileSize || 0,
      storage_path: storagePath || '',
      created_at: new Date().toISOString()
    };

    if (!client || !isConfigured()) {
      newRecord.id = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      newRecord.isLocalBlob = Boolean(isLocalBlob);
      await saveLocalVideoRecord(newRecord, fileBlob);
      console.log('[SHACREATZ DIAGNOSTIC 6/6: DATABASE METADATA INSERT] Saved to local mirror (ID: ' + newRecord.id + ')');
      return newRecord;
    }

    try {
      const { data, error } = await client
        .from(TABLE_NAME)
        .insert([newRecord])
        .select();

      if (error) {
        console.warn('[SHACREATZ DIAGNOSTIC 6/6: DATABASE METADATA INSERT] Insert with extended metadata failed, retrying with core columns:', error.message);
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

        if (baseError) throw baseError;
        const saved = baseData && baseData[0] ? baseData[0] : baseRecord;
        saved.tags = tags || '';
        saved.description = description || '';
        await saveLocalVideoRecord(saved);
        console.log('[SHACREATZ DIAGNOSTIC 6/6: DATABASE METADATA INSERT] Successfully inserted core record (ID: ' + saved.id + ')');
        return saved;
      }

      const saved = data && data[0] ? data[0] : newRecord;
      await saveLocalVideoRecord(saved);
      console.log('[SHACREATZ DIAGNOSTIC 6/6: DATABASE METADATA INSERT] Successfully inserted record (ID: ' + saved.id + ')');
      return saved;
    } catch (err) {
      console.error('[SHACREATZ DIAGNOSTIC 6/6: DATABASE METADATA INSERT] Database insert failed:', err.message);
      throw err;
    }
  }

  /* --------------------------------------------------------------------------
     8. UPDATE VIDEO METADATA (EDIT VIDEO)
     -------------------------------------------------------------------------- */
  async function updateVideoMetadata(videoId, { title, category, tags, description }) {
    const client = await initSupabase();

    // 1. Update in IndexedDB
    const db = await openIndexedDb();
    if (db) {
      try {
        const tx = db.transaction([IDB_STORE_VIDEOS], 'readwrite');
        const store = tx.objectStore(IDB_STORE_VIDEOS);
        const req = store.get(videoId);
        req.onsuccess = () => {
          if (req.result) {
            const updated = {
              ...req.result,
              title: title || req.result.title,
              category: category !== undefined ? category : req.result.category,
              tags: tags !== undefined ? tags : req.result.tags,
              description: description !== undefined ? description : req.result.description
            };
            store.put(updated);
          }
        };
      } catch (e) {
        console.warn('[IndexedDB] Update error:', e);
      }
    }

    // 2. Update in localStorage mirror
    try {
      const raw = getSafeStorageItem('shacreatz_local_videos');
      if (raw) {
        const list = JSON.parse(raw);
        const updatedList = list.map((v) =>
          v.id === videoId
            ? {
                ...v,
                title: title || v.title,
                category: category !== undefined ? category : v.category,
                tags: tags !== undefined ? tags : v.tags,
                description: description !== undefined ? description : v.description
              }
            : v
        );
        setSafeStorageItem('shacreatz_local_videos', JSON.stringify(updatedList));
      }
    } catch (e) {}

    if (!client) {
      return { id: videoId, title, category, tags, description };
    }

    try {
      const { data, error } = await client
        .from(TABLE_NAME)
        .update({
          title: title,
          category: category || '',
          tags: tags || '',
          description: description || ''
        })
        .eq('id', videoId)
        .select();

      if (error) {
        console.error('[Supabase] Error updating video metadata:', error);
        throw error;
      }

      return data && data[0] ? data[0] : { id: videoId, title, category, tags, description };
    } catch (err) {
      console.error('[Supabase] Update metadata failed:', err);
      throw err;
    }
  }

  /* --------------------------------------------------------------------------
     9. PERMANENT VIDEO DELETION (STORAGE OBJECT + DATABASE RECORD + LOCAL)
     -------------------------------------------------------------------------- */
  async function deletePortfolioVideo(videoId, storagePath) {
    const client = await initSupabase();

    // 1. Delete from local mirror immediately
    if (videoId) {
      await deleteLocalVideoRecord(videoId);
    }

    if (!client) return true;

    try {
      let resolvedStoragePath = storagePath;

      // If storage path was not provided and videoId exists, look it up in the database record first
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

      // 2. Delete from Supabase Storage bucket
      if (resolvedStoragePath && !resolvedStoragePath.startsWith('local_')) {
        const { error: storageError } = await client.storage
          .from(BUCKET_NAME)
          .remove([resolvedStoragePath]);

        if (storageError) {
          console.warn('[Supabase] Storage removal warning:', storageError);
        }
      }

      // 3. Delete database record
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
    generateSafeStorageFilename: generateSafeStorageFilename
  };

  // Pre-initialize in background
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSupabase);
  } else {
    initSupabase();
  }
})();
