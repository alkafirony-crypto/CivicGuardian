import type { CivicIssue } from "../types";

const DATABASE = "civicguardian-offline";
const STORE = "public-issues";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheIssues(issues: CivicIssue[]) {
  if (!("indexedDB" in window)) return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    store.clear();
    for (const issue of issues.slice(0, 75)) {
      store.put({ ...issue, isUpvotedByMe: false, isVerifiedByMe: false, isNotAccurateByMe: false, isFollowedByMe: false });
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function readCachedIssues(): Promise<CivicIssue[]> {
  if (!("indexedDB" in window)) return [];
  const database = await openDatabase();
  const rows = await new Promise<CivicIssue[]>((resolve, reject) => {
    const request = database.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as CivicIssue[]);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return rows.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export async function clearIssueCache() {
  if (!("indexedDB" in window)) return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE, "readwrite").objectStore(STORE).clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  database.close();
}
