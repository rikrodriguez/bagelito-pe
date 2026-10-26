import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sourceModule } from "../helpers/load-ts.mjs";
import { translations, packCopy } from "../../src/lib/i18n.ts";

function FakeIcon() {return React.createElement("span");}
function FakeLink({href,children,...rest}) {
 return React.createElement("a",{href,...rest},children);
}
const { ReservationSuccessContent } = sourceModule(
 "src/app/reserve/success/ReservationSuccessContent.tsx",{
  "next/link": {__esModule:true,default:FakeLink},
  "lucide-react": {CheckCircle2:FakeIcon,Clock3:FakeIcon,MessageCircle:FakeIcon},
  "@/components/LanguageProvider": {useLanguage:()=>({locale:"es",copy:translations.es})},
  "@/lib/i18n": {packCopy},
  "@/lib/analytics": {trackBagelitoEvent(){}},
  "@/lib/whatsapp": {getWhatsAppHref:()=> "https://fixture.invalid/help"},
 }
);

test("forged payment=paid URL cannot render paid status or spoofed charge amount",()=>{
 const html=renderToStaticMarkup(React.createElement(ReservationSuccessContent,{
  order:"BAG-FORGED-1",pack:"Forged pack",amount:"999999",payment:"paid",
 }));
 assert.doesNotMatch(html,/Pago confirmado|S\/999999|Tu batch está reservado/);
 assert.match(html,/Verificando tu reserva/);
 assert.doesNotMatch(html,/>BAG-FORGED-1</);
});

test("pending query also cannot assert settlement without the backend",()=>{
 const html=renderToStaticMarkup(React.createElement(ReservationSuccessContent,{
  order:"BAG-FORGED-1",packSlug:"6-mixed",amount:"999999",payment:"pending",
 }));
 assert.doesNotMatch(html,/Pago confirmado|S\/999999/);
 assert.match(html,/Verificando pago/);
});
