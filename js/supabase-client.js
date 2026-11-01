/**
 * ============================================================================
 * SHACREATZ - SUPABASE CLIENT & CLOUD PERSISTENCE ADAPTER (V5.0)
 * ============================================================================
 * Handles permanent video file storage via Supabase Storage and permanent
 * video metadata persistence via Supabase PostgreSQL Database.
 * Supports unlimited video uploads with pagination, full metadata (tags, desc),
 * full metadata editing, permanent deletion, and automatic demo video purging.
 */

(function () {
  let supabaseClient = null;
  let isInitialized = false;
  let initPromise = null;

  const BUCKET_NAME = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.bucketName) || 'portfolio-videos';
  const TABLE_NAME = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.tableName) || 'portfolio_videos';

  /* --------------------------------------------------------------------------
     1. DEMO DETECTOR & PERMANENT CLEANUP FILTER
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
     2. INDEXEDDB LOCAL STORAGE BACKUP FOR OFFLINE / TESTING PERSISTENCE
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
      const raw = localStorage.getItem('shacreatz_local_videos');
      if (raw) {
        const list = JSON.parse(raw);
        const filtered = list.filter((v) => !isConfirmedDemo(v));
        if (filtered.length !== list.length) {
          localStorage.setItem('shacreatz_local_videos', JSON.stringify(filtered));
        }
      }
    } catch (e) {}

    const db = await openIndexedDb();
    if (!db) {
      try {
        const raw = localStorage.getItem('shacreatz_local_videos');
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
      const raw = localStorage.getItem('shacreatz_local_videos');
      const list = raw ? JSON.parse(raw) : [];
      const filtered = list.filter((v) => v.id !== record.id && !isConfirmedDemo(v));
      filtered.push(record);
      localStorage.setItem('shacreatz_local_videos', JSON.stringify(filtered));
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
      const raw = localStorage.getItem('shacreatz_local_videos');
      if (raw) {
        const list = JSON.parse(raw);
        const filtered = list.filter((v) => v.id !== videoId);
        localStorage.setItem('shacreatz_local_videos', JSON.stringify(filtered));
      }
    } catch (e) {}
  }

  /* --------------------------------------------------------------------------
     3. SUPABASE INITIALIZATION
     -------------------------------------------------------------------------- */
  async function initSupabase() {
    if (supabaseClient) return supabaseClient;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      let url = window.SUPABASE_CONFIG ? window.SUPABASE_CONFIG.url : '';
      let anonKey = window.SUPABASE_CONFIG ? window.SUPABASE_CONFIG.anonKey : '';

      // Check localStorage for overrides
      const localUrl = localStorage.getItem('shacreatz_supabase_url');
      const localKey = localStorage.getItem('shacreatz_supabase_anon_key');
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

      if (url && anonKey && window.supabase && typeof window.supabase.createClient === 'function') {
        try {
          supabaseClient = window.supabase.createClient(url, anonKey, {
            auth: {
              persistSession: false,
              autoRefreshToken: false
            }
          });
          isInitialized = true;
          console.log('[Supabase] Client initialized successfully for project:', url);
        } catch (err) {
          console.error('[Supabase] Failed to initialize client:', err);
        }
      } else {
        console.log('[Supabase] Running with seamless local storage adapter.');
      }

      return supabaseClient;
    })();

    return initPromise;
  }

  function isConfigured() {
    return Boolean(supabaseClient && isInitialized);
  }

  /* --------------------------------------------------------------------------
     4. UNLIMITED VIDEO RETRIEVAL WITH DEMO PURGING
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
     5. VIDEO UPLOAD (SUPABASE CLOUD STORAGE WITH LOCAL FALLBACK & PROGRESS)
     -------------------------------------------------------------------------- */
  async function uploadVideoToStorage(file, onProgress) {
    const client = await initSupabase();

    if (typeof onProgress === 'function') onProgress(15, 'Preparing video file...');

    const cleanExt = (file.name.split('.').pop() || 'mp4').toLowerCase();
    const cleanBaseName = file.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 30);
    const uniqueId = Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const storagePath = `videos/${uniqueId}_${cleanBaseName}.${cleanExt}`;
    const mimeType = file.type || (cleanExt === 'mov' ? 'video/quicktime' : 'video/mp4');

    if (typeof onProgress === 'function') onProgress(35, 'Connecting to storage...');

    // If Supabase is not configured yet, store video blob locally
    if (!client) {
      if (typeof onProgress === 'function') onProgress(75, 'Saving video locally...');
      const blobUrl = URL.createObjectURL(file);
      if (typeof onProgress === 'function') onProgress(100, 'Upload complete!');
      return {
        publicUrl: blobUrl,
        storagePath: storagePath,
        isLocalBlob: true,
        fileBlob: file
      };
    }

    if (typeof onProgress === 'function') onProgress(55, 'Uploading to cloud storage...');

    const { data: uploadData, error: uploadError } = await client.storage
      .from(BUCKET_NAME)
      .upload(storagePath, file, {
        cacheControl: '31536000',
        upsert: false,
        contentType: mimeType
      });

    if (uploadError) {
      console.error('[Supabase] Storage upload failed:', uploadError);
      throw uploadError;
    }

    if (typeof onProgress === 'function') onProgress(85, 'Generating public video link...');

    const { data: urlData } = client.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    if (!urlData || !urlData.publicUrl) {
      throw new Error('Failed to generate public URL for uploaded video');
    }

    if (typeof onProgress === 'function') onProgress(100, 'Upload successful!');

    return {
      publicUrl: urlData.publicUrl,
      storagePath: storagePath,
      isLocalBlob: false
    };
  }

  /* --------------------------------------------------------------------------
     6. SAVE VIDEO METADATA (SUPABASE POSTGRESQL + LOCAL MIRROR)
     -------------------------------------------------------------------------- */
  async function saveVideoMetadata({ title, category, tags, description, videoUrl, fileName, mimeType, fileSize, storagePath, isLocalBlob, fileBlob }) {
    const client = await initSupabase();

    const newRecord = {
      title: title || 'Untitled Video',
      category: category || 'Uploaded Video',
      tags: tags || '',
      description: description || '',
      video_url: videoUrl,
      file_name: fileName || '',
      mime_type: mimeType || 'video/mp4',
      file_size: fileSize || 0,
      storage_path: storagePath || '',
      created_at: new Date().toISOString()
    };

    if (!client) {
      newRecord.id = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      newRecord.isLocalBlob = Boolean(isLocalBlob);
      await saveLocalVideoRecord(newRecord, fileBlob);
      return newRecord;
    }

    try {
      const { data, error } = await client
        .from(TABLE_NAME)
        .insert([newRecord])
        .select();

      if (error) {
        console.warn('[Supabase] Insert with extended metadata failed, retrying with core columns:', error.message);
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
        return saved;
      }

      const saved = data && data[0] ? data[0] : newRecord;
      await saveLocalVideoRecord(saved);
      return saved;
    } catch (err) {
      console.error('[Supabase] Database insert failed:', err);
      throw err;
    }
  }

  /* --------------------------------------------------------------------------
     7. UPDATE VIDEO METADATA (EDIT VIDEO)
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
      const raw = localStorage.getItem('shacreatz_local_videos');
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
        localStorage.setItem('shacreatz_local_videos', JSON.stringify(updatedList));
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
     8. PERMANENT VIDEO DELETION (STORAGE OBJECT + DATABASE RECORD + LOCAL)
     -------------------------------------------------------------------------- */
  async function deletePortfolioVideo(videoId, storagePath) {
    const client = await initSupabase();

    // 1. Delete from local mirror immediately
    await deleteLocalVideoRecord(videoId);

    if (!client) return true;

    try {
      let resolvedStoragePath = storagePath;

      // If storage path was not provided, look it up in the database record first
      if (!resolvedStoragePath) {
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
      const { error: dbError } = await client
        .from(TABLE_NAME)
        .delete()
        .eq('id', videoId);

      if (dbError) {
        console.error('[Supabase] Error deleting from database:', dbError);
        throw dbError;
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
    isConfirmedDemo: isConfirmedDemo
  };

  // Pre-initialize in background
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSupabase);
  } else {
    initSupabase();
  }
})();
