import express from "express"
import cors from "cors"
import { Connection, PublicKey, Keypair, Transaction } from "@solana/web3.js"
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from "@solana/spl-token"
import dotenv from "dotenv"
import {
  initializeDb,
  tokenPoolExists,
  getTokenPool,
  createTokenPool,
  updateTokenPoolShielded,
  updateTokenPoolUnshielded,
  getAllPrivateBalances,
  updatePrivateBalance,
  recordTransaction,
  getTransactions,
} from "./db-service"

dotenv.config()

// Initialize Express app
const app = express()
app.use(cors())
app.use(express.json())

// Initialize database
initializeDb(process.env.DATABASE_URL || "")

// Initialize Solana connection
const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com")

// Initialize relayer keypair
const relayerKeypair = process.env.RELAYER_PRIVATE_KEY
  ? Keypair.fromSecretKey(Buffer.from(JSON.parse(process.env.RELAYER_PRIVATE_KEY)))
  : Keypair.generate() // Fallback for development

// Constants
const ELUSIV_PROGRAM_ID = new PublicKey(process.env.ELUSIV_PROGRAM_ID || "ELUSivuoWqTBFUGvpKQQUFzaCxwQ4t9rnpPQpQGXALh")
const POOL_SEED = "elusiv-pool"
const COMMITMENT_SEED = "elusiv-commitment"

// Helper functions
async function getPoolAddress(tokenMint: string): Promise<PublicKey> {
  const [poolAddress] = await PublicKey.findProgramAddress(
    [Buffer.from(POOL_SEED), Buffer.from(tokenMint)],
    ELUSIV_PROGRAM_ID,
  )
  return poolAddress
}

async function getOrCreateTokenPool(tokenMint: string, decimals: number): Promise<any> {
  // Check if pool exists
  const existingPool = await getTokenPool(tokenMint)
  if (existingPool) {
    return existingPool
  }

  // Create new pool
  const poolAddress = await getPoolAddress(tokenMint)
  return createTokenPool(tokenMint, decimals, poolAddress.toString())
}

// API Routes
// Check if pool exists
app.post("/pool/exists", async (req, res) => {
  try {
    const { tokenMint } = req.body

    if (!tokenMint) {
      return res.status(400).json({ error: "Token mint is required" })
    }

    const exists = await tokenPoolExists(tokenMint)
    return res.json({ exists })
  } catch (error) {
    console.error("Error checking pool:", error)
    return res.status(500).json({ error: "Internal server error" })
  }
})

// Create pool
app.post("/pool/create", async (req, res) => {
  try {
    const { tokenMint, decimals } = req.body

    if (!tokenMint || decimals === undefined) {
      return res.status(400).json({ error: "Token mint and decimals are required" })
    }

    // Create pool
    const pool = await getOrCreateTokenPool(tokenMint, decimals)

    return res.json({ success: true, pool })
  } catch (error) {
    console.error("Error creating pool:", error)
    return res.status(500).json({ error: "Internal server error" })
  }
})

// Get private balances
app.post("/balances", async (req, res) => {
  try {
    const { owner } = req.body

    if (!owner) {
      return res.status(400).json({ error: "Owner is required" })
    }

    const balances = await getAllPrivateBalances(owner)
    return res.json({ balances })
  } catch (error) {
    console.error("Error getting balances:", error)
    return res.status(500).json({ error: "Internal server error" })
  }
})

// Shield notification
app.post("/shield/notify", async (req, res) => {
  try {
    const { txSignature, tokenMint, amount, commitment, owner } = req.body

    if (!txSignature || !tokenMint || !amount || !commitment || !owner) {
      return res.status(400).json({ error: "Missing required parameters" })
    }

    // Verify transaction
    const tx = await connection.getTransaction(txSignature, { commitment: "confirmed" })

    if (!tx) {
      return res.status(400).json({ error: "Transaction not found" })
    }

    // Update private balance
    await updatePrivateBalance(owner, tokenMint, amount, true)

    // Update token pool shielded amount
    await updateTokenPoolShielded(tokenMint, amount)

    // Get token info for recording transaction
    let tokenSymbol = "UNKNOWN"
    const tokenPool = await getTokenPool(tokenMint)
    if (tokenPool) {
      // In a real implementation, you would get the token symbol from metadata
      tokenSymbol = tokenMint === "SOL" ? "SOL" : tokenMint.slice(0, 4)
    }

    // Record transaction
    await recordTransaction(owner, "shield", tokenMint, tokenSymbol, amount, txSignature)

    return res.json({ success: true })
  } catch (error) {
    console.error("Error processing shield notification:", error)
    return res.status(500).json({ error: "Internal server error" })
  }
})

// Send private tokens
app.post("/send", async (req, res) => {
  try {
    const { tokenMint, amount, recipient, proof, sender } = req.body

    if (!tokenMint || !amount || !recipient || !proof || !sender) {
      return res.status(400).json({ error: "Missing required parameters" })
    }

    // Verify proof (simplified for example)
    // In a real implementation, this would validate the ZK proof

    // Update sender's private balance
    await updatePrivateBalance(sender, tokenMint, amount, false)

    // Update recipient's private balance
    await updatePrivateBalance(recipient, tokenMint, amount, true)

    // Generate a simulated transaction signature
    const signature = `simulated-send-${Date.now()}`

    // Get token info for recording transaction
    let tokenSymbol = "UNKNOWN"
    const tokenPool = await getTokenPool(tokenMint)
    if (tokenPool) {
      // In a real implementation, you would get the token symbol from metadata
      tokenSymbol = tokenMint === "SOL" ? "SOL" : tokenMint.slice(0, 4)
    }

    // Record transaction
    await recordTransaction(sender, "send", tokenMint, tokenSymbol, amount, signature, recipient)

    return res.json({ success: true, signature })
  } catch (error) {
    console.error("Error sending private tokens:", error)
    return res.status(500).json({ error: error.message || "Internal server error" })
  }
})

// Unshield tokens
app.post("/unshield", async (req, res) => {
  try {
    const { tokenMint, amount, recipient, proof, sender } = req.body

    if (!tokenMint || !amount || !recipient || !proof || !sender) {
      return res.status(400).json({ error: "Missing required parameters" })
    }

    // Verify proof (simplified for example)
    // In a real implementation, this would validate the ZK proof

    // Update private balance
    await updatePrivateBalance(sender, tokenMint, amount, false)

    // Update token pool unshielded amount
    await updateTokenPoolUnshielded(tokenMint, amount)

    // Get pool info
    const pool = await getOrCreateTokenPool(tokenMint, 0) // Decimals will be updated if needed

    // Create transaction to transfer tokens from pool to recipient
    const transaction = new Transaction()

    if (tokenMint !== "SOL") {
      // Handle SPL token
      const mintPubkey = new PublicKey(tokenMint)
      const poolAddress = new PublicKey(pool.poolAddress)
      const recipientPubkey = new PublicKey(recipient)

      // Get or create associated token account for the recipient
      const recipientAta = await getAssociatedTokenAddress(mintPubkey, recipientPubkey)

      // Check if recipient ATA exists, if not create it
      const recipientAtaInfo = await connection.getAccountInfo(recipientAta)
      if (!recipientAtaInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(relayerKeypair.publicKey, recipientAta, recipientPubkey, mintPubkey),
        )
      }

      // Add transfer instruction (simplified for example)
      // In a real implementation, this would use the Token Program's transfer instruction
    } else {
      // Handle SOL transfer (simplified for example)
      // In a real implementation, this would transfer SOL from the pool to the recipient
    }

    // Sign and send transaction (simplified for example)
    // In a real implementation, this would actually send the transaction
    const signature = `simulated-unshield-${Date.now()}`

    // Get token info for recording transaction
    let tokenSymbol = "UNKNOWN"
    const tokenPool = await getTokenPool(tokenMint)
    if (tokenPool) {
      // In a real implementation, you would get the token symbol from metadata
      tokenSymbol = tokenMint === "SOL" ? "SOL" : tokenMint.slice(0, 4)
    }

    // Record transaction
    await recordTransaction(sender, "unshield", tokenMint, tokenSymbol, amount, signature)

    return res.json({ success: true, signature })
  } catch (error) {
    console.error("Error unshielding tokens:", error)
    return res.status(500).json({ error: error.message || "Internal server error" })
  }
})

// Get transaction history
app.post("/transactions", async (req, res) => {
  try {
    const { owner, tokenMint, limit } = req.body

    if (!owner) {
      return res.status(400).json({ error: "Owner is required" })
    }

    const transactions = await getTransactions(owner, tokenMint, limit || 50)
    return res.json({ transactions })
  } catch (error) {
    console.error("Error getting transactions:", error)
    return res.status(500).json({ error: "Internal server error" })
  }
})

// Start server
const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Relayer running on port ${PORT}`)
})

export default app
