// Browser financial records only; identity/session tokens never belong here.
// No fallback or import from the existing unscoped workspace is permitted.
export function scopedWorkspaceStorage(storage: Pick<Storage,"getItem"|"setItem"|"removeItem">, namespace: string) {
  if (!/^vtv-web-workspace-[a-f0-9]{64}:$/.test(namespace)) throw Error("Verified workspace namespace required.");
  return {getItem: (key: string) => storage.getItem(namespace + key), setItem: (key: string, value: string) => storage.setItem(namespace + key, value), removeItem: (key: string) => storage.removeItem(namespace + key)};
}
