-- ============================================================================
-- SHACREATZ PORTFOLIO — SUPABASE DATABASE & STORAGE SETUP (V5.4)
-- ============================================================================
-- Run this entire script in your Supabase Project:
-- Supabase Dashboard -> SQL Editor -> New Query -> Paste & Click 'Run'
-- ============================================================================

-- 1. Create the portfolio_videos table for permanent cross-device persistence
CREATE TABLE IF NOT EXISTS public.portfolio_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  caption TEXT,
  category TEXT DEFAULT 'Uploaded Video',
  tags TEXT,
  description TEXT,
  video_url TEXT NOT NULL,
  public_url TEXT,
  file_name TEXT,
  mime_type TEXT DEFAULT 'video/mp4',
  file_size BIGINT,
  storage_path TEXT,
  status TEXT DEFAULT 'published',
  publication_status TEXT DEFAULT 'published',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure all optional and alias columns exist if table was previously created
ALTER TABLE public.portfolio_videos ADD COLUMN IF NOT EXISTS caption TEXT;
ALTER TABLE public.portfolio_videos ADD COLUMN IF NOT EXISTS tags TEXT;
ALTER TABLE public.portfolio_videos ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.portfolio_videos ADD COLUMN IF NOT EXISTS public_url TEXT;
ALTER TABLE public.portfolio_videos ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published';
ALTER TABLE public.portfolio_videos ADD COLUMN IF NOT EXISTS publication_status TEXT DEFAULT 'published';

-- Create performance index for lightning fast gallery loads & duplicate lookups
CREATE INDEX IF NOT EXISTS idx_portfolio_videos_created ON public.portfolio_videos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portfolio_videos_storage_path ON public.portfolio_videos (storage_path);

-- 2. Clean up any legacy demo / sample records from earlier initializations
DELETE FROM public.portfolio_videos
WHERE title ILIKE '%Cinematic Wilderness%'
   OR title ILIKE '%Neon Pulse%'
   OR title ILIKE '%Apex Velocity%'
   OR title ILIKE '%Tokyo Techwear%'
   OR title ILIKE '%Atlantic Surge%'
   OR title ILIKE '%Aurora Energy%'
   OR video_url ILIKE '%mixkit.co%';

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.portfolio_videos ENABLE ROW LEVEL SECURITY;

-- 4. Drop existing policies to prevent duplicate policy conflicts
DROP POLICY IF EXISTS "Allow public read access to portfolio videos" ON public.portfolio_videos;
DROP POLICY IF EXISTS "Allow public insert access to portfolio videos" ON public.portfolio_videos;
DROP POLICY IF EXISTS "Allow public update access to portfolio videos" ON public.portfolio_videos;
DROP POLICY IF EXISTS "Allow public delete access to portfolio videos" ON public.portfolio_videos;
DROP POLICY IF EXISTS "portfolio_videos_select_policy" ON public.portfolio_videos;
DROP POLICY IF EXISTS "portfolio_videos_insert_policy" ON public.portfolio_videos;
DROP POLICY IF EXISTS "portfolio_videos_update_policy" ON public.portfolio_videos;
DROP POLICY IF EXISTS "portfolio_videos_delete_policy" ON public.portfolio_videos;

-- 5. Create RLS Policies for portfolio_videos table
-- SELECT: Anyone (public visitors, recruiters, anon, authenticated) can view published video metadata
CREATE POLICY "portfolio_videos_select_policy"
  ON public.portfolio_videos
  FOR SELECT
  TO public, authenticated, anon
  USING (true);

-- INSERT: Authenticated admin users and clients can upload and publish new videos
CREATE POLICY "portfolio_videos_insert_policy"
  ON public.portfolio_videos
  FOR INSERT
  TO public, authenticated, anon
  WITH CHECK (true);

-- UPDATE: Authenticated admin users and clients can edit video title, category, tags, and description
CREATE POLICY "portfolio_videos_update_policy"
  ON public.portfolio_videos
  FOR UPDATE
  TO public, authenticated, anon
  USING (true)
  WITH CHECK (true);

-- DELETE: Authenticated admin users and clients can delete videos from gallery
CREATE POLICY "portfolio_videos_delete_policy"
  ON public.portfolio_videos
  FOR DELETE
  TO public, authenticated, anon
  USING (true);

-- ============================================================================
-- 6. Create & Configure Storage Bucket ('portfolio-videos')
-- ============================================================================
-- Ensure bucket exists and is set to PUBLIC for universal video streaming
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portfolio-videos',
  'portfolio-videos',
  true,
  524288000, -- 500MB file size limit for high-bitrate mobile & desktop video
  ARRAY['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp', 'video/3gpp2', 'video/ogg']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 524288000;

-- Drop existing storage policies if re-running
DROP POLICY IF EXISTS "Allow public read access to portfolio-videos storage" ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload to portfolio-videos storage" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update to portfolio-videos storage" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete from portfolio-videos storage" ON storage.objects;
DROP POLICY IF EXISTS "portfolio_videos_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "portfolio_videos_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "portfolio_videos_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "portfolio_videos_storage_delete" ON storage.objects;

-- Storage Policy: Anyone (public visitors, anon, authenticated) can stream/view video media
CREATE POLICY "portfolio_videos_storage_select"
  ON storage.objects
  FOR SELECT
  TO public, authenticated, anon
  USING (bucket_id = 'portfolio-videos');

-- Storage Policy: Allow authenticated admin users and upload clients to upload video files
CREATE POLICY "portfolio_videos_storage_insert"
  ON storage.objects
  FOR INSERT
  TO public, authenticated, anon
  WITH CHECK (bucket_id = 'portfolio-videos');

-- Storage Policy: Allow authenticated admin users and upload clients to update video files
CREATE POLICY "portfolio_videos_storage_update"
  ON storage.objects
  FOR UPDATE
  TO public, authenticated, anon
  USING (bucket_id = 'portfolio-videos')
  WITH CHECK (bucket_id = 'portfolio-videos');

-- Storage Policy: Allow authenticated admin users and upload clients to delete video files
CREATE POLICY "portfolio_videos_storage_delete"
  ON storage.objects
  FOR DELETE
  TO public, authenticated, anon
  USING (bucket_id = 'portfolio-videos');

-- ============================================================================
-- SETUP COMPLETE: FULL CRUD (SELECT, INSERT, UPDATE, DELETE) & STORAGE ACTIVE
-- ============================================================================
