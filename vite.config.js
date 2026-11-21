import { defineConfig } from "vite";
import preview from "./api/preview.js";
export default defineConfig({
  plugins: [
    {
      name: "local-link-previews",
      configureServer(server) {
        server.middlewares.use("/api/preview", (req, res) => {
          req.query = Object.fromEntries(
            new URL(req.url, "http://localhost").searchParams,
          );
          res.status = (code) => {
            res.statusCode = code;
            return res;
          };
          res.json = (data) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(data));
          };
          preview(req, res);
        });
      },
    },
  ],
});
