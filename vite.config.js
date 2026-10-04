import { defineConfig } from 'vite';
import { readFile, readdir } from 'node:fs/promises';

// Local previews may read ignored exports. Production builds never copy them.
function localSurfaces(server) {
  const directory = new URL('./local-textures/', import.meta.url);
  server.middlewares.use('/__local-game-surfaces', async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    response.setHeader('Cache-Control', 'no-store');
    try {
      if (pathname === '/') {
        const files = await readdir(directory).catch(error => {
          if (error.code === 'ENOENT') return [];
          throw error;
        });
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(files.filter(name => /^[a-z]+-surface\.png$/.test(name))));
      } else if (/^\/[a-z]+-surface\.png$/.test(pathname)) {
        const data = await readFile(new URL(pathname.slice(1), directory));
        response.setHeader('Content-Type', 'image/png');
        response.end(data);
      } else {
        response.statusCode = 404;
        response.end();
      }
    } catch {
      response.statusCode = 404;
      response.end();
    }
  });
}

// Relative asset URLs work at https://<user>.github.io/<repository>/ and on custom domains.
export default defineConfig({
  base: './',
  plugins: [{ name: 'private-game-surfaces', configureServer: localSurfaces, configurePreviewServer: localSurfaces }]
});
