// Solana wallet plumbing. Wallets that implement the Wallet Standard (Phantom, Backpack,
// Solflare, ...) are detected automatically, so no adapter list is needed.
// Devnet for now: the real on-chain mode is not live yet.

import { useMemo, type ReactNode } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import '@solana/wallet-adapter-react-ui/styles.css';

export const SOLANA_CLUSTER = 'devnet' as const;

export function WalletProviders({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => import.meta.env.VITE_SOLANA_RPC || clusterApiUrl(SOLANA_CLUSTER), []);
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
