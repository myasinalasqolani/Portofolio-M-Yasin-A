const fs = require("node:fs/promises");
const path = require("node:path");

async function buildStaticSite() {
  const projectRoot = path.resolve(__dirname, "..");
  const outputDirectory = path.join(projectRoot, "dist");

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.copyFile(
    path.join(projectRoot, "index.html"),
    path.join(outputDirectory, "index.html"),
  );
  await fs.cp(
    path.join(projectRoot, "assets"),
    path.join(outputDirectory, "assets"),
    { recursive: true },
  );
}

buildStaticSite().catch((error) => {
  console.error("Static site build failed:", error);
  process.exitCode = 1;
});
