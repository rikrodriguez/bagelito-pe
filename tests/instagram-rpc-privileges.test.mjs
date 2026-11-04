import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql=await readFile(new URL("../supabase/secure-instagram-rpc-privileges.sql",import.meta.url),"utf8");
for(const signature of [
 "get_instagram_customer_memory(uuid, uuid)",
 "resolve_instagram_sales_handoff(uuid, text, text)",
 "sync_instagram_internal_order_state(uuid)"
]){
 test(signature+" denies public user roles and preserves service role",()=>{
   const lines=sql.split("\n").map(s=>s.trim()).join(" ");
   assert.ok(lines.includes("REVOKE ALL ON FUNCTION public."+signature));
   assert.match(lines,/FROM PUBLIC, anon, authenticated/i);
   assert.ok(lines.includes("GRANT EXECUTE ON FUNCTION public."+signature+" TO service_role"));
 });
}
