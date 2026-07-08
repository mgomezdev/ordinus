async function themisPost(url: string, body: unknown): Promise<unknown> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Themis ${resp.status}: POST ${url}`);
  return resp.json();
}

/** Upload an STL buffer to the Themis library. Returns the file id (new or existing via dedup). */
export async function uploadStlToThemis(
  themisUrl: string,
  bytes: Buffer,
  filename: string,
  folder: string,
): Promise<number> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }), filename);
  form.append('folder', folder);
  const resp = await fetch(`${themisUrl}/api/v1/files/upload`, { method: 'POST', body: form });
  if (!resp.ok) throw new Error(`Themis ${resp.status}: upload ${filename}`);
  const data = await resp.json() as { id: number };
  return data.id;
}

/** Create a Themis project. Returns the project id. */
export async function createThemisProject(
  themisUrl: string,
  name: string,
  notes: string,
  sourceUser?: string,
  sourceLayoutId?: number,
): Promise<number> {
  const data = await themisPost(`${themisUrl}/api/v1/projects`, {
    name,
    notes,
    ...(sourceUser !== undefined && {
      source_app: 'ordinus',
      source_user: sourceUser,
      source_layout_id: sourceLayoutId,
    }),
  }) as { id: number };
  return data.id;
}

/** Add an item to a Themis project. */
export async function addThemisProjectItem(
  themisUrl: string,
  projectId: number,
  fileId: number,
  quantity: number,
): Promise<void> {
  await themisPost(`${themisUrl}/api/v1/projects/${projectId}/items`, {
    file_id: fileId,
    quantity,
    filament_profile_uuid: '',
    color_hex: '#FFFFFF',
  });
}
