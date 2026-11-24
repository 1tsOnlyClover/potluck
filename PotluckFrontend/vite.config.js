import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        indexStyles: resolve('css/index.css'),
        loginSignupStyles: resolve('css/login-signup.css'),
        profileStyles: resolve('css/profile.css'),
        siteStyles: resolve('css/site.css'),
        miniMaker: resolve('js/mini-maker.js'),
        modeller: resolve('js/modeller.js'),
      },
    },
  },
});
