Aplicación del intento parcial: `b9034136ca9c8f3f60fb7176e72b93afe8d002e1`, snapshot inmutable loopback 3202.

**INTERRUMPIDO: exit 130 mediante SIGINT solicitado por revisión CSS.** Se conservaron seis escenas de escritorio y cero fallos registrados; la escena activa era 07-schmears. Móvil no se ejecutó. Esto no es un PASS de 32 escenas ni un FAIL de navegador del contrato móvil.

La revisión detectó que la regla responsive daba fondo transparente a las etiquetas mientras el assert original exigía placas claras. Se detuvo el intento antes de móvil, se corrigió únicamente ese color y la corrida completa posterior de `a1fce72` pasó 32/32.

[Resultado parcial original](results.json), [log](stdout.log) y [metadata con hashes y motivo de interrupción](artifact-metadata.json). El snapshot del intento parcial no cambió durante su ejecución.
