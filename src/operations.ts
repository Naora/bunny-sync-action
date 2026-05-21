import * as core from "@actions/core";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { ReadableStream } from "node:stream/web";
import * as fs from "node:fs/promises";
import path from "node:path";
import * as BunnyStorageSDK from "@bunny.net/storage-sdk";


type SyncOperation = {
  type: "upload" | "delete" | "delete_directory";
  filePath: string;
};

export async function executeSyncPlan(
  baseDir: string,
  remoteDir: string,
  syncPlan: SyncOperation[],
  storageZone: BunnyStorageSDK.StorageZone,
): Promise<void> {
  await Promise.all(
    syncPlan.map(async (op) => {
      const remotePath = resolveRemotePath(remoteDir, op.filePath);
      if (op.type === "upload") {
        try {
          // createReadStream returns a Node.js Readable; cast to the Web Streams
          // type that the Bunny SDK expects.
          const stream = createReadStream(
            path.join(baseDir, op.filePath),
          ) as unknown as ReadableStream<Uint8Array>;
          await BunnyStorageSDK.file.upload(storageZone, remotePath, stream);
          core.info(`Uploaded: ${op.filePath}`);
        } catch (err) {
          core.error(`Failed to upload: ${op.filePath} — ${err instanceof Error ? err.message : String(err)}`);
        }
      } else if (op.type === "delete") {
        try {
          await BunnyStorageSDK.file.remove(storageZone, remotePath);
          core.info(`Deleted: ${op.filePath}`);
        } catch (err) {
          core.error(`Failed to delete: ${op.filePath} — ${err instanceof Error ? err.message : String(err)}`);
        }
      } else if (op.type === "delete_directory") {
        try {
          await BunnyStorageSDK.file.removeDirectory(storageZone, remotePath);
          core.info(`Deleted directory: ${op.filePath}`);
        } catch (err) {
          core.error(`Failed to delete directory: ${op.filePath} — ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }),
  );
}

/** Prepend remoteDir to a relative filePath for Bunny API calls. */
function resolveRemotePath(remoteDir: string, filePath: string): string {
  if (remoteDir === "/") return filePath;
  return `${remoteDir.replace(/\/+$/, "")}/${filePath}`;
}

type DirectoryEntry = {
  type: "directory";
};

type FileEntry = {
  type: "file";
  checksum: string;
  filePath: string;
};

type LocalEntry = DirectoryEntry | FileEntry;

export function buildSyncPlan(
  remoteFiles: Record<string, LocalEntry>,
  localFiles: Record<string, LocalEntry>,
  shouldDelete: boolean,
): SyncOperation[] {
  const operations: SyncOperation[] = [];

  // Upload files that are new or whose checksum has changed.
  for (const [filePath, localFile] of Object.entries(localFiles)) {
    if (localFile.type === "directory") continue;
    const remoteFile = remoteFiles[filePath];
    if (!remoteFile || (remoteFile.type === "file" && remoteFile.checksum !== localFile.checksum)) {
      operations.push({ type: "upload", filePath });
    }
  }

  // Optionally delete remote files/directories no longer present locally.
  if (shouldDelete) {
    for (const [filePath, remoteFile] of Object.entries(remoteFiles)) {
      if (!localFiles[filePath]) {
        operations.push({
          type: remoteFile.type === "directory" ? "delete_directory" : "delete",
          filePath,
        });
      }
    }
  }

  return operations;
}

export async function scanLocalFiles(baseDir: string): Promise<Record<string, LocalEntry>> {
  const files = await fs.readdir(baseDir, { recursive: true });
  const localFiles: Record<string, LocalEntry> = {};
  await Promise.all(
    (files as string[]).map(async (file: string) => {
      const filePath = path.join(baseDir, String(file));
      try {
        const stats = await fs.stat(filePath);
        if (stats.isDirectory()) {
          localFiles[String(file)] = { type: "directory" };
          return;
        }
        const data = await fs.readFile(filePath);
        localFiles[String(file)] = {
          type: "file",
          checksum: createHash("sha256").update(data).digest("hex").toUpperCase(),
          filePath,
        };
      } catch (err) {
        throw new Error(
          `Failed to read file: ${filePath} — ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),
  );
  return localFiles;
}

/**
 * Strip the "/{name}/{remoteDir}/" prefix from Bunny paths so the keys in the
 * returned map are relative paths that can be compared directly to local ones.
 */
export function normalizeRemoteFiles(
  files: BunnyStorageSDK.StorageFile[],
  name: string,
  remoteDir: string,
): Record<string, LocalEntry> {
  const result: Record<string, LocalEntry> = {};
  const normalizedRemoteDir =
    remoteDir === "/" ? "" : remoteDir.replace(/^\/+/, "").replace(/\/+$/, "");
  const stripPrefix = normalizedRemoteDir
    ? `/${name}/${normalizedRemoteDir}/`
    : `/${name}/`;

  for (const file of files) {
    const fullPath = path.posix.join(file.path, file.objectName);
    const filePath = fullPath.startsWith(stripPrefix)
      ? fullPath.slice(stripPrefix.length)
      : fullPath.replace(`/${name}/`, "");

    result[filePath] = file.isDirectory
      ? { type: "directory" }
      : { type: "file", checksum: file.checksum ?? "", filePath };
  }
  return result;
}

export async function fetchAllRemoteFiles(
  storageZone: BunnyStorageSDK.StorageZone,
  prefix = "/",
): Promise<BunnyStorageSDK.StorageFile[]> {
  const files = await BunnyStorageSDK.file.list(storageZone, prefix);
  const subFiles = await Promise.all(
    files
      .filter((f) => f.isDirectory)
      .map((f) => fetchAllRemoteFiles(storageZone, path.posix.join(prefix, f.objectName))),
  );
  return [...files, ...subFiles.flat()];
}
