import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    {
      name: "hide-private-project-files",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          let pathname;
          try {
            pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
          } catch {
            response.writeHead(400).end("Bad request");
            return;
          }

          const privatePath = /^\/(?:backend|\.venv|\.git)(?:\/|$)/i.test(pathname)
            || /(?:^|\/)\.env(?:\.|$)/i.test(pathname)
            || /\.(?:py|pyc|db|sqlite3?)(?:-|$)/i.test(pathname);
          if (privatePath) {
            response.writeHead(404).end("Not found");
            return;
          }

          next();
        });
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
    fs: {
      deny: ["backend/**", ".env", ".env.*", ".venv/**", "**/*.db", "**/*.db-*"],
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
