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

## Propuesta futura: ZumpayPremiumAccess

Para una version mas formal del premium, conviene crear un contrato verificado en Polygon.

Idea de contrato:

- Nombre sugerido: `ZumpayPremiumAccess`.
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

Para uso personal, el flujo actual es suficiente. Para usuarios reales, el contrato premium verificado seria el siguiente paso tecnico.
