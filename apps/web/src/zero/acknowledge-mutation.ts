type Outcome = { readonly type: string };

// Do not swallow errors, gate writes or manage editor state here: callers own
// those policies. Preserve the original typed error for feature-specific UI.
export async function acknowledgeMutation<
  C extends Outcome,
  S extends Outcome,
>(mutation: {
  client: PromiseLike<C>;
  server: PromiseLike<S>;
}): Promise<C | S> {
  const client = await mutation.client;
  return client.type === "error" ? client : await mutation.server;
}
