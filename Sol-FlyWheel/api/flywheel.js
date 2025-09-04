const web3 = require('@solana/web3.js');
const spl = require('@solana/spl-token');
const bs58 = require('bs58');

const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const SECRET_B58 = process.env.SECRET_KEY_B58;
const TOKEN_MINT_RAW = process.env.TOKEN_MINT;
const SLIPPAGE_BPS = Number(process.env.SLIPPAGE_BPS || 100);
const SOL_BUFFER = Number(process.env.SOL_BUFFER || 0.02);
const CRON_KEY = process.env.CRON_KEY || '';

const SOL_MINT = new web3.PublicKey('So11111111111111111111111111111111111111112');
const INCINERATOR = new web3.PublicKey('1nc1nerator11111111111111111111111111111111');

function normalizeMint(id) { return id && id.endsWith('pump') ? id.slice(0, -4) : id; }
function authorized(req) {
  if (!CRON_KEY) return true;
  const key = (req.headers['x-cron-key'] || (req.query && req.query.key) || '').toString();
  return key === CRON_KEY;
}

async function claimCreatorFees(conn, signer) {
  const resp = await fetch('https://pumpportal.fun/api/trade-local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicKey: signer.publicKey.toBase58(),
      action: 'collectCreatorFee',
      priorityFee: 0.000001
    })
  });
  if (resp.status !== 200) return { claimed: false };
  const buf = new Uint8Array(await resp.arrayBuffer());
  const tx = web3.VersionedTransaction.deserialize(buf);
  tx.sign([signer]);
  const sig = await conn.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
  await conn.confirmTransaction(sig, 'confirmed');
  return { claimed: true, sig };
}

async function jupSwapSOLtoToken(conn, signer, mint, lamportsIn, slippageBps) {
  if (lamportsIn <= 0) return null;
  const quoteUrl = new URL('https://quote-api.jup.ag/v6/quote');
  quoteUrl.searchParams.set('inputMint', SOL_MINT.toBase58());
  quoteUrl.searchParams.set('outputMint', mint.toBase58());
  quoteUrl.searchParams.set('amount', String(lamportsIn));
  quoteUrl.searchParams.set('slippageBps', String(slippageBps));
  const quoteResp = await fetch(quoteUrl);
  if (!quoteResp.ok) throw new Error('Jupiter quote failed');
  const quote = await quoteResp.json();
  const swapRes = await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userPublicKey: signer.publicKey.toBase58(),
      quoteResponse: quote,
      asLegacyTransaction: false
    })
  });
  if (!swapRes.ok) throw new Error('Jupiter swap build failed');
  const { swapTransaction } = await swapRes.json();
  const tx = web3.VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
  tx.sign([signer]);
  const sig = await conn.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
  await conn.confirmTransaction(sig, 'confirmed');
  return sig;
}

async function sendAllTokensToIncinerator(conn, signer, mint) {
  const srcATA = await spl.getOrCreateAssociatedTokenAccount(conn, signer, mint, signer.publicKey);
  const acc = await spl.getAccount(conn, srcATA.address);
  const bal = acc.amount;
  if (bal === 0n) return null;
  const destATA = await spl.getOrCreateAssociatedTokenAccount(
    conn, signer, mint, INCINERATOR, true, 'confirmed', spl.TOKEN_PROGRAM_ID
  );
  const ix = spl.createTransferInstruction(
    srcATA.address, destATA.address, signer.publicKey, bal, [], spl.TOKEN_PROGRAM_ID
  );
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  const msg = new web3.TransactionMessage({
    payerKey: signer.publicKey,
    recentBlockhash: blockhash,
    instructions: [ix]
  }).compileToV0Message();
  const vtx = new web3.VersionedTransaction(msg);
  vtx.sign([signer]);
  const sig = await conn.sendTransaction(vtx, { skipPreflight: false, maxRetries: 3 });
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

async function main() {
  if (!SECRET_B58) throw new Error('Missing SECRET_KEY_B58');
  if (!TOKEN_MINT_RAW) throw new Error('Missing TOKEN_MINT');
  const conn = new web3.Connection(RPC_URL, 'confirmed');
  const signer = web3.Keypair.fromSecretKey(bs58.decode(SECRET_B58));
  const mint = new web3.PublicKey(normalizeMint(TOKEN_MINT_RAW));
  let claimedSig = null;
  try {
    const claimed = await claimCreatorFees(conn, signer);
    if (claimed && claimed.sig) claimedSig = claimed.sig;
  } catch {}
  const balLamports = await conn.getBalance(signer.publicKey, 'confirmed');
  const bufferLamports = Math.ceil(SOL_BUFFER * web3.LAMPORTS_PER_SOL);
  const headroom = Math.ceil(0.002 * web3.LAMPORTS_PER_SOL);
  const spendable = balLamports - bufferLamports - headroom;
  let swapSig = null;
  if (spendable > 0) {
    try { swapSig = await jupSwapSOLtoToken(conn, signer, mint, spendable, SLIPPAGE_BPS); } catch {}
  }
  let burnSig = null;
  try { burnSig = await sendAllTokensToIncinerator(conn, signer, mint); } catch {}
  return { claimedSig, swapSig, burnSig };
}

module.exports = async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });
  try {
    const result = await main();
    res.status(200).json({ ok: true, ...result, time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e && e.message) || String(e) });
  }
};