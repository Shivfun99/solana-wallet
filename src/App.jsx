// src/App.jsx
import { useEffect, useState } from "react";
import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram } from "@solana/web3.js";
import * as bip39 from "bip39";
import * as ed25519 from "ed25519-hd-key";
import nacl from "tweetnacl";
import bs58 from "bs58";

const SOLANA_RPC = "https://api.devnet.solana.com";
const connection = new Connection(SOLANA_RPC);

const deriveSolanaKeypair = async (mnemonic) => {
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const derived = ed25519.derivePath("m/44'/501'/0'/0'", seed.toString("hex"));
  const keyPair = nacl.sign.keyPair.fromSeed(derived.key);
  const publicKey = new PublicKey(keyPair.publicKey).toBase58();
  return {
    publicKey,
    secretKey: keyPair.secretKey,
  };
};

const encryptMnemonic = async (mnemonic, password) => {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, keyMaterial, { name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(mnemonic));
  return {
    ciphertext: Array.from(new Uint8Array(ciphertext)),
    salt: Array.from(salt),
    iv: Array.from(iv),
  };
};

const decryptMnemonic = async (encrypted, password) => {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const salt = new Uint8Array(encrypted.salt);
  const iv = new Uint8Array(encrypted.iv);
  const data = new Uint8Array(encrypted.ciphertext);
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, keyMaterial, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return dec.decode(decrypted);
};

function App() {
  const [mnemonic, setMnemonic] = useState("");
  const [mnemonicShown, setMnemonicShown] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [balance, setBalance] = useState(null);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [secretKey, setSecretKey] = useState(null);
  const [privateKeyShown, setPrivateKeyShown] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [actionToConfirm, setActionToConfirm] = useState(null);

  useEffect(() => {
    const loadWallet = async () => {
      const encrypted = localStorage.getItem("wallet_encrypted");
      if (encrypted) {
        const password = prompt("🔐 Enter password to unlock wallet:");
        if (!password) return;
        try {
          const parsed = JSON.parse(encrypted);
          const m = await decryptMnemonic(parsed, password);
          setMnemonic(m);
          const { publicKey, secretKey } = await deriveSolanaKeypair(m);
          console.log("🔑 Public Key:", publicKey);
          setPublicKey(publicKey);
          setSecretKey(secretKey);
          if (publicKey) {
            const bal = await connection.getBalance(new PublicKey(publicKey));
            setBalance(bal / LAMPORTS_PER_SOL);
          }
        } catch (e) {
          console.error("❌ Wallet load error:", e);
          alert("❌ Failed to decrypt or load wallet. Wrong password or corrupt storage.");
        }
      }
    };
    loadWallet();
  }, []);

  const confirmWithPassword = (actionName) => {
    setActionToConfirm(actionName);
    setShowPasswordPrompt(true);
  };

  const handlePasswordSubmit = async () => {
    const encrypted = localStorage.getItem("wallet_encrypted");
    if (!encrypted) return;
    try {
      const m = await decryptMnemonic(JSON.parse(encrypted), passwordInput);
      if (actionToConfirm === "mnemonic") {
        setMnemonicShown(true);
        setMnemonic(m);
      } else if (actionToConfirm === "privateKey") {
        const { secretKey } = await deriveSolanaKeypair(m);
        setPrivateKeyShown(bs58.encode(secretKey));
      }
    } catch {
      alert("❌ Wrong password.");
    } finally {
      setShowPasswordPrompt(false);
      setPasswordInput("");
      setActionToConfirm(null);
    }
  };

  const transferSol = async () => {
    try {
      const fromKeypair = nacl.sign.keyPair.fromSecretKey(secretKey);
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(fromKeypair.publicKey),
          toPubkey: new PublicKey(recipient),
          lamports: parseFloat(amount) * LAMPORTS_PER_SOL,
        })
      );
      const sig = await connection.sendTransaction(tx, [{
        publicKey: new PublicKey(fromKeypair.publicKey),
        secretKey: fromKeypair.secretKey
      }], { skipPreflight: false, preflightCommitment: 'confirmed' });
      await connection.confirmTransaction(sig, 'confirmed');
      const bal = await connection.getBalance(new PublicKey(publicKey));
      setBalance(bal / LAMPORTS_PER_SOL);
      alert("✅ Sent successfully!");
    } catch (e) {
      alert("❌ Failed to send SOL");
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white font-sans flex flex-col items-center py-12 px-4">
      <div className="bg-gray-950 shadow-lg rounded-2xl p-8 w-full max-w-xl">
        <h1 className="text-4xl font-extrabold mb-6 text-center text-yellow-400">🪙 Solana Web Wallet</h1>

        {mnemonicShown ? (
          <p className="mb-4"><strong className="text-gray-400">Mnemonic:</strong> {mnemonic}</p>
        ) : (
          <button onClick={() => confirmWithPassword("mnemonic")} className="bg-purple-700 hover:bg-purple-600 text-white px-4 py-2 mb-4 w-full rounded-xl shadow">
            🔐 Reveal Mnemonic
          </button>
        )}

        <p className="mb-2"><strong className="text-gray-400">Public Key:</strong> {publicKey}</p>
        <p className="mb-4"><strong className="text-gray-400">Balance:</strong> {balance !== null ? `${balance} SOL` : "Loading..."}</p>

        {privateKeyShown && (
          <p className="break-all text-red-400 mb-4"><strong className="text-red-300">Private Key (Base58):</strong> {privateKeyShown}</p>
        )}

        <div className="flex gap-4 mb-4">
          <button onClick={() => confirmWithPassword("privateKey")} className="flex-1 bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-xl shadow">
            🔓 Reveal Private Key
          </button>
          <button onClick={transferSol} className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-black px-4 py-2 rounded-xl shadow">
            🚀 Send
          </button>
        </div>

        {showPasswordPrompt && (
          <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex justify-center items-center z-50">
            <div className="bg-gray-900 p-6 rounded-xl shadow-xl w-80">
              <p className="text-white mb-3 font-semibold">🔒 Enter your password:</p>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="p-2 w-full text-black rounded mb-4"
              />
              <div className="flex justify-between">
                <button onClick={handlePasswordSubmit} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-xl">Confirm</button>
                <button onClick={() => setShowPasswordPrompt(false)} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-xl">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
