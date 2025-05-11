-- Create token_pools table
CREATE TABLE IF NOT EXISTS token_pools (
  id SERIAL PRIMARY KEY,
  token_mint TEXT NOT NULL UNIQUE,
  decimals INTEGER NOT NULL DEFAULT 9,
  pool_address TEXT NOT NULL,
  total_shielded DECIMAL(36, 18) NOT NULL DEFAULT 0,
  total_unshielded DECIMAL(36, 18) NOT NULL DEFAULT 0,
  symbol TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create private_balances table
CREATE TABLE IF NOT EXISTS private_balances (
  id SERIAL PRIMARY KEY,
  owner TEXT NOT NULL,
  token_mint TEXT NOT NULL,
  balance DECIMAL(36, 18) NOT NULL DEFAULT 0,
  last_commitment_index INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner, token_mint)
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  owner TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('shield', 'send', 'unshield')),
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  amount DECIMAL(36, 18) NOT NULL,
  timestamp BIGINT NOT NULL,
  recipient TEXT,
  signature TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_private_balances_owner ON private_balances(owner);
CREATE INDEX IF NOT EXISTS idx_transactions_owner ON transactions(owner);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);
