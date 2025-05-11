import { initializeDb, createTokenPool, updatePrivateBalance, recordTransaction } from "./db-service"
import { PublicKey } from "@solana/web3.js"
import dotenv from "dotenv"

dotenv.config()

// Initialize database
initializeDb(process.env.DATABASE_URL || "")

// Sample data
const TOKENS = [
  {
    mint: "So11111111111111111111111111111111111111112", // Wrapped SOL
    symbol: "SOL",
    decimals: 9,
  },
  {
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    symbol: "USDC",
    decimals: 6,
  },
  {
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
    symbol: "BONK",
    decimals: 5,
  },
]

const TEST_USERS = [
  "8xxa243f8xyr7Kj3vdW8QJBaZJa9bnJ7EQvuDPxCYJXT", // Test user 1
  "5FHwkrdxntdK24hgQU8qgBjn35Y2HoDNBVd3kkQQ66jS", // Test user 2
]

async function seedData() {
  try {
    console.log("Seeding initial data...")

    // Create token pools
    for (const token of TOKENS) {
      const poolAddress = PublicKey.findProgramAddressSync(
        [Buffer.from("elusiv-pool"), Buffer.from(token.mint)],
        new PublicKey("ELUSivuoWqTBFUGvpKQQUFzaCxwQ4t9rnpPQpQGXALh"),
      )[0]

      await createTokenPool(token.mint, token.decimals, poolAddress.toString())
      console.log(`Created pool for ${token.symbol} (${token.mint})`)
    }

    // Create some private balances for test users
    for (const user of TEST_USERS) {
      for (const token of TOKENS) {
        const amount = token.symbol === "BONK" ? 1000000 : token.symbol === "USDC" ? 100 : 1
        await updatePrivateBalance(user, token.mint, amount, true)
        console.log(`Added ${amount} ${token.symbol} to ${user}`)

        // Record some sample transactions
        await recordTransaction(
          user,
          "shield",
          token.mint,
          token.symbol,
          amount,
          `seed-shield-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        )

        if (token.symbol === "SOL") {
          // Add a send transaction
          const recipient = TEST_USERS.find((u) => u !== user) || TEST_USERS[0]
          await updatePrivateBalance(user, token.mint, 0.1, false)
          await updatePrivateBalance(recipient, token.mint, 0.1, true)
          await recordTransaction(
            user,
            "send",
            token.mint,
            token.symbol,
            0.1,
            `seed-send-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            recipient,
          )
          console.log(`Added send transaction from ${user} to ${recipient}`)

          // Add an unshield transaction
          await updatePrivateBalance(user, token.mint, 0.2, false)
          await recordTransaction(
            user,
            "unshield",
            token.mint,
            token.symbol,
            0.2,
            `seed-unshield-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          )
          console.log(`Added unshield transaction for ${user}`)
        }
      }
    }

    console.log("Seeding completed successfully!")
    process.exit(0)
  } catch (error) {
    console.error("Error seeding data:", error)
    process.exit(1)
  }
}

seedData()
