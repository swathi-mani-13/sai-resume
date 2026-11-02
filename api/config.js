/**
 * ============================================================================
 * VERCEL SERVERLESS FUNCTION: /api/config
 * ============================================================================
 * Exposes safe public configuration (Supabase URL & Anon Key) from Vercel
 * Environment Variables to the frontend client with strict runtime validation.
 */

function isMaskedOrInvalidKey(key) {
  if (!key || typeof key !== 'string') return true;
  // Detect bullet characters (•, \u2022), asterisks, or values that are not valid JWTs
  if (key.includes('•') || key.includes('\u2022') || key.startsWith('***') || key.length < 50) {
    return true;
  }
  // Supabase anon key is always a standard JWT starting with 'ey' and containing two dots
  if (!key.startsWith('ey') || key.split('.').length !== 3) {
    return true;
  }
  // Check for non-ASCII characters that break WHATWG ByteString in fetch headers
  if (/[^\x20-\x7E]/.test(key)) {
    return true;
  }
  return false;
}

function isInvalidUrl(url) {
  if (!url || typeof url !== 'string') return true;
  const trimmed = url.trim().toLowerCase();
  if (!trimmed.startsWith('https://')) return true;
  if (trimmed.includes('your-project-id') || trimmed.includes('placeholder')) return true;
  return false;
}

function handler(req, res) {
  // Prevent any browser or CDN caching of configuration
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let rawUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  let rawKey = (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

  // Strip trailing slashes from URL
  rawUrl = rawUrl.replace(/\/+$/, '');

  const hasInvalidKey = isMaskedOrInvalidKey(rawKey);
  const hasInvalidUrl = isInvalidUrl(rawUrl);

  const isConfigured = Boolean(rawUrl && rawKey && !hasInvalidKey && !hasInvalidUrl);

  // Diagnostic feedback for developers (WITHOUT exposing sensitive secrets)
  let diagnostic = 'OK';
  if (!rawUrl && !rawKey) {
    diagnostic = 'Missing SUPABASE_URL and SUPABASE_ANON_KEY environment variables in Vercel.';
  } else if (hasInvalidKey) {
    if (rawKey.includes('•') || rawKey.includes('\u2022')) {
      diagnostic = 'CRITICAL: SUPABASE_ANON_KEY contains masked bullet characters (••••••••). You must copy the actual JWT key from Supabase Dashboard -> Project Settings -> API, not the masked field.';
    } else if (!rawKey.startsWith('ey') || rawKey.split('.').length !== 3) {
      diagnostic = 'CRITICAL: SUPABASE_ANON_KEY is not a valid JWT. It must start with "ey" and have three base64 segments separated by dots.';
    } else {
      diagnostic = 'CRITICAL: SUPABASE_ANON_KEY contains invalid non-ASCII characters.';
    }
  } else if (hasInvalidUrl) {
    diagnostic = 'CRITICAL: SUPABASE_URL must be a valid HTTPS URL (e.g. https://your-ref.supabase.co).';
  }

  return res.status(200).json({
    supabaseUrl: isConfigured ? rawUrl : (hasInvalidUrl ? '' : rawUrl),
    supabaseAnonKey: isConfigured ? rawKey : '',
    isConfigured: isConfigured,
    diagnostic: {
      status: isConfigured ? 'READY' : 'CONFIGURATION_ERROR',
      message: diagnostic,
      urlConfigured: Boolean(rawUrl && !hasInvalidUrl),
      keyValid: !hasInvalidKey,
      keyLength: rawKey ? rawKey.length : 0
    }
  });
}

// Export for both ESM and CommonJS
export default handler;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = handler;
}
