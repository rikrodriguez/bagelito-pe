# Entrada → categoría → tipo de pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Construir el primer tramo funcional del customer journey: entrada realista → acercamiento a vitrina → Packs/Combos/Schmears → Packs → Grandes/Minis.

**Architecture:** Crear un componente cliente enfocado solo en este tramo, usando una máquina de estados pequeña y dos fondos fotorealistas aprobados (entrada e interior). El checkout y el StoreWalkthrough anterior quedan intactos; la home de esta rama apunta al nuevo componente para el preview.

**Tech Stack:** Next.js 15, React/TypeScript, CSS, next/image, pruebas Node existentes.

**Spec:** docs/superpowers/specs/2026-10-27-entry-category-pack-size-design.md

## Global Constraints
- No tocar pagos, pedidos, Supabase, CRM ni credenciales.
- Solo preview; no producción.
- Packs/Combos/Schmears son las únicas categorías principales.
- Combos no se representan como sandwich + bebida.
- La rama Packs termina en Grandes / Minis.
- Grandes muestran 6/12; Minis muestran 6/12/24.
- Mantener movimiento reducido y navegación atrás.

## Review Focus
- Volver desde Grandes/Minis debe conservar la escena interior.
- Mobile 320/390 no debe cortar cards ni barra de progreso.
- La imagen de tienda debe cubrir viewport sin deformarse.
- Combos/Schmears visibles no deben iniciar configuraciones fuera de alcance.
- Ninguna acción de este bloque puede crear pedidos o hacer POST a pagos.

### Task 1: Contrato de navegación del primer tramo
**Files**
- Create: tests/entry-category-flow.test.mjs
- Create: src/lib/store-entry-flow.ts
- Test: tests/entry-category-flow.test.mjs

- [ ] Escribir tests que fallen para estados entry, categories y pack-size, categorías exactas y opciones Grandes/Minis.
- [ ] Verificar RED.
- [ ] Implementar helpers puros de estado/copy.
- [ ] Verificar GREEN.

### Task 2: Escena realista e interacción
**Files**
- Create: src/components/StoreEntryFlow.tsx
- Create: src/app/store-entry-flow.css
- Create: public/images/bagelito-entry-flow.webp
- Create: public/images/bagelito-interior-flow.webp
- Modify: src/app/page.tsx

- [ ] Extender tests para exigir que la home use StoreEntryFlow y no StoreWalkthrough.
- [ ] Verificar RED.
- [ ] Implementar entrada fullscreen, transición, elección de categoría y Packs → Grandes/Minis.
- [ ] Mantener Combos y Schmears visibles sin configuración posterior.
- [ ] Verificar GREEN.

### Task 3: Responsive y preview
**Files**
- Modify: tests/entry-category-flow.test.mjs
- Modify: src/app/store-entry-flow.css
- Create: docs/entry-category-flow-qa-20261027.md

- [ ] Añadir contrato para reduced-motion, barra de progreso y ausencia de APIs financieras.
- [ ] Verificar RED/GREEN.
- [ ] Correr suite completa, lint y build.
- [ ] Probar 1440, 390 y 320 en navegador.
- [ ] Crear preview manual en Vercel con merchant-review-only y no producción.
