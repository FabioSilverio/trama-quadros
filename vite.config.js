import { defineConfig } from "vite";
import preview from "./api/preview.js";
import auth from "./api/auth.js";
import workspace from "./api/workspace.js";

function mount(server, route, handler) {
  server.middlewares.use(route, (req, res) => {
    req.query = Object.fromEntries(
      new URL(req.url, "http://localhost").searchParams,
    );
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(data));
    };
    Promise.resolve(handler(req, res)).catch((err) => {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: err?.message || "Internal error" }));
      }
    });
  });
}

export default defineConfig({
  plugins: [
    {
      name: "local-api",
      configureServer(server) {
        mount(server, "/api/preview", preview);
        mount(server, "/api/auth", auth);
        mount(server, "/api/workspace", workspace);
      },
    },
  ],
});
