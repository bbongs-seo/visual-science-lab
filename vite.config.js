import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // 상대 경로로 빌드해 GitHub Pages 하위 경로(/visual-science-lab/)나 다른 호스팅 어디서든 동작하게 한다
  base: "./",
  plugins: [
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["icons/icon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "과학 놀이터",
        short_name: "과학 놀이터",
        description: "지구를 돌리고 달을 끌어 보며 배우는 초등 3D 과학 놀이터",
        lang: "ko",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "any",
        background_color: "#070b1f",
        theme_color: "#070b1f",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // 앱 화면과 지구·달 사진은 미리 저장해 두고, 글꼴 조각(약 90개)은 쓰는 글자만 그때그때 저장한다
        globPatterns: ["**/*.{js,css,html,webp,png,svg}"],
        globIgnores: ["og-image.png"],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === "font",
            handler: "CacheFirst",
            options: { cacheName: "fonts", expiration: { maxEntries: 200 } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: "node",
  },
});
