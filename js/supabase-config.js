/**
 * ============================================================================
 * SHACREATZ - SUPABASE CLIENT CONFIGURATION
 * ============================================================================
 * 
 * 1. FOR VERCEL DEPLOYMENT:
 *    Add SUPABASE_URL and SUPABASE_ANON_KEY to Vercel Project Settings.
 *    The app automatically fetches them via /api/config!
 * 
 * 2. FOR DIRECT / LOCAL USAGE:
 *    You can also paste your Supabase credentials below directly if running
 *    locally without Vercel CLI.
 * 
 * NOTE: Only use the public 'anon' key here. NEVER paste service_role keys.
 */

window.SUPABASE_CONFIG = {
  // Replace with your project URL (e.g. 'https://your-project.supabase.co')
  url: '',

  // Replace with your project anon public key
  anonKey: '',

  // Storage bucket name
  bucketName: 'portfolio-videos',

  // Database table name
  tableName: 'portfolio_videos'
};
