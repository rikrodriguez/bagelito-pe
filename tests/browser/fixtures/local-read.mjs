// Playwright does not route every hop of an HTTP redirect chain. Fetch only
// the already-validated local request, then reject redirects before the browser
// or APIRequestContext can follow them outside the fixture origin.
export async function fulfillLocalRead(route) {
  const response = await route.fetch({ maxRedirects: 0 });
  if (response.status() >= 300 && response.status() < 400) {
    const error = new Error('HTTP redirects are blocked in local browser fixtures.');
    error.code = 'LOCAL_REDIRECT_REJECTED';
    // A concurrent navigation/close can cancel the paused route. Preserve the
    // policy classification even when there is no request left to abort.
    try { await route.abort('blockedbyclient'); } catch {}
    throw error;
  }
  await route.fulfill({ response });
}
