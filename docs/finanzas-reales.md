# Finanzas reales

El panel de finanzas en `/admin` calcula ventas, costos y utilidad del batch actual.

## Costos editables

En `Finance > Editable real costs` se guardan estos valores por batch:

- `Ingredient / bagel`: costo promedio de ingredientes por bagel producido.
- `Packaging / pack`: bolsa, etiqueta, caja o empaque por pack vendido.
- `Real delivery cost`: costo total real pagado por delivery del batch.
- `Other batch costs`: extras como stickers, merma, comisiones o compras urgentes.

Los costos viven en `public.batches`, no en código, para que cada batch pueda cerrar con números propios.

## Calculos

- `Product revenue`: total cobrado menos delivery cobrado.
- `Ingredient cost`: bagels confirmados por costo de ingrediente por bagel.
- `Packaging`: packs confirmados por costo de empaque por pack.
- `Product gross margin`: product revenue menos ingredientes y empaque.
- `Delivery variance`: delivery cobrado menos delivery real pagado.
- `Net profit`: total cobrado menos ingredientes, empaque, delivery real y otros costos.
- `Margin by pack`: margen por tipo de pack usando solo pedidos confirmados/productivos.

Estados que cuentan como pagados/productivos:

- `payment_confirmed`
- `in_production`
- `ready_for_delivery`
- `delivered`

## Setup Supabase

Si el formulario de costos da error de columna faltante, correr:

```sql
-- supabase/add-batch-financial-costs.sql
```

Despues volver a `/admin`, editar los costos y guardar.
