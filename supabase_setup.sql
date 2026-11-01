-- ============================================================================
-- SHACREATZ PORTFOLIO — SUPABASE DATABASE & STORAGE SETUP (V5.0)
-- ============================================================================
-- Run this entire script in your Supabase Project:
-- Supabase Dashboard -> SQL Editor -> New Query -> Paste & Click 'Run'
-- ============================================================================

-- 1. Create the portfolio_videos table for persistent video metadata
CREATE TABLE IF NOT EXISTS public.portfolio_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT DEFAULT 'Uploaded Video',
  tags TEXT,
  description TEXT,
  video_url TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT DEFAULT 'video/mp4',
  file_size BIGINT,
  storage_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure tags and description columns exist if table was previously created
ALTER TABLE public.portfolio_videos ADD COLUMN IF NOT EXISTS tags TEXT;
ALTER TABLE public.portfolio_videos ADD COLUMN IF NOT EXISTS description TEXT;

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

-- 5. Create RLS Policies for portfolio_videos table
-- SELECT: Anyone can view video metadata
CREATE POLICY "Allow public read access to portfolio videos"
  ON public.portfolio_videos
  FOR SELECT
  USING (true);

-- INSERT: Anyone can upload and publish new videos
CREATE POLICY "Allow public insert access to portfolio videos"
  ON public.portfolio_videos
  FOR INSERT
  WITH CHECK (true);

-- UPDATE: Anyone can edit video title, category, tags, and description from the three-dot menu
CREATE POLICY "Allow public update access to portfolio videos"
  ON public.portfolio_videos
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- DELETE: Anyone can delete their video from the three-dot menu
CREATE POLICY "Allow public delete access to portfolio videos"
  ON public.portfolio_videos
  FOR DELETE
  USING (true);

-- ============================================================================
-- 6. Create & Configure Storage Bucket ('portfolio-videos')
-- ============================================================================
-- Ensure bucket exists and is set to PUBLIC for universal streaming
INSERT INTO storage.buckets (id, name, public)
VALUES ('portfolio-videos', 'portfolio-videos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing storage policies if re-running
DROP POLICY IF EXISTS "Allow public read access to portfolio-videos storage" ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload to portfolio-videos storage" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update to portfolio-videos storage" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete from portfolio-videos storage" ON storage.objects;

-- Storage Policy: Anyone can stream/view video media
CREATE POLICY "Allow public read access to portfolio-videos storage"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'portfolio-videos');

-- Storage Policy: Allow uploading video files into portfolio-videos bucket
CREATE POLICY "Allow public upload to portfolio-videos storage"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'portfolio-videos');

-- Storage Policy: Allow updating video files into portfolio-videos bucket
CREATE POLICY "Allow public update to portfolio-videos storage"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'portfolio-videos')
  WITH CHECK (bucket_id = 'portfolio-videos');

-- Storage Policy: Allow deleting video files from portfolio-videos bucket
CREATE POLICY "Allow public delete from portfolio-videos storage"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'portfolio-videos');

-- ============================================================================
-- SETUP COMPLETE: FULL CRUD (SELECT, INSERT, UPDATE, DELETE) & STORAGE ACTIVE
-- ============================================================================
