
---


# SIWE Demo (implementación manual)

Este README.md contiene detalles técnicos que van a encontrar en el código.

**SIWE Demo** es una demo básica de autenticación de usuarios con **Metamask**.

Técnicamente hablando, esta demo se trata de: 

Autenticación **Sign-In With Ethereum (EIP-4361)** con **frontend React** y **backend Express**.  
El front arma y firma el mensaje SIWE **a mano** (sin SDKs de SIWE en el front); el backend verifica con la librería `siwe`.  
El backend incluye **morgan** para logging HTTP.

---

## ¿Qué es `window.ethereum`?

- Es un **objeto global** que inyecta la extensión **MetaMask** (o cualquier wallet compatible con el estándar **EIP-1193**) en el navegador.
- Solo existe si el usuario tiene instalada y activa una wallet.
- Se puede chequear así:

```js
if (typeof window.ethereum !== "undefined") {
  console.log("Wallet detectada");
}
````

---

## ¿Qué es `.request`?

* Es el método genérico definido en la especificación **EIP-1193: Ethereum Provider API**.
* Recibe un objeto con:

  * `method`: el nombre del procedimiento RPC (ej: `"eth_requestAccounts"`, `"wallet_switchEthereumChain"`, `"personal_sign"`, etc.).
  * `params`: un array de parámetros para ese método.

**Ejemplo:**

```js
const accounts = await window.ethereum.request({
  method: "eth_requestAccounts",
});
// → ["0x1234abcd..."]
```

> `window.ethereum.request` **no** tiene un listado fijo de métodos como una librería cerrada; es un **puente genérico** hacia métodos RPC de Ethereum.
> Los más comunes los define **EIP-1193 (Provider API)** y algunos otros los extiende **MetaMask**.

---

## Métodos RPC principales de `window.ethereum.request`

| Método                 | Qué hace                                                   | Ejemplo                                                                                 |
| ---------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `eth_requestAccounts`  | Pide al usuario conectar su wallet y devuelve las cuentas. | `await ethereum.request({ method: "eth_requestAccounts" })`                             |
| `eth_accounts`         | Devuelve las cuentas ya conectadas (no abre popup).        | `await ethereum.request({ method: "eth_accounts" })`                                    |
| `eth_chainId`          | Devuelve el chainId actual de la red en **hex**.           | `await ethereum.request({ method: "eth_chainId" })`                                     |
| `eth_getBalance`       | Devuelve el balance (en wei) de una dirección.             | `await ethereum.request({ method: "eth_getBalance", params: [addr, "latest"] })`        |
| `eth_call`             | Llama a funciones de contrato (**read-only**).             | `await ethereum.request({ method: "eth_call", params: [tx, "latest"] })`                |
| `eth_sendTransaction`  | Envía una tx firmada por el usuario (**consume gas**).     | `await ethereum.request({ method: "eth_sendTransaction", params: [tx] })`               |
| `personal_sign`        | Firma arbitraria de datos (texto/hex).                     | `await ethereum.request({ method: "personal_sign", params: [msg, addr] })`              |
| `eth_signTypedData_v4` | Firma mensajes estructurados (**EIP-712**).                | `await ethereum.request({ method: "eth_signTypedData_v4", params: [addr, typedData] })` |

### Métodos de gestión de red (MetaMask / EIP-3085 & 3326)

| Método                       | Qué hace                            | Ejemplo                                                                                                                      |
| ---------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `wallet_switchEthereumChain` | Cambia a una red ya agregada.       | `await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x89" }] })`                            |
| `wallet_addEthereumChain`    | Agrega una red nueva a la wallet.   | `await ethereum.request({ method: "wallet_addEthereumChain", params: [cfg] })`                                               |
| `wallet_watchAsset`          | Agrega un token ERC-20/721 a la UI. | `await ethereum.request({ method: "wallet_watchAsset", params: { type: "ERC20", options: { address, symbol, decimals } } })` |

---

## Eventos útiles (se escuchan con `ethereum.on`)

* `accountsChanged` → se dispara cuando el usuario cambia de cuenta.
* `chainChanged` → se dispara cuando el usuario cambia de red.
* `disconnect` → se dispara si la wallet se desconecta.

**Ejemplo:**

```js
ethereum.on("accountsChanged", (accounts) => {
  console.log("Nueva cuenta:", accounts[0]);
});
```

---

## 🔹 Qué significa EIP

**EIP = Ethereum Improvement Proposal**
👉 En español: **Propuesta de Mejora de Ethereum**.

Es el mecanismo formal que usa la comunidad de Ethereum para:

* Proponer nuevas funcionalidades.
* Documentar estándares técnicos.
* Explicar cambios o mejoras a la red o al ecosistema.

Podés pensarlo como un **“proyecto de ley técnica”**: alguien lo escribe, se discute públicamente y, si hay consenso, se implementa.

### Tipos de EIP

1. **Core EIP**

   * Afectan directamente al protocolo Ethereum (ej.: reglas de consenso, cambios de gas, hard forks).
   * Ejemplo: **EIP-1559** (el cambio de las fees en Londres).

2. **Networking EIP**

   * Cambios en la capa de red (p2p).

3. **Interface EIP**

   * Definen cómo los contratos, wallets o librerías deben comunicarse.
   * Ejemplo: **EIP-20** (ERC-20, el estándar de tokens fungibles).

4. **ERC (Ethereum Request for Comments)**

   * Subcategoría de EIPs, enfocada en **estándares de aplicaciones**.
   * Ejemplo:

     * **EIP-20 = ERC-20** (tokens fungibles).
     * **EIP-721 = ERC-721** (NFTs).
     * **EIP-1155** (tokens semi-fungibles).

### Ejemplos en este proyecto

* **EIP-55** → Checksum de direcciones (usamos `getAddress` de ethers).
* **EIP-1193** → Provider estándar (`window.ethereum.request`).
* **EIP-191 / 4361** → Firmas de mensajes. 4361 define SIWE.
* **EIP-20 / 721** → ERCs para tokens fungibles y NFTs.

### Proceso de un EIP

1. Alguien propone una idea y escribe el borrador en formato EIP.
2. Se publica en el repositorio oficial de [EIPs en GitHub](https://github.com/ethereum/EIPs).
3. Se discute en la comunidad (desarrolladores, clientes, investigadores).
4. Si hay consenso → pasa a “Final” y se implementa.

✅ **En resumen**:
Los **EIP son las reglas y estándares oficiales de Ethereum**.
Algunos cambian la red en sí (core), otros definen cómo deben comportarse los contratos o wallets (ERCs, interfaces).

---

## EIPs relevantes en este proyecto

* **EIP-1193**: Proveedor Ethereum en el navegador (`window.ethereum.request`).
* **EIP-4361 (SIWE)**: Formato del mensaje “Sign-In With Ethereum”.
* **EIP-191**: Firmas personales (usado por `personal_sign`).
* **EIP-55**: Direcciones con checksum (usamos `getAddress` de `ethers`).

---

## Flujo SIWE (resumen)

1. **Front** pide `nonce` al backend (`/auth/nonce`) → el server lo guarda en **cookie HttpOnly**.
2. **Front** arma el mensaje **EIP-4361** con `domain`, `uri`, `chainId`, `nonce`, `issuedAt`.
3. **Usuario** firma con la wallet (`personal_sign`).
4. **Front** manda `{ message, signature }` a `/auth/siwe`.
5. **Backend** verifica firma + dominio + nonce y responde `{ ok, address, chainId }`.
6. **Front** muestra la dirección (ej.: `Usuario: 0x...`) y habilita acciones autenticadas.
7. **Logout**: `POST /auth/logout` limpia cookies HttpOnly (este backend usa **morgan** para logs).

---

## Instalación y ejecución

> Requisitos: Node.js 18+ y npm.

### 1) Clonar e instalar

```bash
git clone https://github.com/JoseValperga/ProyectoX.git
cd proyectox
```

#### Backend

```bash
cd backend
npm install
```

#### Frontend

```bash
cd frontend
npm install
```

### 2) Variables de entorno

#### Backend (`packages/backend/.env` – opcional en este mínimo)

```
PORT=3001
```

#### Frontend (`packages/frontend/.env`)

```
VITE_BACKEND_URL=http://localhost:3001
VITE_CHAIN_ID=80002
```

### 3) Ejecutar en desarrollo

#### Backend (con **morgan** activo):

```bash
cd backend
npm run dev
```

#### Frontend:

```bash
cd frontend
npm run dev
```

---

## Endpoints del backend

* `GET /ping`
* `GET /auth/nonce`
* `POST /auth/siwe`
* `POST /auth/logout`

---



