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
