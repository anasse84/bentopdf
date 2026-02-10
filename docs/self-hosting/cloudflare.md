# Deploy to Cloudflare Pages

[Cloudflare Pages](https://pages.cloudflare.com) offers fast, global static site hosting with unlimited bandwidth.

## Quick Deploy

1. Go to [Cloudflare Pages](https://dash.cloudflare.com/?to=/:account/pages)
2. Click "Create a project"
3. Connect your GitHub repository

## Build Configuration

| Setting | Value |
|---------|-------|
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |

## Environment Variables

Add these in Settings → Environment variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_VERSION` | `18` | Node.js version |
| `VITE_USE_CDN` | `true` | Use CDN for WASM files (recommended for Cloudflare Pages) |
| `VITE_LIBREOFFICE_CDN_URL` | `https://cdn.jsdelivr.net/npm/@bentopdf/libreoffice-wasm@2.3.1/assets/` | LibreOffice WASM CDN URL (verify latest version) |
| `SIMPLE_MODE` | `false` | Optional: Enable simple mode |

> **Note:** Setting `VITE_USE_CDN=true` enables CDN for LibreOffice WASM files, avoiding Cloudflare Pages' 25MB file size limit. The version in the CDN URL should match the version defined in `src/js/utils/libreoffice-loader.ts`. For other WASM packages (PyMuPDF, Ghostscript, CoherentPDF), configure them via the WASM Settings page in the application.

## Configuration Files

### COOP/COEP Headers

Create `_headers` in your `public` folder for required security headers:

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp

/*.wasm
  Cache-Control: public, max-age=31536000, immutable
  Content-Type: application/wasm

/sw.js
  Cache-Control: no-cache
```

> **Note:** These COOP/COEP headers are required for SharedArrayBuffer support, which LibreOffice WASM depends on.

### SPA Routing

Create `_redirects` for SPA routing:

```
/*    /index.html   200
```

## Custom Domain

1. Go to your Pages project
2. Click "Custom domains"
3. Add your domain
4. Cloudflare will auto-configure DNS if the domain is on Cloudflare

## Advantages

- **Free unlimited bandwidth**
- **Global CDN** with 300+ edge locations
- **Automatic HTTPS**
- **Preview deployments** for pull requests
- **Fast builds**

## Troubleshooting

### Large File Size Limits

Cloudflare Pages has a 25 MB file size limit. BentoPDF uses CDN delivery for large WASM files to avoid this limitation.

**LibreOffice WASM files that exceed 25MB:**
- `soffice.data.gz` (~60MB)
- `soffice.wasm.gz` (~30MB)

**Solution:** Set `VITE_USE_CDN=true` in environment variables to use CDN delivery for all WASM files. This is automatically configured when you follow the environment variable setup above.

### Worker Size Limits

If using Cloudflare Workers for advanced routing, note the 1 MB limit for free plans.

## CORS Proxy Worker (For Digital Signatures)

The Digital Signature tool requires a CORS proxy to fetch certificate chains. Deploy the included worker:

```bash
cd cloudflare
npx wrangler login
npx wrangler deploy
```

### Security Features

| Feature | Description |
|---------|-------------|
| **URL Restrictions** | Only certificate URLs allowed |
| **File Size Limit** | Max 10MB per request |
| **Rate Limiting** | 60 req/IP/min (requires KV) |
| **Private IP Blocking** | Blocks localhost, internal IPs |

### Enable Rate Limiting

```bash
# Create KV namespace
npx wrangler kv namespace create "RATE_LIMIT_KV"

# Add to wrangler.toml with returned ID:
# [[kv_namespaces]]
# binding = "RATE_LIMIT_KV"
# id = "YOUR_ID"

npx wrangler deploy
```

### Build with Proxy URL

```bash
VITE_CORS_PROXY_URL=https://your-worker.workers.dev npm run build
```

> **Note:** See [README](https://github.com/alam00000/bentopdf#digital-signature-cors-proxy-required) for HMAC signature setup.
