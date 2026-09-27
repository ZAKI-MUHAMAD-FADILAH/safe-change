import { startServer } from "./server.js";

startServer().catch((err: unknown) => {
  process.stderr.write(
    `MCP server failed to start: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
