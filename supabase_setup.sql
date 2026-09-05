-- ============================================================================
-- SHACREATZ PORTFOLIO — SUPABASE DATABASE & STORAGE SETUP
-- ============================================================================
-- Run this entire script in your Supabase Project:
-- Supabase Dashboard -> SQL Editor -> New Query -> Paste & Click 'Run'
-- ============================================================================

-- 1. Create the portfolio_videos table for persistent video metadata
CREATE TABLE IF NOT EXISTS public.portfolio_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT DEFAULT 'Uploaded Video',
  video_url TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT DEFAULT 'video/mp4',
  file_size BIGINT,
  storage_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.portfolio_videos ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies if re-running
DROP POLICY IF EXISTS "Allow public read access to portfolio videos" ON public.portfolio_videos;
DROP POLICY IF EXISTS "Allow public insert access to portfolio videos" ON public.portfolio_videos;
DROP POLICY IF EXISTS "Allow public delete access to portfolio videos" ON public.portfolio_videos;

-- 4. Create RLS Policies for portfolio_videos table
-- Allows anyone (including your portfolio visitors/portfolio owner) to view videos
CREATE POLICY "Allow public read access to portfolio videos"
  ON public.portfolio_videos
  FOR SELECT
  USING (true);

-- Allows inserting new videos from the + ADD VIDEO button
CREATE POLICY "Allow public insert access to portfolio videos"
  ON public.portfolio_videos
  FOR INSERT
  WITH CHECK (true);

-- Allows deleting videos when clicking the remove button
CREATE POLICY "Allow public delete access to portfolio videos"
  ON public.portfolio_videos
  FOR DELETE
  USING (true);

-- ============================================================================
-- 5. Create Storage Bucket for actual video files
-- ============================================================================
-- Ensure the 'portfolio-videos' bucket exists and is set to PUBLIC
INSERT INTO storage.buckets (id, name, public)
VALUES ('portfolio-videos', 'portfolio-videos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing storage policies if re-running
DROP POLICY IF EXISTS "Allow public read access to portfolio-videos storage" ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload to portfolio-videos storage" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete from portfolio-videos storage" ON storage.objects;

-- Storage Policy: Anyone can stream/view videos
CREATE POLICY "Allow public read access to portfolio-videos storage"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'portfolio-videos');

-- Storage Policy: Allow uploading video files into portfolio-videos bucket
CREATE POLICY "Allow public upload to portfolio-videos storage"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'portfolio-videos');

-- Storage Policy: Allow removing video files from portfolio-videos bucket
CREATE POLICY "Allow public delete from portfolio-videos storage"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'portfolio-videos');

-- ============================================================================
-- SETUP COMPLETE!
-- ============================================================================
