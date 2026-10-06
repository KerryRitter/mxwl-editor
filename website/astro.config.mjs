import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.mxwl.work',
  output: 'static',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
});
