import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('LibreOffice Loader CDN Configuration', () => {
  const originalEnv = import.meta.env;

  beforeEach(() => {
    // Reset the module cache to ensure clean state
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    import.meta.env = originalEnv;
  });

  it('should use local path by default when VITE_USE_CDN is not set', async () => {
    // Mock environment without CDN settings
    vi.stubGlobal('import.meta.env', {
      BASE_URL: '/',
      VITE_USE_CDN: undefined,
      VITE_LIBREOFFICE_CDN_URL: undefined,
    });

    const { LibreOfficeConverter } = await import('../js/utils/libreoffice-loader');
    const converter = new LibreOfficeConverter();
    
    // Access private basePath via type assertion for testing
    const basePath = (converter as any).basePath;
    expect(basePath).toBe('/libreoffice-wasm/');
  });

  it('should use CDN path when VITE_USE_CDN is true', async () => {
    // Mock environment with VITE_USE_CDN enabled
    vi.stubGlobal('import.meta.env', {
      BASE_URL: '/',
      VITE_USE_CDN: 'true',
      VITE_LIBREOFFICE_CDN_URL: undefined,
    });

    const { LibreOfficeConverter } = await import('../js/utils/libreoffice-loader');
    const converter = new LibreOfficeConverter();
    
    const basePath = (converter as any).basePath;
    expect(basePath).toBe('https://cdn.jsdelivr.net/npm/@bentopdf/libreoffice-wasm@2.3.1/assets/');
  });

  it('should use custom CDN URL when VITE_LIBREOFFICE_CDN_URL is set', async () => {
    const customCdnUrl = 'https://custom-cdn.example.com/libreoffice/';
    
    vi.stubGlobal('import.meta.env', {
      BASE_URL: '/',
      VITE_USE_CDN: 'true',
      VITE_LIBREOFFICE_CDN_URL: customCdnUrl,
    });

    const { LibreOfficeConverter } = await import('../js/utils/libreoffice-loader');
    const converter = new LibreOfficeConverter();
    
    const basePath = (converter as any).basePath;
    expect(basePath).toBe(customCdnUrl);
  });

  it('should prioritize VITE_LIBREOFFICE_CDN_URL over VITE_USE_CDN', async () => {
    const customCdnUrl = 'https://priority-cdn.example.com/wasm/';
    
    vi.stubGlobal('import.meta.env', {
      BASE_URL: '/',
      VITE_USE_CDN: 'false',
      VITE_LIBREOFFICE_CDN_URL: customCdnUrl,
    });

    const { LibreOfficeConverter } = await import('../js/utils/libreoffice-loader');
    const converter = new LibreOfficeConverter();
    
    const basePath = (converter as any).basePath;
    expect(basePath).toBe(customCdnUrl);
  });

  it('should allow custom basePath override in constructor', async () => {
    const customPath = 'https://override.example.com/custom/';
    
    vi.stubGlobal('import.meta.env', {
      BASE_URL: '/',
      VITE_USE_CDN: 'true',
      VITE_LIBREOFFICE_CDN_URL: undefined,
    });

    const { LibreOfficeConverter } = await import('../js/utils/libreoffice-loader');
    const converter = new LibreOfficeConverter(customPath);
    
    const basePath = (converter as any).basePath;
    expect(basePath).toBe(customPath);
  });

  it('should use local path when VITE_USE_CDN is false', async () => {
    vi.stubGlobal('import.meta.env', {
      BASE_URL: '/bentopdf/',
      VITE_USE_CDN: 'false',
      VITE_LIBREOFFICE_CDN_URL: undefined,
    });

    const { LibreOfficeConverter } = await import('../js/utils/libreoffice-loader');
    const converter = new LibreOfficeConverter();
    
    const basePath = (converter as any).basePath;
    expect(basePath).toBe('/bentopdf/libreoffice-wasm/');
  });
});
