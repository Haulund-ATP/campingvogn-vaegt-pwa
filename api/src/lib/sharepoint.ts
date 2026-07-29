import { graphFetch, type GraphConfig } from "./graphClient.js";

export interface SharePointListConfig extends GraphConfig {
  siteId: string;
}

export interface SharePointItem<TFields> {
  id: string;
  fields: TFields;
}

function fieldsUrl(siteId: string, listId: string, itemId?: string): string {
  const base = `/sites/${siteId}/lists/${listId}/items`;
  return itemId ? `${base}/${itemId}/fields` : base;
}

export async function createListItem<TFields>(
  config: SharePointListConfig,
  listId: string,
  fields: TFields
): Promise<SharePointItem<TFields>> {
  const response = await graphFetch(config, `/sites/${config.siteId}/lists/${listId}/items`, {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
  const json = (await response.json()) as { id: string; fields: TFields };
  return { id: json.id, fields: json.fields };
}

export async function updateListItem<TFields>(
  config: SharePointListConfig,
  listId: string,
  itemId: string,
  fields: Partial<TFields>
): Promise<void> {
  await graphFetch(config, fieldsUrl(config.siteId, listId, itemId), {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
}

export async function getListItemById<TFields>(
  config: SharePointListConfig,
  listId: string,
  itemId: string
): Promise<SharePointItem<TFields> | null> {
  const response = await graphFetch(
    config,
    `/sites/${config.siteId}/lists/${listId}/items/${itemId}?expand=fields`
  );
  if (response.status === 404) return null;
  const json = (await response.json()) as { id: string; fields: TFields };
  return { id: json.id, fields: json.fields };
}

export interface QueryOptions {
  filter?: string;
  orderby?: string;
  top?: number;
  maxPages?: number;
}

export async function queryListItems<TFields>(
  config: SharePointListConfig,
  listId: string,
  options: QueryOptions = {}
): Promise<SharePointItem<TFields>[]> {
  const params = new URLSearchParams();
  params.set("expand", "fields");
  if (options.filter) params.set("filter", options.filter);
  if (options.orderby) params.set("orderby", options.orderby);
  params.set("top", String(options.top ?? 200));

  let url = `/sites/${config.siteId}/lists/${listId}/items?${params.toString()}`;
  const results: SharePointItem<TFields>[] = [];
  const maxPages = options.maxPages ?? 25;

  for (let page = 0; page < maxPages; page++) {
    const response = await graphFetch(config, url, {
      headers: { prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" },
    });
    const json = (await response.json()) as {
      value: Array<{ id: string; fields: TFields }>;
      "@odata.nextLink"?: string;
    };
    results.push(...json.value.map((v) => ({ id: v.id, fields: v.fields })));

    if (!json["@odata.nextLink"]) break;
    url = json["@odata.nextLink"];
  }

  return results;
}

export async function findSingleItem<TFields>(
  config: SharePointListConfig,
  listId: string,
  filter: string
): Promise<SharePointItem<TFields> | null> {
  const items = await queryListItems<TFields>(config, listId, { filter, top: 1 });
  return items[0] ?? null;
}
