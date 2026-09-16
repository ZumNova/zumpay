# Bitacora tecnica - Zumpay Wallet

Fecha: 2026-07-15

## Estado actual

Zumpay quedo desplegada como una wallet web no custodial con soporte EVM, BTC nativo y un modulo Uniswap V3 integrado para gestion personal de posiciones de liquidez.

Dominio productivo:

- `https://zumpay.com.ar`
- `https://www.zumpay.com.ar`

Proyecto Vercel actual:

- `zumpay-clean`

Repositorio:

- `ZumNova/zumpay`

## Stack principal

- Next.js 16 con App Router.
- React client components para la experiencia principal de wallet.
- TypeScript.
- Ethers v6 para EVM, MetaMask, ERC-20 y Uniswap V3.
- bitcoinjs-lib, bip39, bip32 y tiny-secp256k1 para BTC.
- QRCode para direcciones de recepcion.
- Vercel para hosting y dominios.
- Alchemy como proveedor RPC para Ethereum, Polygon y Arbitrum.

## Redes soportadas

- Ethereum.
- Polygon.
- Arbitrum.
- BTC nativo para lectura/envio desde la wallet generada.

## Modulo premium ZUM

El acceso premium se desbloquea con pago en ZUM sobre Polygon.

Configuracion actual:

- Token ZUM: `0xa6d942CFd1662A3FD84bce76fb6c1391ea593CB5`
- Wallet owner/deployer: `0x521125be95c5679539aB07582F55F0040975A047`
- Monto premium: `100 ZUM`
- Flujo actual: MetaMask cambia a Polygon, envia ZUM al owner y luego la app verifica el pago.

La verificacion premium se hace desde `/api/zum/paid`, buscando pagos reales desde la wallet del usuario hacia el owner. Las wallets internas de confianza pueden habilitarse por allowlist mediante variable de entorno.

## Modulo Uniswap V3

La integracion V3 quedo separada del flujo interno de la wallet. Opera con MetaMask y no usa la seed de Zumpay.

Funciones actuales:

- Scanner de pools V3 en Ethereum y Arbitrum.
- Lectura de liquidez, tick, precio, reservas y actividad reciente.
- Perfiles de rango: conservador, moderado y riesgoso.
- Entrada con un token y swap interno.
- Entrada manual con dos tokens.
- Mint de NFT de posicion hacia la wallet MetaMask conectada.
- Importacion manual de NFT existente.
- Lectura de posiciones.
- Estimacion y cobro de fees.
- Retiro de liquidez y collect final.

## Modulo Uniswap V4 Robinhood

Se agrego un scanner V4 read-only para Robinhood, separado de los flujos que firman transacciones.

Funciones actuales:

- Scanner manual por token A, token B, fee, tick spacing y hooks.
- Scanner multi-pool de candidatos predefinidos WETH/USDG, SPCX/USDG, WETH/SPCX y ETH/USDG.
- Lectura de poolId, estado, tick, precio, liquidez, lpFee y protocolFee desde StateView.
- Carga de un candidato escaneado al panel de resultado sin firmar ni mover fondos.
- Manejo aislado de errores por pool para que una pool fallida no corte el barrido completo.

## Variables de entorno

La app usa `.env.local` en desarrollo y variables de Vercel en produccion.

Variables importantes:

- `NEXT_PUBLIC_ETH_RPC_URL`
- `NEXT_PUBLIC_POLYGON_RPC_URL`
- `NEXT_PUBLIC_ARBITRUM_RPC_URL`
- `POLYGON_RPC_URL`
- `ZUM_PREMIUM_ADDRESSES`
- `ETHERSCAN_API_KEY` o `POLYGONSCAN_API_KEY` opcional para mejorar lecturas por explorer.

No se deben commitear claves RPC privadas ni seeds.

## Observacion sobre MetaMask y reputacion

MetaMask puede marcar la interaccion como riesgosa porque el flujo actual usa un token custom y una transferencia directa ERC-20 hacia una wallet owner. Aunque el flujo sea correcto, para una wallet externa puede verse menos formal que interactuar con un contrato verificado.

Factores que pueden mejorar la reputacion:

- Contrato ZUM verificado en Polygonscan.
- Metadata publica del token clara: nombre, simbolo, decimals, logo y links oficiales.
- Dominio productivo estable: `zumpay.com.ar`.
- Textos de UI transparentes sobre red, token, monto y destino.
- Mayor historial on-chain del token y del dominio.

## Contrato premium: ZumpayPremiumAccess

Se agrego un primer contrato auditable para formalizar el acceso premium.

Archivos:

- `contracts/ZumpayPremiumAccess.sol`
- `test/ZumpayPremiumAccess.t.sol`
- `script/DeployZumpayPremiumAccess.s.sol`
- `foundry.toml`

Caracteristicas:

- Recibe pagos en ZUM mediante `transferFrom`.
- Expone una funcion clara `payPremium()`.
- Emite `PremiumPaid(address user, uint256 amount)`.
- Guarda acceso premium en `hasPremium(user)`.
- Evita doble pago del mismo usuario.
- Permite `grantPremium` y `revokePremium` desde owner.
- Permite actualizar `premiumPrice`.
- Usa retiro owner-only de los ZUM acumulados.
- Usa transferencia de ownership en dos pasos.
- Usa guardia simple contra reentrancy.

Validacion local:

```bash
forge test
```

Resultado:

- 4 tests pasados.
- 0 fallos.

Objetivo:

- Reducir la apariencia de transferencia directa a una wallet personal.
- Hacer el flujo premium mas auditable.
- Dejar un contrato verificable en Polygonscan.
- Permitir que la app verifique `PremiumPaid` o `hasPremium`.

Flujo futuro recomendado:

1. Deploy en Polygon con:
   - `ZUM_ADDRESS=0xa6d942CFd1662A3FD84bce76fb6c1391ea593CB5`
   - `PREMIUM_OWNER=0x521125be95c5679539aB07582F55F0040975A047`
   - `PREMIUM_PRICE=100000000000000000000`
2. Verificar contrato en Polygonscan.
3. Actualizar la app para hacer `approve` de 100 ZUM al contrato.
4. Ejecutar `payPremium()`.
5. Verificar `hasPremium(user)` o eventos `PremiumPaid`.

## Propuesta futura: reputacion MetaMask

Para seguir bajando alertas, conviene completar el flujo formal:

- Deploy y verificacion de `ZumpayPremiumAccess` en Polygon.
- Recibe pagos en ZUM mediante `transferFrom`.
- Expone una funcion clara `payPremium()`.
- Emite un evento `PremiumPaid(address user, uint256 amount)`.
- Permite al owner retirar los ZUM acumulados.
- Opcionalmente permite ajustar precio premium.

Ventajas:

- MetaMask muestra una llamada de contrato mas explicita.
- Polygonscan puede mostrar source code verificado.
- La app puede verificar eventos del contrato en lugar de transferencias manuales.
- El flujo se vuelve mas auditable para usuarios externos.
- Reduce la apariencia de transferencia directa a una wallet personal.

Flujo futuro recomendado:

1. Usuario conecta MetaMask en Polygon.
2. Usuario aprueba `100 ZUM` al contrato `ZumpayPremiumAccess`.
3. Usuario ejecuta `payPremium()`.
4. El contrato recibe ZUM y emite `PremiumPaid`.
5. La app verifica el evento y desbloquea premium.

Para uso personal, el flujo actual sigue siendo suficiente. Para usuarios reales, el contrato premium verificado es el siguiente paso tecnico.

## Pendientes operativos V3/V4

Fecha: 2026-08-19

- V3: corregir la tarjeta de posiciones para mostrar claramente cuando una posicion esta fuera de rango. El usuario pudo retirar liquidez V3 desde Zumpay, pero la UI no marco el estado fuera de rango con suficiente claridad.
- V4: agregar flujo de salida/retiro de liquidez para posiciones V4. El scanner y el preflight de mint ayudan a evaluar pools, pero todavia falta una accion segura para retirar o ajustar liquidez V4 cuando el precio se mueve y la posicion sale de rango.
- Mantener estas mejoras separadas del commit actual de assets publicos para Polygonscan.

## Propuesta futura: administrador privado de granjas

Decision actual:

- Mantener `zumpay` estable como app publica/premium.
- Crear primero un modulo o repo separado para el administrador privado.
- Conectarlo a Zumpay despues, cuando el flujo este probado.

Motivo:

- La app actual ya funciona bien para wallet, premium, token ZUM y posiciones V3.
- El administrador tiene otro publico: operador/tesorero, no usuario final.
- Conviene evitar mezclar controles internos con la experiencia simple de un amigo o usuario premium.
- Si el administrador falla o cambia mucho, no rompe la app publica.

Arbol de trabajo propuesto:

```text
zumpay
├── app publica
│   ├── wallet simple
│   ├── acceso premium por 100 ZUM
│   ├── token ZUM en Polygon
│   └── modulo V3 para usuarios avanzados
│
└── zumpay-admin (repo o modulo separado)
    ├── panel privado
    │   ├── participantes
    │   ├── aportes fiat/crypto
    │   ├── tesoreria
    │   ├── granjas V3
    │   ├── asignaciones por usuario
    │   └── retiros
    │
    ├── vista simple para amigos
    │   ├── aporte realizado
    │   ├── fecha de entrada
    │   ├── granja asignada
    │   ├── NFT o posicion asociada
    │   ├── estado activo/inactivo
    │   └── valor estimado
    │
    └── integraciones futuras
        ├── lectura on-chain de NFTs V3
        ├── lectura de fees acumuladas
        ├── grant/revoke premium
        ├── Pix / Mercado Pago manual primero
        └── automatizacion parcial con permisos del usuario
```

Primer MVP del administrador:

1. Crear `zumpay-admin` con datos locales o mock.
2. Registrar participantes: nombre, alias, pais, wallet opcional y estado.
3. Registrar aportes: monto fiat, moneda, fecha, medio de pago, conversion a USDC/USDT y notas.
4. Registrar granjas: red, par, riesgo, tokenId NFT, rango, estado y observaciones.
5. Asignar aportes a granjas: quien participa, cuanto capital tiene asignado y en que posicion.
6. Mostrar una vista simple para el amigo: aporte, fecha, granja, estado, valor estimado y solicitud de salida.

Modelo de datos inicial:

```ts
type Participant = {
  id: string;
  name: string;
  country: "AR" | "BR" | "OTHER";
  contactAlias: string;
  wallet?: string;
  status: "active" | "paused";
};

type Contribution = {
  id: string;
  participantId: string;
  fiatAmount: string;
  fiatCurrency: "ARS" | "BRL" | "USD";
  receivedAt: string;
  paymentRail: "pix" | "mercado_pago" | "cash" | "crypto";
  stableAmount: string;
  stableSymbol: "USDC" | "USDT";
  exchangeRate: string;
  status: "received" | "converted" | "allocated" | "returned";
};

type Farm = {
  id: string;
  label: string;
  chain: "polygon" | "arbitrum" | "ethereum";
  pair: string;
  risk: "conservador" | "moderado" | "riesgoso";
  nftIds: string[];
  status: "active" | "out_of_range" | "closed";
  notes: string;
};

type Allocation = {
  id: string;
  contributionId: string;
  farmId: string;
  nftId?: string;
  allocatedStableAmount: string;
  status: "active" | "pending_exit" | "closed";
};

type WithdrawalRequest = {
  id: string;
  participantId: string;
  contributionId?: string;
  requestedAt: string;
  status: "requested" | "processing" | "paid";
  estimatedAmount: string;
  paidAmount?: string;
  paidCurrency?: "ARS" | "BRL" | "USD" | "USDC" | "USDT";
};
```

Reglas de control:

- No prometer rendimiento fijo.
- Mostrar siempre que el valor es estimado y puede variar.
- Separar dinero fiat recibido, stablecoins compradas, NFTs V3 y deuda/participacion del usuario.
- Mantenerlo privado o por invitacion.
- Registrar cada movimiento con fecha, red, tx hash si existe y nota humana.
- Respetar un limite operativo mensual definido por tesoreria.

Fases sugeridas:

1. Administrador local sin blockchain: carga manual y vista clara.
2. Conexion con lectura V3: NFTs, rango, token0/token1, liquidez y fees.
3. Conexion con premium: otorgar o revocar acceso desde el panel.
4. Vista de amigo: solo informacion simple, sin controles delicados.
5. Integracion fiat: primero manual, luego Pix/Mercado Pago si conviene.
6. Automatizacion avanzada: solo con permisos explicitos y limites por usuario.

Conclusion:

El camino mas sano es construir el administrador aparte, validarlo con datos reales pero controlados, y despues decidir si se conecta como modulo privado de Zumpay o queda como repo independiente.

## Nota UX pendiente: mensajes cerca del monto

En la mejora grande de UX/UI, cada operacion de entrada debe mostrar su estado y mensaje justo debajo del campo donde el usuario ingresa el monto. Hoy algunos mensajes aparecen lejos, debajo de las tarjetas de NFTs, y obliga a scrollear para entender que paso.

Objetivo:

- En V3 y V4, mostrar validaciones, split sugerido, permisos, gas y errores al lado del formulario activo.
- Mantener un log general abajo solo como historial, no como feedback principal.
- Reducir saltos visuales: el usuario debe poder operar mirando una sola tarjeta.

## Nota UX: separar Zumpay en vistas humanas

Fecha: 2026-08-27.

Cambio iniciado:

- Convertir la pantalla larga en una navegacion por vistas: Entrada, Premium, Cuentas, Director, Pools V3, Robin V4, Actividad, ZUM y Seguridad.
- Mantener intacta la logica on-chain que ya funciona: swaps internos, lectura V3/V4, gestion de NFTs y rutas de reserva.
- Usar la entrada como puerta humana: logo Zumpay, descargo no-custodial y explicacion del pago premium de 100 ZUM.
- Separar Mis cuentas del Director de reserva para que wallet, rutas externas, V3 y V4 no compitan en una sola tira.

Pendiente de UX:

- Revisar en navegador real el flujo de tabs.
- Ajustar textos por vista si alguna tarjeta sigue quedando demasiado tecnica.
- En una segunda pasada, acercar los mensajes de error/estado al formulario activo.

## Actualizacion operativa: Director DeFi y Base/Aerodrome

Fecha: 2026-09-14.

Estado validado:

- La app ya funciona como director DeFi por vistas: Entrada, Premium, Cuentas, Director, Posiciones, Pools V3, Robin V4, HyperEVM, Base, Actividad, ZUM y Seguridad.
- La logica V3, V4 Robinhood, HyperEVM y Base quedo separada por modulos para reducir confusion visual.
- El panel Base/Aerodrome quedo probado end-to-end con MetaMask:
  - entrada desde USDC en Base;
  - swap USDC -> WETH;
  - swap USDC -> cbBTC;
  - mint de NFT WETH/cbBTC en Aerodrome Slipstream;
  - stake del NFT en gauge para buscar emisiones AERO.
- El flujo Base validado uso el NFT `#6053092`, stakeado correctamente en la gauge WETH/cbBTC.
- La tx de stake validada fue `0x82ef81681223d8d95aa05819b68b7a3a03f075f435fd5609825a4caf3e2b6262`.

Contratos Base/Aerodrome confirmados:

- Pool objetivo WETH/cbBTC: `0x42d4a22cad0f5a49681a5715ce994af73a43b76b`.
- Gauge: `0x61E0B10423a0009C3f83ab4313813d29437d0817`.
- Position manager stakeable para esta pool: `0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53`.
- Factory de la pool stakeable: `0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef`.

Leccion importante:

- WETH/cbBTC con `tickSpacing 10` puede existir en mas de una factory.
- La pool `0xffa192f04b1e5f9f5124fb40a96407564492ed20` tambien es WETH/cbBTC con spacing 10, pero no tiene gauge asignado. Sirve como LP, pero no para estrategia AERO.
- Para farmear AERO, Zumpay debe usar la pool `0x42d4...b76b` y el position manager `0xe1f8...8b53`.
- Stakear y cobrar fees directas no es lo mismo:
  - NFT sin stakear: busca fees WETH/cbBTC.
  - NFT stakeado en gauge: busca emisiones AERO.
  - No asumir que una misma posicion cobra fees directas y AERO al mismo tiempo.

Limpieza UX ya aplicada:

- Se quito del Director el deposito hardcodeado `#5976367`.
- Se quito del panel Base la tarjeta de posicion modelo.
- Se quito la seccion repetida "Ruta humana".
- Se quito la lista de pasos repetida debajo del preview.
- Se quito el link redundante "Abrir Aerodrome para stakear".
- El panel Base queda enfocado en:
  - tesis;
  - monto USDC;
  - slippage/deadline;
  - perfiles de rango;
  - preview;
  - swap a WETH;
  - swap a cbBTC;
  - crear rango WETH/cbBTC;
  - stakear NFT;
  - links tecnicos a gauge, tx, pool y mercado.

Pendientes recomendados:

- Base: agregar lectura de estado del NFT stakeado:
  - si esta stakeado o no;
  - valor estimado;
  - rango;
  - composicion WETH/cbBTC;
  - AERO reclamable;
  - fecha/tx de creacion y stake.
- Base: agregar acciones de gestion:
  - reclamar AERO;
  - unstake;
  - retirar liquidez;
  - decidir si reclamar fees solo cuando el NFT no este stakeado.
- Posiciones: sumar Base/Aerodrome al tablero general junto con V3, V4 Robinhood y HyperEVM.
- UX: ocultar o deshabilitar acciones que ya no aplican cuando el NFT cambia de estado, por ejemplo:
  - ocultar "Stakear" cuando ya esta stakeado;
  - mostrar "Unstake / reclamar AERO";
  - aclarar cuando una posicion busca AERO y no fees directas.
- Mi Balance: conectar los valores de posiciones y balances por red a una vista consolidada.
- Mantener el principio operativo: no prometer rendimiento fijo; mostrar siempre estado, red, contrato, tx hash y accion exacta antes de firmar.

## Actualizacion operativa: ZUM Treasury Vesting

Fecha: 2026-09-16.

Estado:

- Se implemento `ZumpayTreasuryVesting`, un contrato estricto para bloquear la tesoreria ZUM.
- El contrato no tiene owner, no tiene pausa, no tiene retiro anticipado y no tiene rescue path para el ZUM bloqueado.
- La unica salida prevista es `release()`, que envia ZUM liberado directamente a la Safe multisig beneficiaria.
- Allocation objetivo: `881,000 ZUM`.
- Tramos: 10 liberaciones trimestrales.
- Monto por tramo: `88,100 ZUM`.
- Primer unlock: 2027-03-21 00:00:00 UTC.
- Ultimo unlock: 2029-06-21 00:00:00 UTC.
- Beneficiario previsto: Safe multisig `0xF482058a1f3e2cDF819B76b760c433f0C7d9E78e`.

Pendiente antes de comunicarlo como on-chain enforcement:

- Deploy del contrato en Polygon.
- Verificacion del contrato en PolygonScan.
- Transferencia de los `881,000 ZUM` desde la Safe hacia el contrato de vesting.
- Actualizacion final del whitepaper con la direccion real del contrato desplegado.

## Actualizacion operativa: paquete Blockaid / seguridad

Fecha: 2026-09-16.

Se agrego una estructura publica para reevaluacion de riesgo:

- `BLOCKAID_REMEDIATION.md`: documento principal del repo para explicar riesgos, mitigaciones y pasos on-chain pendientes.
- `public/zumpay-security-status.md`: version publica servida desde `https://zumpay.com.ar/zumpay-security-status.md`.
- Whitepaper actualizado con link al security status publico.

Estado on-chain documentado:

- Owner ZUM: Safe `0xF482058a1f3e2cDF819B76b760c433f0C7d9E78e`.
- Supply: `1,000,000 ZUM`.
- Safe treasury: `881,000 ZUM`.
- `paused()`: `false`.
- `maxTxAmount()`: `0`.
- `internalPrice()`: `0`.
- `blocked(Safe)`: `false`.
- `cap()`: `1,000,000 ZUM`.

Riesgo reconocido:

- El token todavia conserva funciones administrativas: pause/unpause, bloqueo de wallets, limite por transaccion, precio interno, transfer/renounce ownership y mint.
- El mint esta limitado por cap porque `totalSupply == cap`, pero la funcion existe.

Ruta profesional recomendada:

1. Desplegar y verificar `ZumpayTreasuryVesting`.
2. Fondear el vesting con `881,000 ZUM` desde la Safe.
3. Confirmar que `releasable()` es cero antes del primer unlock.
4. Confirmar transferencias normales y estado no pausado/no bloqueado.
5. Decidir entre renunciar ownership o transferir ownership a un timelock administrativo.
6. Enviar a Blockaid hashes y links de evidencia, no solo explicaciones.
