// Backend SIWE mínimo con cookie para el nonce
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import { SiweMessage } from "siwe";

const app = express();

// CORS: el front (http://localhost:5173) y también Postman (sin Origin)
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Logger para ver qué llega
app.use((req, _res, next) => {
  console.log(req.method, req.url);
  next();
});

// Sanity check
app.get("/ping", (_req, res) => res.json({ ok: true }));

// 1) NONCE
app.get("/auth/nonce", (req, res) => {
  const nonce = crypto.randomBytes(16).toString("hex"); // ✅ solo [0-9a-f]
  //const nonce = crypto.randomBytes(16).toString("base64url");
  res.cookie("siwe_nonce", nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // poné true si usás HTTPS
    maxAge: 10 * 60 * 1000,
  });
  return res.json({ nonce });
});

// 2) Verificación SIWE
app.post("/auth/siwe", async (req, res) => {
  try {
    const { message, signature } = req.body;
    const nonceFromCookie = req.cookies.siwe_nonce;

    if (!message || !signature || !nonceFromCookie) {
      return res.status(400).json({ ok: false, error: "Faltan datos/nonce" });
    }

    const siweMessage = new SiweMessage(message);

    // Si viene del navegador, habrá Origin; en Postman no, usamos Host
    const domain = req.headers.origin
      ? new URL(req.headers.origin).host
      : req.headers.host;

    // siwe v3 sigue aceptando este objeto; si cambia, capturamos el throw
    const result = await siweMessage.verify({ signature, domain, nonce: nonceFromCookie });

    // Algunas versiones devuelven { success: true }; otras throw en inválido
    if (result?.success === false) {
      return res.status(401).json({ ok: false, error: "Firma no válida" });
    }

    res.clearCookie("siwe_nonce"); // evitar replays
    return res.json({
      ok: true,
      address: siweMessage.address,
      chainId: siweMessage.chainId,
    });
  } catch (err) {
    console.error("SIWE verify error:", err);
    return res.status(401).json({ ok: false, error: "Firma no válida o verificación fallida" });
  }
});

app.listen(3001, () => {
  console.log("SIWE backend en http://localhost:3001");
});
