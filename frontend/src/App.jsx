import { useState } from "react";
import { getAddress } from "ethers"; // 👈 checksum

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 80002); // 80002=Amoy

const CHAINS = {
  80002: {
    chainId: "0x13882",
    chainName: "Polygon Amoy Testnet",
    nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
    rpcUrls: ["https://rpc-amoy.polygon.technology/"],
    blockExplorerUrls: ["https://amoy.polygonscan.com/"],
  },
  137: {
    chainId: "0x89",
    chainName: "Polygon Mainnet",
    nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
    rpcUrls: ["https://polygon-rpc.com", "https://rpc.ankr.com/polygon"],
    blockExplorerUrls: ["https://polygonscan.com/"],
  },
};

export default function App() {
  const [address, setAddress] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function ensureChain() {
    const cfg = CHAINS[CHAIN_ID];
    if (!cfg) throw new Error(`CHAIN_ID no soportado: ${CHAIN_ID}`);

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: cfg.chainId }],
      });
    } catch (err) {
      if (err.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [cfg],
        });
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: cfg.chainId }],
        });
      } else {
        throw err;
      }
    }
  }
  /*
  async function siweLogin() {
    try {
      setLoading(true);
      setMsg("");

      if (!window.ethereum) throw new Error("Instalá MetaMask para continuar.");

      // 1) Conectar wallet y asegurar red
      const [addr] = await window.ethereum.request({ method: "eth_requestAccounts" });
      await ensureChain();

      // 2) Pedir nonce al backend (queda además en cookie httpOnly)
      const r = await fetch(`${BACKEND}/auth/nonce`, { credentials: "include" });
      const { nonce } = await r.json();
      if (!nonce) throw new Error("No recibí nonce del backend.");

      // 3) Armar mensaje SIWE (EIP-4361) a mano
      const domain = window.location.host;        // 👈 debe matchear verificación del backend
      const uri = window.location.origin;
      const chainId = CHAIN_ID;
      const message =
`${domain} wants you to sign in with your Ethereum account:
${addr}

Ingresar a Mi Dapp

URI: ${uri}
Version: 1
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: ${new Date().toISOString()}`;

      // 4) Firmar (no consume gas)
      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [message, addr],
      });

      // 5) Enviar al backend para verificar
      const v = await fetch(`${BACKEND}/auth/siwe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message, signature }),
      });
      const data = await v.json();

      if (!data.ok) throw new Error(data.error || "Firma inválida");
      setAddress(data.address);
      setMsg("¡Login OK!");
    } catch (e) {
      setMsg(e?.message || "Error en SIWE");
    } finally {
      setLoading(false);
    }
  }
*/

  async function siweLogin() {
    try {
      setLoading(true);
      setMsg("");

      if (!window.ethereum) throw new Error("Instalá MetaMask para continuar.");

      // 1) Conectar wallet y asegurar red
      const [addrRaw] = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      await ensureChain();

      // ✅ address en checksum (EIP-55)
      const addr = getAddress(addrRaw);

      // 2) Pedir nonce al backend (queda además en cookie httpOnly)
      const r = await fetch(`${BACKEND}/auth/nonce`, {
        credentials: "include",
      });
      const { nonce } = await r.json();
      if (!nonce) throw new Error("No recibí nonce del backend.");

      // 3) Armar mensaje SIWE (EIP-4361) a mano
      //    Importante: domain debe ser el del FRONT, porque el backend verifica Origin
      const domain = window.location.host;
      const uri = window.location.origin;
      const chainId = CHAIN_ID;

      const message = `${domain} wants you to sign in with your Ethereum account:
${addr}

Ingresar a Mi Dapp

URI: ${uri}
Version: 1
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: ${new Date().toISOString()}`;

      // 4) Firmar (no consume gas)
      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [message, addr],
      });

      // 5) Enviar al backend para verificar
      const v = await fetch(`${BACKEND}/auth/siwe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message, signature }),
      });
      const data = await v.json();

      if (!data.ok) throw new Error(data.error || "Firma inválida");
      setAddress(data.address);
      setMsg("¡Login OK!");
    } catch (e) {
      setMsg(e?.message || "Error en SIWE");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <h1>SIWE Demo (sin librerías)</h1>
        <p style={{ opacity: 0.8, marginTop: -6 }}>
          Backend: <code>{BACKEND}</code> · ChainId esperado:{" "}
          <code>{CHAIN_ID}</code>
        </p>

        {!address ? (
          <button style={s.btn} onClick={siweLogin} disabled={loading}>
            {loading ? "Firmando..." : "Iniciar sesión con wallet"}
          </button>
        ) : (
          <>
            <div style={s.mono}>{address}</div>
            <div style={s.ok}>{msg}</div>
          </>
        )}

        {msg && !address && <div style={s.alert}>{msg}</div>}
      </div>
    </div>
  );
}

const s = {
  wrap: {
    minHeight: "100dvh",
    display: "grid",
    placeItems: "center",
    background: "#f6f7fb",
  },
  card: {
    width: 460,
    maxWidth: "92vw",
    background: "#fff",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 10px 24px rgba(0,0,0,.06)",
  },
  btn: {
    width: "100%",
    padding: "12px 16px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    fontWeight: 700,
    background: "#236bed",
    color: "#fff",
  },
  mono: {
    marginTop: 12,
    fontFamily: "ui-monospace, Menlo, Consolas",
    background: "#f0f1f5",
    padding: "8px 10px",
    borderRadius: 8,
    wordBreak: "break-all",
  },
  ok: {
    marginTop: 10,
    padding: "8px 10px",
    background: "#e7f7ee",
    border: "1px solid #c6efd9",
    borderRadius: 8,
    color: "#0a7a3b",
  },
  alert: {
    marginTop: 10,
    padding: "8px 10px",
    background: "#fff7e6",
    border: "1px solid #ffe1b5",
    borderRadius: 8,
    color: "#8a5a00",
  },
};
