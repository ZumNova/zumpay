

# 🪙 Zumpay Wallet  
**Billetera cripto no‑custodial para BTC, ETH y redes EVM**

Zumpay Wallet es una aplicación web moderna, segura y completamente **no‑custodial**, diseñada para gestionar activos digitales en múltiples redes. Combina una experiencia simple para usuarios finales con una arquitectura sólida para desarrolladores.

---

## 📌 Tabla de contenidos
1. [Descripción general](#-descripción-general)  
2. [Características principales](#-características-principales)  
3. [Arquitectura y tecnologías](#-arquitectura-y-tecnologías)  
4. [Instalación y configuración](#-instalación-y-configuración)  
5. [Flujo funcional](#-flujo-funcional)  
6. [Seguridad](#-seguridad)  
7. [Roadmap](#-roadmap)  
8. [Contribuciones](#-contribuciones)  
9. [Licencia](#-licencia)  
10. [Demo](#-demo)

---

## 🧩 Descripción general

Zumpay Wallet permite a cualquier usuario:

- Crear o importar una billetera cripto.
- Gestionar activos en **Ethereum, Polygon, Arbitrum, Optimism, Base** y **Bitcoin (Bech32)**.
- Enviar, recibir y visualizar balances en tiempo real.
- Comprar **ZUM** directamente desde MetaMask a precio fijo.
- Agregar tokens personalizados ERC‑20.
- Desbloquear funciones premium mediante un pago único en ZUM.

Todo esto sin servidores custodios: **la seed nunca abandona el dispositivo del usuario**.

---

## 🚀 Características principales

### 🔐 No‑custodial  
La frase secreta se genera localmente y se almacena cifrada en el navegador. No se envía a ningún servidor.

### 🌐 Multi‑red  
Compatibilidad con:
- Ethereum  
- Polygon  
- Arbitrum  
- Optimism  
- Base  
- Bitcoin (Bech32)

### 🪙 Compra de ZUM  
Integración con MetaMask para comprar ZUM en Polygon usando USDC.

### 💸 Envío y recepción  
- Envío de tokens EVM (ERC‑20, POL, ZUM).  
- Envío de BTC nativo.  
- Recepción mediante QR o dirección.

### 🧩 Tokens personalizados  
Agregar tokens ERC‑20 mediante dirección de contrato.

### ⭐ Modo Premium  
Desbloqueo de funciones avanzadas mediante pago único de 10 ZUM.

---

## 🏗️ Arquitectura y tecnologías

Zumpay Wallet está construida sobre un stack moderno y escalable:

### **Frontend**
- **Next.js** (App Router)
- **React + TypeScript**
- **TailwindCSS** para UI
- **Context API / Hooks** para manejo de estado

### **Blockchain**
- **Ethers.js** para redes EVM  
- **BitcoinJS / bip39 / bip32** para BTC  
- **MetaMask** como proveedor Web3  
- **RPCs públicos** para lectura de blockchain

### **Almacenamiento**
- **LocalStorage / IndexedDB**  
- Seed cifrada con AES

### **Integraciones**
- API de precios  
- RPCs de Polygon, Ethereum, Base, Arbitrum, Optimism  
- Contrato inteligente de ZUM (Polygon)

---

## 📦 Instalación y configuración

### 1. Clonar el repositorio
```bash
git clone https://github.com/tu-usuario/zumpay-wallet.git
cd zumpay-wallet
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Variables de entorno
Crear un archivo `.env.local`:

```
NEXT_PUBLIC_POLYGON_RPC=
NEXT_PUBLIC_ETHEREUM_RPC=
NEXT_PUBLIC_ARBITRUM_RPC=
NEXT_PUBLIC_OPTIMISM_RPC=
NEXT_PUBLIC_BASE_RPC=
NEXT_PUBLIC_ZUM_CONTRACT=
NEXT_PUBLIC_USDC_CONTRACT=
```

### 4. Ejecutar en desarrollo
```bash
npm run dev
```

### 5. Build de producción
```bash
npm run build
npm start
```

---

## 🔄 Flujo funcional

### 1. **Creación/Importación de Wallet**
- Generación de seed BIP‑39.
- Derivación de claves EVM y BTC.
- Cifrado y almacenamiento local.

### 2. **Carga de balances**
- Consulta de balances por RPC.
- Detección de tokens ERC‑20.
- Sincronización de actividad reciente.

### 3. **Envío de activos**
- Construcción de transacción EVM con Ethers.js.
- Construcción de transacción BTC nativa.
- Firma local (no se envía la seed).

### 4. **Compra de ZUM**
- Conexión con MetaMask.
- Aprobación de USDC.
- Ejecución de compra a precio fijo.

---

## 🛡️ Seguridad

- Seed cifrada con AES y almacenada localmente.  
- No se envía información sensible a servidores.  
- Interacción directa con MetaMask para firmas.  
- Validación de direcciones BTC y EVM.  
- Código abierto para auditoría comunitaria.

---

## 🗺️ Roadmap

- ⚡ Integración con Lightning Network  
- 📱 Versión móvil (PWA)  
- 🧠 Autodetección de tokens  
- 🔄 Swap interno entre redes  
- 🛠️ Modo desarrollador para debugging de transacciones  

---

## 🤝 Contribuciones

Las contribuciones son bienvenidas.  
Podés abrir un **issue**, proponer mejoras o enviar un **pull request**.

---

## 📄 Licencia

MIT License.

---

## 🌐 Demo

Disponible en:  
**[https://zumpay.com.ar](https://zumpay.com.ar)**

---


This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
