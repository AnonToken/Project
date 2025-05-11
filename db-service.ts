import { neon, neonConfig } from "@neondatabase/serverless"
import { Pool } from "@neondatabase/serverless"

// Configure Neon for serverless environment
neonConfig.fetchConnectionCache = true

// Initialize database connection
let sql: ReturnType<typeof neon>
let pool: Pool

export interface TokenPool {
  tokenMint: string
  decimals: number
  poolAddress: string
  totalShielded: number
  totalUnshielded: number
  createdAt: Date
}

export interface PrivateBalance {
  id: number
  owner: string
  tokenMint: string
  balance: number
  lastCommitmentIndex: number
  updatedAt: Date
}

export interface Transaction {
  id: number
  owner: string
  type: "shield" | "send" | "unshield"
  tokenMint: string
  tokenSymbol: string
  amount: number
  timestamp: number
  recipient?: string
  signature: string
  createdAt: Date
}

/**
 * Initialize the database connection
 */
export function initializeDb(connectionString: string): void {
  try {
    sql = neon(connectionString)
    pool = new Pool({ connectionString })

    // Test the connection
    sql`SELECT NOW()`
      .then(() => {
        console.log("Database connected successfully")
      })
      .catch((err) => {
        console.error("Database connection error:", err)
      })
  } catch (error) {
    console.error("Failed to initialize database:", error)
  }
}

/**
 * Token Pool Operations
 */

/**
 * Check if a token pool exists
 */
export async function tokenPoolExists(tokenMint: string): Promise<boolean> {
  try {
    const result = await sql`SELECT * FROM token_pools WHERE token_mint = ${tokenMint}`
    return result.length > 0
  } catch (error) {
    console.error("Error checking if token pool exists:", error)
    return false
  }
}

/**
 * Get a token pool by mint address
 */
export async function getTokenPool(tokenMint: string): Promise<TokenPool | null> {
  try {
    const result = await sql`SELECT * FROM token_pools WHERE token_mint = ${tokenMint}`
    if (result.length === 0) {
      return null
    }

    const row = result[0]
    return {
      tokenMint: row.token_mint,
      decimals: row.decimals,
      poolAddress: row.pool_address,
      totalShielded: Number.parseFloat(row.total_shielded),
      totalUnshielded: Number.parseFloat(row.total_unshielded),
      createdAt: row.created_at,
    }
  } catch (error) {
    console.error("Error getting token pool:", error)
    return null
  }
}

/**
 * Create a new token pool
 */
export async function createTokenPool(tokenMint: string, decimals: number, poolAddress: string): Promise<TokenPool> {
  try {
    const result = await sql`
      INSERT INTO token_pools (token_mint, decimals, pool_address) 
      VALUES (${tokenMint}, ${decimals}, ${poolAddress}) 
      RETURNING *
    `

    const row = result[0]
    return {
      tokenMint: row.token_mint,
      decimals: row.decimals,
      poolAddress: row.pool_address,
      totalShielded: Number.parseFloat(row.total_shielded),
      totalUnshielded: Number.parseFloat(row.total_unshielded),
      createdAt: row.created_at,
    }
  } catch (error) {
    console.error("Error creating token pool:", error)
    throw error
  }
}

/**
 * Update token pool shielded amount
 */
export async function updateTokenPoolShielded(tokenMint: string, amount: number): Promise<void> {
  try {
    await sql`
      UPDATE token_pools 
      SET total_shielded = total_shielded + ${amount} 
      WHERE token_mint = ${tokenMint}
    `
  } catch (error) {
    console.error("Error updating token pool shielded amount:", error)
    throw error
  }
}

/**
 * Update token pool unshielded amount
 */
export async function updateTokenPoolUnshielded(tokenMint: string, amount: number): Promise<void> {
  try {
    await sql`
      UPDATE token_pools 
      SET total_unshielded = total_unshielded + ${amount} 
      WHERE token_mint = ${tokenMint}
    `
  } catch (error) {
    console.error("Error updating token pool unshielded amount:", error)
    throw error
  }
}

/**
 * Private Balance Operations
 */

/**
 * Get private balance for a user and token
 */
export async function getPrivateBalance(owner: string, tokenMint: string): Promise<PrivateBalance | null> {
  try {
    const result = await sql`
      SELECT * FROM private_balances 
      WHERE owner = ${owner} AND token_mint = ${tokenMint}
    `

    if (result.length === 0) {
      return null
    }

    const row = result[0]
    return {
      id: row.id,
      owner: row.owner,
      tokenMint: row.token_mint,
      balance: Number.parseFloat(row.balance),
      lastCommitmentIndex: row.last_commitment_index,
      updatedAt: row.updated_at,
    }
  } catch (error) {
    console.error("Error getting private balance:", error)
    return null
  }
}

/**
 * Get all private balances for a user
 */
export async function getAllPrivateBalances(owner: string): Promise<PrivateBalance[]> {
  try {
    const result = await sql`
      SELECT * FROM private_balances 
      WHERE owner = ${owner}
    `

    return result.map((row) => ({
      id: row.id,
      owner: row.owner,
      tokenMint: row.token_mint,
      balance: Number.parseFloat(row.balance),
      lastCommitmentIndex: row.last_commitment_index,
      updatedAt: row.updated_at,
    }))
  } catch (error) {
    console.error("Error getting all private balances:", error)
    return []
  }
}

/**
 * Update private balance
 */
export async function updatePrivateBalance(
  owner: string,
  tokenMint: string,
  amount: number,
  isAddition: boolean,
): Promise<PrivateBalance> {
  try {
    // Check if balance exists
    const existingBalance = await getPrivateBalance(owner, tokenMint)

    let result
    if (existingBalance) {
      // Update existing balance
      const currentBalance = existingBalance.balance
      const newBalance = isAddition ? currentBalance + amount : currentBalance - amount

      if (newBalance < 0) {
        throw new Error("Insufficient private balance")
      }

      result = await sql`
        UPDATE private_balances 
        SET balance = ${newBalance}, updated_at = NOW() 
        WHERE owner = ${owner} AND token_mint = ${tokenMint} 
        RETURNING *
      `
    } else if (isAddition) {
      // Create new balance
      result = await sql`
        INSERT INTO private_balances (owner, token_mint, balance, last_commitment_index) 
        VALUES (${owner}, ${tokenMint}, ${amount}, 0) 
        RETURNING *
      `
    } else {
      throw new Error("Cannot deduct from non-existent balance")
    }

    const row = result[0]
    return {
      id: row.id,
      owner: row.owner,
      tokenMint: row.token_mint,
      balance: Number.parseFloat(row.balance),
      lastCommitmentIndex: row.last_commitment_index,
      updatedAt: row.updated_at,
    }
  } catch (error) {
    console.error("Error updating private balance:", error)
    throw error
  }
}

/**
 * Transaction Operations
 */

/**
 * Record a new transaction
 */
export async function recordTransaction(
  owner: string,
  type: "shield" | "send" | "unshield",
  tokenMint: string,
  tokenSymbol: string,
  amount: number,
  signature: string,
  recipient?: string,
): Promise<Transaction> {
  try {
    const timestamp = Date.now()
    const result = await sql`
      INSERT INTO transactions 
      (owner, type, token_mint, token_symbol, amount, timestamp, recipient, signature) 
      VALUES (${owner}, ${type}, ${tokenMint}, ${tokenSymbol}, ${amount}, ${timestamp}, ${recipient}, ${signature})
      RETURNING *
    `

    const row = result[0]
    return {
      id: row.id,
      owner: row.owner,
      type: row.type as "shield" | "send" | "unshield",
      tokenMint: row.token_mint,
      tokenSymbol: row.token_symbol,
      amount: Number.parseFloat(row.amount),
      timestamp: row.timestamp,
      recipient: row.recipient,
      signature: row.signature,
      createdAt: row.created_at,
    }
  } catch (error) {
    console.error("Error recording transaction:", error)
    throw error
  }
}

/**
 * Get transactions for a user
 */
export async function getTransactions(owner: string, tokenMint?: string, limit = 50): Promise<Transaction[]> {
  try {
    let result

    if (tokenMint) {
      result = await sql`
        SELECT * FROM transactions 
        WHERE owner = ${owner} AND token_mint = ${tokenMint}
        ORDER BY timestamp DESC 
        LIMIT ${limit}
      `
    } else {
      result = await sql`
        SELECT * FROM transactions 
        WHERE owner = ${owner}
        ORDER BY timestamp DESC 
        LIMIT ${limit}
      `
    }

    return result.map((row) => ({
      id: row.id,
      owner: row.owner,
      type: row.type as "shield" | "send" | "unshield",
      tokenMint: row.token_mint,
      tokenSymbol: row.token_symbol,
      amount: Number.parseFloat(row.amount),
      timestamp: row.timestamp,
      recipient: row.recipient,
      signature: row.signature,
      createdAt: row.created_at,
    }))
  } catch (error) {
    console.error("Error getting transactions:", error)
    return []
  }
}

/**
 * Get transaction by signature
 */
export async function getTransactionBySignature(signature: string): Promise<Transaction | null> {
  try {
    const result = await sql`
      SELECT * FROM transactions 
      WHERE signature = ${signature}
    `

    if (result.length === 0) {
      return null
    }

    const row = result[0]
    return {
      id: row.id,
      owner: row.owner,
      type: row.type as "shield" | "send" | "unshield",
      tokenMint: row.token_mint,
      tokenSymbol: row.token_symbol,
      amount: Number.parseFloat(row.amount),
      timestamp: row.timestamp,
      recipient: row.recipient,
      signature: row.signature,
      createdAt: row.created_at,
    }
  } catch (error) {
    console.error("Error getting transaction by signature:", error)
    return null
  }
}
