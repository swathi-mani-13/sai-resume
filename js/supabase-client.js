/**
 * ============================================================================
 * SHACREATZ - SUPABASE CLIENT & CLOUD PERSISTENCE ADAPTER
 * ============================================================================
 * Handles permanent video file storage via Supabase Storage and permanent
 * video metadata persistence via Supabase PostgreSQL Database.
 */

(function () {
  let supabaseClient = null;
  let isInitialized = false;
  let initPromise = null;

  const BUCKET_NAME = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.bucketName) || 'portfolio-videos';
  const TABLE_NAME = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.tableName) || 'portfolio_videos';

  /**
   * Initializes the Supabase client using either:
   * 1. Dynamic Vercel /api/config endpoint
   * 2. window.SUPABASE_CONFIG (direct in js/supabase-config.js)
   * 3. LocalStorage override (for local developer testing)
   */
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
          // Running purely statically or locally without serverless
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
        console.warn('[Supabase] Credentials not yet configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel or js/supabase-config.js.');
      }

      return supabaseClient;
    })();

    return initPromise;
  }

  /**
   * Check if Supabase client is properly initialized
   */
  function isConfigured() {
    return Boolean(supabaseClient && isInitialized);
  }

  /**
   * Fetch all persistent videos from Supabase PostgreSQL Database
   */
  async function fetchPortfolioVideos() {
    const client = await initSupabase();
    if (!client) {
      console.warn('[Supabase] Client not configured. Returning empty video list.');
      return [];
    }

    try {
      const { data, error } = await client
        .from(TABLE_NAME)
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[Supabase] Error fetching portfolio videos:', error);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error('[Supabase] Unexpected error fetching videos:', err);
      return [];
    }
  }

  /**
   * Upload video file to Supabase Storage bucket 'portfolio-videos'
   */
  async function uploadVideoToStorage(file) {
    const client = await initSupabase();
    if (!client) {
      throw new Error('Supabase is not configured. Please set your Supabase credentials in Vercel or js/supabase-config.js.');
    }

    const cleanExt = (file.name.split('.').pop() || 'mp4').toLowerCase();
    const cleanBaseName = file.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 30);
    const uniqueId = Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const storagePath = `videos/${uniqueId}_${cleanBaseName}.${cleanExt}`;

    const mimeType = file.type || (cleanExt === 'mov' ? 'video/quicktime' : 'video/mp4');

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

    // Get public URL
    const { data: urlData } = client.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    if (!urlData || !urlData.publicUrl) {
      throw new Error('Failed to generate public URL for uploaded video');
    }

    return {
      publicUrl: urlData.publicUrl,
      storagePath: storagePath
    };
  }

  /**
   * Save video metadata into Supabase PostgreSQL table
   */
  async function saveVideoMetadata({ title, category, videoUrl, fileName, mimeType, fileSize, storagePath }) {
    const client = await initSupabase();
    if (!client) {
      throw new Error('Supabase client is not configured.');
    }

    const newRecord = {
      title: title || 'Untitled Video',
      category: category || 'Uploaded Video',
      video_url: videoUrl,
      file_name: fileName || '',
      mime_type: mimeType || 'video/mp4',
      file_size: fileSize || 0,
      storage_path: storagePath || ''
    };

    const { data, error } = await client
      .from(TABLE_NAME)
      .insert([newRecord])
      .select();

    if (error) {
      console.error('[Supabase] Database insert failed:', error);
      throw error;
    }

    return data && data[0] ? data[0] : newRecord;
  }

  /**
   * Delete video from Supabase Database and Storage
   */
  async function deletePortfolioVideo(videoId, storagePath) {
    const client = await initSupabase();
    if (!client) return false;

    try {
      // 1. Delete from database
      const { error: dbError } = await client
        .from(TABLE_NAME)
        .delete()
        .eq('id', videoId);

      if (dbError) {
        console.error('[Supabase] Error deleting from database:', dbError);
      }

      // 2. Delete from storage if storagePath exists
      if (storagePath) {
        const { error: storageError } = await client.storage
          .from(BUCKET_NAME)
          .remove([storagePath]);

        if (storageError) {
          console.warn('[Supabase] Error deleting from storage:', storageError);
        }
      }

      return true;
    } catch (err) {
      console.error('[Supabase] Error during delete:', err);
      return false;
    }
  }

  // Export API globally
  window.ShacreatzSupabase = {
    init: initSupabase,
    isConfigured: isConfigured,
    fetchVideos: fetchPortfolioVideos,
    uploadVideo: uploadVideoToStorage,
    saveMetadata: saveVideoMetadata,
    deleteVideo: deletePortfolioVideo
  };

  // Pre-initialize in background
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSupabase);
  } else {
    initSupabase();
  }
})();
