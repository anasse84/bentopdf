/**
 * BentoPDF WASM Proxy Worker
 *
 * This Cloudflare Worker proxies WASM module requests to bypass CORS restrictions.
 * It fetches WASM libraries (LibreOffice, PyMuPDF, Ghostscript, CoherentPDF) from configured sources
 * and serves them with proper CORS headers.
 *
 * Endpoints:
 * - /libreoffice/* - Proxies to LibreOffice WASM source (with .gz decompression for .wasm/.data files)
 * - /pymupdf/* - Proxies to PyMuPDF WASM source
 * - /gs/* - Proxies to Ghostscript WASM source
 * - /cpdf/* - Proxies to CoherentPDF WASM source
 *
 * Deploy: cd cloudflare && npx wrangler deploy -c wasm-wrangler.toml
 *
 * Required Environment Variables (set in Cloudflare dashboard):
 * - LIBREOFFICE_SOURCE: Base URL for LibreOffice WASM files (e.g., https://cdn.example.com/libreoffice)
 * - PYMUPDF_SOURCE: Base URL for PyMuPDF WASM files (e.g., https://cdn.example.com/pymupdf)
 * - GS_SOURCE: Base URL for Ghostscript WASM files (e.g., https://cdn.example.com/gs)
 * - CPDF_SOURCE: Base URL for CoherentPDF files (e.g., https://cdn.example.com/cpdf)
 */

const ALLOWED_ORIGINS = ['https://www.bentopdf.com', 'https://bentopdf.com', 'https://bentopdf-32l.pages.dev'];

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

const RATE_LIMIT_MAX_REQUESTS = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

const CACHE_TTL_SECONDS = 604800;

const ALLOWED_EXTENSIONS = [
  '.js',
  '.mjs',
  '.wasm',
  '.data',
  '.py',
  '.so',
  '.zip',
  '.json',
  '.mem',
  '.asm.js',
  '.worker.js',
  '.html',
  '.gz',
];

function isAllowedOrigin(origin) {
  if (!origin) return true; // Allow no-origin requests (e.g., direct browser navigation)
  return ALLOWED_ORIGINS.some((allowed) =>
    origin.startsWith(allowed.replace(/\/$/, ''))
  );
}

function isAllowedFile(pathname) {
  const ext = pathname.substring(pathname.lastIndexOf('.')).toLowerCase();
  if (ALLOWED_EXTENSIONS.includes(ext)) return true;

  if (!pathname.includes('.') || pathname.endsWith('/')) return true;

  return false;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range, Cache-Control',
    'Access-Control-Expose-Headers':
      'Content-Length, Content-Range, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function handleOptions(request) {
  const origin = request.headers.get('Origin');
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

function getContentType(pathname) {
  const ext = pathname.substring(pathname.lastIndexOf('.')).toLowerCase();
  const contentTypes = {
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.wasm': 'application/wasm',
    '.json': 'application/json',
    '.data': 'application/octet-stream',
    '.py': 'text/x-python',
    '.so': 'application/octet-stream',
    '.zip': 'application/zip',
    '.mem': 'application/octet-stream',
    '.html': 'text/html',
  };
  return contentTypes[ext] || 'application/octet-stream';
}

async function proxyRequest(request, env, sourceBaseUrl, subpath, origin) {
  if (!sourceBaseUrl) {
    return new Response(
      JSON.stringify({
        error: 'Source not configured',
        message: 'This WASM module source URL has not been configured.',
      }),
      {
        status: 503,
        headers: {
          ...corsHeaders(origin),
          'Content-Type': 'application/json',
        },
      }
    );
  }

  const normalizedBase = sourceBaseUrl.endsWith('/')
    ? sourceBaseUrl.slice(0, -1)
    : sourceBaseUrl;
  const normalizedPath = subpath.startsWith('/') ? subpath : `/${subpath}`;
  const targetUrl = `${normalizedBase}${normalizedPath}`;

  if (!isAllowedFile(normalizedPath)) {
    return new Response(
      JSON.stringify({
        error: 'Forbidden file type',
        message: 'Only WASM-related file types are allowed.',
      }),
      {
        status: 403,
        headers: {
          ...corsHeaders(origin),
          'Content-Type': 'application/json',
        },
      }
    );
  }

  try {
    const cacheKey = new Request(targetUrl, request);
    const cache = caches.default;
    let response = await cache.match(cacheKey);

    if (!response) {
      response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'BentoPDF-WASM-Proxy/1.0',
          Accept: '*/*',
        },
      });

      if (!response.ok) {
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch resource',
            status: response.status,
            statusText: response.statusText,
            targetUrl: targetUrl,
          }),
          {
            status: response.status,
            headers: {
              ...corsHeaders(origin),
              'Content-Type': 'application/json',
            },
          }
        );
      }

      const contentLength = parseInt(
        response.headers.get('Content-Length') || '0',
        10
      );
      if (contentLength > MAX_FILE_SIZE_BYTES) {
        return new Response(
          JSON.stringify({
            error: 'File too large',
            message: `File exceeds maximum size of ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`,
          }),
          {
            status: 413,
            headers: {
              ...corsHeaders(origin),
              'Content-Type': 'application/json',
            },
          }
        );
      }

      response = new Response(response.body, response);
      response.headers.set(
        'Cache-Control',
        `public, max-age=${CACHE_TTL_SECONDS}`
      );

      if (response.status === 200) {
        await cache.put(cacheKey, response.clone());
      }
    }

    const bodyData = await response.arrayBuffer();

    return new Response(bodyData, {
      status: 200,
      headers: {
        ...corsHeaders(origin),
        'Content-Type': getContentType(normalizedPath),
        'Content-Length': bodyData.byteLength.toString(),
        'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
        'X-Proxied-From': new URL(targetUrl).hostname,
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Proxy error',
        message: error.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders(origin),
          'Content-Type': 'application/json',
        },
      }
    );
  }
}

/**
 * Special proxy for LibreOffice .gz files
 * Fetches .gz files from CDN and serves them with Content-Encoding: gzip
 * Uses encodeBody: 'manual' to prevent Cloudflare from stripping the header
 * This allows the browser to decompress natively
 */
async function proxyLibreOfficeGz(request, env, sourceBaseUrl, subpath, origin) {
  if (!sourceBaseUrl) {
    return new Response(
      JSON.stringify({ error: 'Source not configured' }),
      { status: 503, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  const normalizedBase = sourceBaseUrl.endsWith('/') ? sourceBaseUrl.slice(0, -1) : sourceBaseUrl;
  const normalizedPath = subpath.startsWith('/') ? subpath : `/${subpath}`;
  const targetUrl = `${normalizedBase}${normalizedPath}`;

  try {
    const response = await fetch(targetUrl, {
      headers: { 'User-Agent': 'BentoPDF-WASM-Proxy/1.0', Accept: '*/*' },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch', status: response.status, targetUrl }),
        { status: response.status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    const gzipBody = await response.arrayBuffer();

    // Determine Content-Type based on the original file (before .gz)
    let contentType = 'application/octet-stream';
    if (subpath.includes('soffice.wasm')) {
      contentType = 'application/wasm';
    }

    // Use encodeBody: 'manual' to prevent Cloudflare from stripping Content-Encoding
    return new Response(gzipBody, {
      status: 200,
      encodeBody: 'manual',
      headers: {
        ...corsHeaders(origin),
        'Content-Type': contentType,
        'Content-Encoding': 'gzip',
        'Content-Length': gzipBody.byteLength.toString(),
        'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Proxy error', message: error.message }),
      { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    if (!isAllowedOrigin(origin)) {
      return new Response(
        JSON.stringify({
          error: 'Forbidden',
          message:
            'Origin not allowed. Add your domain to ALLOWED_ORIGINS if self-hosting.',
        }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(origin),
          },
        }
      );
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {
        status: 405,
        headers: corsHeaders(origin),
      });
    }

    if (env.RATE_LIMIT_KV) {
      const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
      const rateLimitKey = `wasm-ratelimit:${clientIP}`;
      const now = Date.now();

      const rateLimitData = await env.RATE_LIMIT_KV.get(rateLimitKey, {
        type: 'json',
      });
      const requests = rateLimitData?.requests || [];
      const recentRequests = requests.filter(
        (t) => now - t < RATE_LIMIT_WINDOW_MS
      );

      if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
        return new Response(
          JSON.stringify({
            error: 'Rate limit exceeded',
            message: `Maximum ${RATE_LIMIT_MAX_REQUESTS} requests per minute.`,
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders(origin),
              'Content-Type': 'application/json',
              'Retry-After': '60',
            },
          }
        );
      }

      recentRequests.push(now);
      await env.RATE_LIMIT_KV.put(
        rateLimitKey,
        JSON.stringify({ requests: recentRequests }),
        {
          expirationTtl: 120,
        }
      );
    }

    // === LibreOffice WASM (with gzip header fix) ===
    if (pathname.startsWith('/libreoffice/')) {
      const subpath = pathname.replace('/libreoffice', '');

      // .wasm and .data files: fetch .gz from CDN, serve with Content-Encoding: gzip
      // Emscripten requests soffice.wasm but CDN only has soffice.wasm.gz
      if (subpath.endsWith('.wasm') || subpath.endsWith('.data')) {
        return proxyLibreOfficeGz(request, env, env.LIBREOFFICE_SOURCE, subpath + '.gz', origin);
      }

      // .gz files also handled (direct requests)
      if (subpath.endsWith('.gz')) {
        return proxyLibreOfficeGz(request, env, env.LIBREOFFICE_SOURCE, subpath, origin);
      }

      // .js files: normal proxy
      return proxyRequest(request, env, env.LIBREOFFICE_SOURCE, subpath, origin);
    }

    if (pathname.startsWith('/pymupdf/')) {
      const subpath = pathname.replace('/pymupdf', '');
      return proxyRequest(request, env, env.PYMUPDF_SOURCE, subpath, origin);
    }

    if (pathname.startsWith('/gs/')) {
      const subpath = pathname.replace('/gs', '');
      return proxyRequest(request, env, env.GS_SOURCE, subpath, origin);
    }

    if (pathname.startsWith('/cpdf/')) {
      const subpath = pathname.replace('/cpdf', '');
      return proxyRequest(request, env, env.CPDF_SOURCE, subpath, origin);
    }

    if (pathname === '/' || pathname === '/health') {
      return new Response(
        JSON.stringify({
          service: 'BentoPDF WASM Proxy',
          version: '2.0.0',
          endpoints: {
            libreoffice: '/libreoffice/*',
            pymupdf: '/pymupdf/*',
            gs: '/gs/*',
            cpdf: '/cpdf/*',
          },
          configured: {
            libreoffice: !!env.LIBREOFFICE_SOURCE,
            pymupdf: !!env.PYMUPDF_SOURCE,
            gs: !!env.GS_SOURCE,
            cpdf: !!env.CPDF_SOURCE,
          },
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders(origin),
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        error: 'Not Found',
        message: 'Use /libreoffice/*, /pymupdf/*, /gs/*, or /cpdf/* endpoints',
      }),
      {
        status: 404,
        headers: {
          ...corsHeaders(origin),
          'Content-Type': 'application/json',
        },
      }
    );
  },
};
