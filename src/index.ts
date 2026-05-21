import * as core from "@actions/core";
import * as BunnyStorageSDK from "@bunny.net/storage-sdk";
import { fetchAllRemoteFiles, normalizeRemoteFiles, buildSyncPlan, scanLocalFiles, executeSyncPlan } from "./operations";

try {
  const name = core.getInput("storage_zone_name", { required: true });
  const key = core.getInput("storage_access_key", { required: true });
  const baseDir = core.getInput("local_directory", { required: true });
  const remoteDir = core.getInput("remote_directory") || "/";
  const shouldDelete = core.getInput("delete") === "true";
  const regionInput = core.getInput("region");
  const region = (regionInput ||
    BunnyStorageSDK.regions.StorageRegion.Falkenstein) as BunnyStorageSDK.regions.StorageRegion;
  const dryRun = core.getInput("dry_run") === "true";

  const storageZone = BunnyStorageSDK.zone.connect_with_accesskey(region, name, key);

  core.info(`Listing remote files in "${remoteDir}"...`);
  const remoteFilesList = await fetchAllRemoteFiles(storageZone, remoteDir);
  const remoteFiles = normalizeRemoteFiles(remoteFilesList, name, remoteDir);

  core.info(`Scanning local files in "${baseDir}"...`);
  const localFiles = await scanLocalFiles(baseDir);

  const syncPlan = buildSyncPlan(remoteFiles, localFiles, shouldDelete);
  core.info(`Sync plan: ${syncPlan.length} operation(s).`);

  if (!dryRun) {
    await executeSyncPlan(baseDir, remoteDir, syncPlan, storageZone);
  } else {
    core.info("Dry run enabled — no changes will be made. Planned operations:");
    syncPlan.forEach((op) => {
      core.info(`${op.type}: ${op.filePath}`);
    });
  }

  const uploadCount = syncPlan.filter((o) => o.type === "upload").length;
  const deleteCount = syncPlan.filter((o) => o.type !== "upload").length;
  const syncResult = `Uploaded: ${uploadCount}, Deleted: ${deleteCount}`;
  core.setOutput("sync_result", syncResult);
  core.info(`Sync complete — ${syncResult}`);
} catch (error) {
  core.setFailed(error instanceof Error ? error.message : String(error));
}
