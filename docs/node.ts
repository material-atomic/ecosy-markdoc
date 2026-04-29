import app from "./index";
import { server } from "@ecosy/markdoc/nodejs";

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";

server(app, { port: PORT, hostname: HOST }).start(() => {
  console.log(`Ecosy Markdoc docs → http://${HOST}:${PORT}`);
});
