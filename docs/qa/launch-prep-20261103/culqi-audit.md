# Culqi: límite técnico del candidato auditado

Auditoría de fuente sobre PR47 `bbd149019b249edf4243fb4776c6acff944775be`.
No se consultaron bases, proveedor, llaves, configuración remota ni producción.
No se encontró otro defecto financiero demostrado que justifique cambiar la
máquina de estados durante este lote de preparación.

- `src/server/payment-config.server.ts:167–196`: el carril completo `guided-v1`
  exige sandbox y entorno no productivo. El guard se repite al preparar/cobrar.
  No se puede lanzar el catálogo actual en live cambiando solo variables.
- `/` y `/playable` siguen montando revisión; `/sandbox-checkout` es de pruebas;
  `/consulta` solo prepara un enlace de contacto bajo flag/origen exactos.
- La persistencia completa propuesta y su puente sandbox ya existen. No afirmar
  que faltan en el candidato por documentos históricos del 2 de noviembre.
  Falta comprobar instalación y compatibilidad reales de RPC, tablas, triggers,
  permisos, webhook, expiry y capacidad. La política SQL de productos arranca
  apagada y el servicio no puede habilitarla. No reaplicar fixtures a ciegas.
- La cotización considera batch, capacidad y fecha, pero no inventario de pots
  por sabor/gramos. Solo packs grandes 6/12 con reglas conocidas, extra120 y pots
  120/180/240 tienen persistencia sandbox prevista. Combo2+1, minis y premium
  mantienen restricciones específicas; no convertir una selección completa en
  un pedido parcial para hacerla cobrable.
- `src/routes/api/webhooks/culqi.ts:48–51`: una señal de refund verificada recibe
  501/revisión, no sincronización automática de estado. Hace falta transición
  implementada/verificada o reconciliación y monitorización humana probadas.
- `CulqiBrowserCheckout.tsx:380–396,508–522`: la copia de fallo permite sugerir
  otro checkout. Eso no demuestra liberación inmediata del cupo: el SQL mantiene
  la reserva failed hasta su deadline, y un éxito posterior puede requerir
  reconciliación. No prometer reintento inmediato ni cupo garantizado antes de
  cerrar la aceptación de ese flujo.
- Faltan aceptación real del mismo comercio con tarjeta, 3DS, Yape, webhook HTTP,
  rechazo, expiración, respuesta perdida, duplicados y pago tardío, además de
  sesiones independientes para locks/contención. PGlite y dobles de transporte
  no sustituyen esas pruebas. La aprobación comercial de Culqi ya fue obtenida
  y no se vuelve a solicitar como si faltara.

La revisión independiente ejecutó 63 pruebas existentes de configuración, gates
y status/recibos en aislamiento, todas aprobadas; son cobertura solapada con la
suite Node del principal, no casos nuevos. No abrió el SDK, cobró, envió pedidos
ni cambió código financiero.

Las llaves/runtime actuales y el despliegue efectivamente servido no se
comprobaron aquí. Los inventarios y versiones publicados en documentos antiguos
son evidencia fechada, no prueba de ausencia o estado actual.
