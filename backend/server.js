// Backend SIWE mínimo con cookie para el nonce
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import { SiweMessage } from "siwe";
import morgan from "morgan";

const app = express();

app.use(morgan("dev"));
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Logger para ver qué llega -> debug del server
app.use((req, _res, next) => {
  console.log("Metodo:", req.method, "URL:", req.url);
  next();
});

// Endpoint de chequeo para ver si el server está respondiendo
app.get("/ping", (_req, res) => res.json({ ok: true }));


/* El siguiente endpoint entrega un “ticket de acceso único” (el nonce) 
que se guarda en una cookie y también se envía al frontend.
Después, cuando el usuario firme el mensaje SIWE 
con su wallet, el backend verificará que:
1.- La firma es válida.
2.- El nonce firmado coincide con el de la cookie.
*/
app.get("/auth/nonce", (req, res) => {
  
  /*
  Genero el nonce->16 bytes aleatorios y los convierto a hex
  Ese valor aleatorio es el nonce (“número único que solo sirve una vez”).
  Sirve para evitar ataques de replay (que alguien reuse una firma vieja).
  Cada login empieza con un nonce nuevo.
  */
  const nonce = crypto.randomBytes(16).toString("hex");

  /*Genero el cookie. Pongo en el navegador una cookie 
    llamada siwe_nonce con el valor del nonce
  */
  res.cookie("siwe_nonce", nonce, {
    httpOnly: true, //no accessible desde JS en el navegador->más seguridad
    sameSite: "lax", //no enviar la cookie en requests cross-site sospechosos
    secure: false, // pewrmite enviar aunque sea HTTP. True si se usa HTTPS
    maxAge: 10 * 60 * 1000, //dura 10 minutos
  });

  return res.json({ nonce });//mando el nonce al front
});

/*
  Verificación SIWE - Verifico la firma que hizo el usuario con su wallet
  Es un POST porque el usuario envía su firma y el mensaje para verificar.
*/
app.post("/auth/siwe", async (req, res) => {
  try {
    const { message, signature } = req.body; //mensaje SIWE y firma a verificar
    const nonceFromCookie = req.cookies.siwe_nonce; //recupero el cookie

    if (!message || !signature || !nonceFromCookie) {
      return res.status(400).json({ ok: false, error: "Faltan datos/nonce" });
    }
    
    /*
    Esto convierte el message (string firmado) en un objeto 
    que la librería siwe puede entender y validar.
    */
    const siweMessage = new SiweMessage(message);
    /* El objeto SiweMessage ahora contiene toda la información del mensaje firmado.
    
        SiweMessage {
          scheme: undefined,
          domain: 'localhost:5173',
          address: '0xAf59f60dAD316BeEDA80e0d7b0B98471c346b696',
          statement: 'Ingresar a Mi Dapp',
          uri: 'http://localhost:5173',
          version: '1',
          nonce: 'f70e363843f38f6b3989d904eba842ad',
          issuedAt: '2025-09-03T14:34:03.101Z',
          expirationTime: undefined,
          notBefore: undefined,
          requestId: undefined,
          chainId: 80002,
          resources: undefined
          }
    */
   
    /* 
      Ahora determinaos el dominio
      Si la request viene del navegador → usamos el header Origin.
      Si viene de Postman (o algo sin Origin) → usamos Host.
      Esto asegura que el dominio del mensaje firmado 
      coincide con el que realmente hace la request.
      Protege contra ataques en los que alguien 
      use mi backend desde otro dominio.
    */
    const domain = req.headers.origin
      ? new URL(req.headers.origin).host
      : req.headers.host;
  
    /* Aquí verifico la firma. Compruebo varias cosas 
      Que la signature corresponde a la address dentro del mensaje.
      Que el nonce del mensaje es el mismo que guardamos en la cookie.
      Que el domain coincide.
    */
    const result = await siweMessage.verify({ signature, domain, nonce: nonceFromCookie });

    /* 
      Algunas versiones devuelven { success: true }; 
      otras tiran un throw (new error) en caso de fallo
      Para eso está el try/catch
    */
    if (result?.success === false) {
      return res.status(401).json({ ok: false, error: "Firma no válida" });
    }

    res.clearCookie("siwe_nonce"); // Elimino la cookie. No puede usarse para otro login
    return res.json({
      ok: true,
      address: siweMessage.address, //es la wallet del usuario
      chainId: siweMessage.chainId, //es la blockchain donde se firmó
    });

  } catch (err) {
    console.error("SIWE verify error:", err);
    return res.status(401).json({ ok: false, error: "Firma no válida o verificación fallida" });
  }
});

app.listen(3001, () => {
  console.log("SIWE backend en http://localhost:3001");
});
