// Local fixture only. No application implementation or auth is replaced.
import { appendFileSync } from "node:fs";
const origin = process.env.OPERATOR_FIXTURE_ORIGIN;
const audit = process.env.OPERATOR_FIXTURE_AUDIT;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin ?? "")
  || !audit?.startsWith("/tmp/bagelito-operator-http-")) throw new Error("Invalid local operator fixture");
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.origin !== origin) {
    appendFileSync(audit, JSON.stringify({ kind: "external_transport_blocked" }) + "\n", { mode: 0o600 });
    throw new Error("External transport is disabled in the local operator fixture");
  }
  return nativeFetch(input, init);
};
