import { useState } from "react";
import { getAddress } from "ethers";
import "./App.css";

// Configuraciones desde .env (o valores por defecto si no existen)
const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 80002); // 80002=Amoy

/* 
  La siguiente definición de CHAINS tiene un propósito muy concreto: 
  darle al frontend la configuración oficial de cada red para poder 
  pedirle a MetaMask (u otro wallet inyectado) que cambie o agregue la red.
  80002: Blockchain de prueba de Polygon
  137: Blockchain principal de Polygon
  Esta configuración es la que usa MetaMask en su documentación:
  https://docs.metamask.io/guide/rpc-api.html#other-rpc-methods
  Si querés agregar otra red, buscá su configuración en: https://chainlist.org/
  IMPORTANTE: no confundir con la configuración del provider que usa ethers.js
  (que va en el backend y es otra cosa).
*/
const CHAINS = {
  80002: {
    chainId: "0x13882", //Metamask lo requiere en hexadecimal
    chainName: "Polygon Amoy Testnet", //Nombre que le mostrará Metamask al usuario
    nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 }, //Nombre, símbolo y decimales de la moneda nativa.
    rpcUrls: ["https://rpc-amoy.polygon.technology/"], //Endpoints RPC que el wallet usará para hablar con la blockchain.
    blockExplorerUrls: ["https://amoy.polygonscan.com/"], //URL de explorador de bloques, para que MetaMask pueda enlazar
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
  //Guardo la dirección de la wallet del usuario -> ¿quién está logueado?
  const [address, setAddress] = useState("");

  /* 
    Guardo un feedback para el usuario. -> ¿qué pasó?
    Ejemplos: "¡Login OK!", "Firma inválida", "Error en SIWE".
    Se usa para mostrar resultados en pantalla, ya sea éxito o error.
  */
  const [msg, setMsg] = useState("");

  /*
    Bandera para saber si el login está en proceso. -> estoy en proceso o ya terminé
    Mientras sea true, el botón se deshabilita y muestra "Firmando...".
    Evita que el usuario apriete varias veces y rompa la UX.
  */
  const [loading, setLoading] = useState(false);

  /* 
    Esta función se encarga de verificar que el usuario esté en la red esperada.
    Si no lo está, intenta cambiarla (wallet_switchEthereumChain).
    Si el usuario no tiene esa red en su wallet, intenta agregarla (wallet_addEthereumChain).
    Si algo falla, lanza un error.
    Más info FUNDAMENTAL en los comentarios dentro de la función.
  */
  async function ensureChain() {
    const chainConfig = CHAINS[CHAIN_ID]; //Obtengo la configuración de la blockchain
    if (!chainConfig) throw new Error(`CHAIN_ID no soportado: ${CHAIN_ID}`);

    /*
      IMPORTANTE: 
      ¿Que es EIP?
      EIP son las siglas de Ethereum Improvement Proposal (Propuesta de Mejora de Ethereum).
      Es un documento que describe nuevas características o cambios en la red de Ethereum.
      Definen cómo los contratos, wallets o librerías deben comunicarse.

      ¿Qué es window.ethereum, utilizado más adelante?
      Es un objeto global que inyecta la extensión MetaMask 
      (o cualquier wallet compatible con el estándar EIP-1193) 
      en el navegador. Solo existe si el usuario tiene 
      instalada y activa una wallet.
      
      ¿Qué es .request?
      Es el método genérico definido en la especificación EIP-1193: Ethereum Provider API.
      Recibe un objeto con:
      method: el nombre del procedimiento RPC (ej: "eth_requestAccounts", "wallet_switchEthereumChain", "personal_sign", etc.).
      params: un array de parámetros para ese método.
    */

    try {
      /*
        Le pido a MetaMask que cambie la red activa a la que definí (ej: 0x13882 → Polygon Amoy).
        Si el usuario ya tiene esa red en su wallet, listo.
        Si no la tiene → MetaMask devuelve un error.
      */
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainConfig.chainId }],
      });
    } catch (error) {
      if (error.code === 4902) {
        /*
          4902 = “Unrecognized chain” → el usuario no tiene la red guardada en su MetaMask.
          Entonces: wallet_addEthereumChain → abre un popup en MetaMask para que el usuario 
          confirme agregar esa red (usando la info de chainConfig: nombre, moneda, rpc, explorer).
          Luego se vuelve a hacer wallet_switchEthereumChain → ahora sí debería poder cambiarse.
        */
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [chainConfig],
        });

        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainConfig.chainId }],
        });
      } else {
        throw error; //Otro error distinto a "Unrecognized chain"
      }
    }
  }

  /*
    Esta es la función SIWE principal, que se ejecuta al apretar el botón
    Está tomada de https://eips.ethereum.org/EIPS/eip-4361
    Recabo los datos y luego armo el mensaje SIWE
    Finalmente le pido al usuario que firme y envío todo al backend para verificar
  */
  async function siweLogin() {
    try {
      setLoading(true);
      setMsg("");

      if (!window.ethereum) throw new Error("Instalá MetaMask para continuar.");

      /*
        Primer paso: Pido autorización a MetaMask y devuelvo la address
        seleccionada [addrRaw]
        ensureChain() intenta cambiar a la red esperada o agregarla
        si falta
      */
      const [addrRaw] = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      await ensureChain();

      /*
       Segundo paso: normalizo a EIP-55
       Es lo correcto para mostrar/firmar
       */
      const addr = getAddress(addrRaw);

      // Tercer paso: Pido el nonce al backend
      const requestNonce = await fetch(`${BACKEND}/auth/nonce`, {
        credentials: "include", //aquí está la clave para que viaje la cookie
      });
      const { nonce } = await requestNonce.json();
      if (!nonce) throw new Error("No recibí nonce del backend.");

      /* Cuarto paso: Armo el mensaje SIWE de acuerdo a EIP-4361
        Importante: domain debe ser el del FRONT, porque el backend verifica Origin
      */

      //domain y uri ayudan a que otro dominio no pueda hacerse pasar por tu app y reutilizar la firma.
      //va en el mensaje SIWE y luego el backend verifica que el origen coincida.
      const domain = window.location.host; // domain = localhost:5173

      //identifica la Dapp que pide login (se pone en el campo URI: del mensaje).
      const uri = window.location.origin; //uri = http://localhost:5173
      const chainId = CHAIN_ID;

      /*
      //Aqui armamos el mensaje SIWE
      //FUNDAMENTAL: el formato debe ser EXACTAMENTE así lo muestro, 
      //sin indentaciones y con saltos de línea en los lugares indicados.
      //Si no, el backend no podrá verificar la firma. 
      //El mensaje puede tener más campos, pero estos son los mínimos obligatorios.
      //Ver EIP-4361 para más detalles.
      //https://eips.ethereum.org/EIPS/eip-4361
      */
      const message = `${domain} wants you to sign in with your Ethereum account:
${addr}

Ingresar a Mi Dapp

URI: ${uri}
Version: 1
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: ${new Date().toISOString()}`;

      /*
      Quinto paso: pido al  usuario que firme con su billetera
      por lo que mando el mensaje y la address que firmará
      El resultado es la firma en formato hexadecimal
      El método personal_sign es el más compatible, pero hay otros (ver EIP-1474)
      https://eips.ethereum.org/EIPS/eip-1474
    */
      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [message, addr],
      });

      /*
        Sexto paso: Envío el mensaje y la firma al backend para verificar
        IMPORTANTE: la cookie con la sesión viaja porque puse credentials: "include"
        Si el backend verificó todo OK, ya queda logueado y la sesión iniciada
        Si algo falló (firma inválida, nonce usado, etc) recibo el error correspondiente
       */
      const v = await fetch(`${BACKEND}/auth/siwe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message, signature }),
      });
      const data = await v.json();

      if (!data.ok) throw new Error(data.error || "Firma inválida");
      setAddress(data.address); //Queda validada la address del usuario
      setMsg("¡Login OK!");
    } catch (error) {
      setMsg(error?.message || "Error en SIWE");
    } finally {
      setLoading(false);
    }
  }

  /*
    Función de logout:
    - Llama al backend /auth/logout (que debe limpiar cookies HttpOnly y revocar refresh si corresponde).
    - Resetea el estado local (address, msg, loading).
    - IMPORTANTE: credentials: "include" para que viaje la cookie de sesión.
  */
  async function logout() {
    try {
      setLoading(true);
      setMsg("");

      const closeSessionResponse = await fetch(`${BACKEND}/auth/logout`, {
        method: "POST",
        credentials: "include", //para que el server pueda limpiar cookies de este origen
      });

      /*
        Intentamos parsear la respuesta como JSON porque 
        aunque el backend ya devuelva JSON, 
        el objeto Response de fetch no lo parsea solo.
       */
      const data = await closeSessionResponse.json();
      
      if (data?.ok !== true) {
        // Igual reseteamos estado local para reflejar sesión cerrada en el front.
        // Podrías mostrar un aviso en consola o en la UI si querés.
      }
    } catch (error) {
      // En logout no queremos bloquear al usuario si el server falló;
      // aun así limpiamos estado local.
      console.error("Error en logout:", error);
    } finally {
      // Limpieza del estado local (equivale a "deslogueado" en la UI)
      setAddress("");
      setMsg("Sesión cerrada.");
      setLoading(false);
    }
  }

  return (
    <div className="wrap">
      <div className="card">
        <h1>SIWE Demo (sin librerías)</h1>
        <p className="muted">
          Backend: <code>{BACKEND}</code> · ChainId esperado:{" "}
          <code>{CHAIN_ID}</code>
        </p>

        {!address ? (
          <button className="btn" onClick={siweLogin} disabled={loading}>
            {loading ? "Firmando..." : "Iniciar sesión con wallet"}
          </button>
        ) : (
          <>
            <div className="mono">Wallet: {address}</div>

            <div className="btn-row">
              <button className="btn" onClick={logout} disabled={loading}>
                {loading ? "Cerrando..." : "Cerrar sesión"}
              </button>
            </div>

            <div className="ok">{msg}</div>
          </>
        )}

        {msg && !address && <div className="alert">{msg}</div>}
      </div>
    </div>
  );
}
