import { cp, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const standaloneRoot = path.join(projectRoot, ".next", "standalone");

async function copyIfPresent(source, destination) {
  try {
    await stat(source);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }

  await cp(source, destination, { recursive: true, force: true });
}

await copyIfPresent(path.join(projectRoot, "public"), path.join(standaloneRoot, "public"));
await copyIfPresent(path.join(projectRoot, ".next", "static"), path.join(standaloneRoot, ".next", "static"));
